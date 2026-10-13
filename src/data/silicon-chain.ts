import { formatUnits, getAddress, numberToHex, type Address, type PublicClient } from "viem";
import { aggregatorAbi } from "./abi/aggregator";
import { kyznUsdOracleAbi } from "./abi/kyznUsdOracle";
import { siliconSynthAbi } from "./abi/siliconSynth";
import { siliconVaultAbi } from "./abi/siliconVault";
import { stockIndexFeedAbi } from "./abi/stockIndexFeed";
import { Batch, type Slot } from "./multicall";
import type { Network } from "./networks";
import { componentTicker, type SiliconDeployment } from "./silicon";
import type { SiliconComponent, SiliconMarket, SiliconPendingSetting, SiliconSetting, SiliconState } from "./types";

// The Silicon half of the chain provider's snapshot (SPEC 3.5): the vault's settings, the oracle's
// $KYZN price and each index market, over Multicall3 in three steps:
//   1. the vault's links and settings and its queued changes, the oracle, and per market its vault
//      record and queued changes, its synth's name and symbol and its feed's price, freshness,
//      pause and basket size;
//   2. each basket's components, and the breaker's flags for each (jumped(i), needsClear(i));
//   3. the description of every component feed the deployment's stockFeeds keys do not name.
// What the chain cannot answer for a market (the index price, a freshness flag, the basket)
// becomes null, false or empty in that market and the snapshot is still returned. A breaker flag
// that cannot be read counts as stopped. What says the RPC is not the recorded deployment (a vault
// or a market of another chain) throws, as the rest of the snapshot does.
//
// latestPrice() does not consult the breaker: a component the breaker stopped still answers its
// last round. So a stopped market's price is not shown (null), and it is not counted.

const ZERO = BigInt(0);
const E18 = BigInt(10) ** BigInt(18);
/** StockIndexFeed.MAX_COMPONENTS is 4; a feed that claims far more is not one of ours. */
const MAX_COMPONENTS = 16;

const units = (value: bigint): number => Number(formatUnits(value, 18));

/** The settings the vault queues once positions can feel them, by SiliconVault's SETTING_ bit; per market (by id) or vault-wide (id 0). */
const MARKET_SETTINGS: [SiliconSetting, number][] = [["borrowFee", 2], ["liquidationPenalty", 4], ["feed", 128]];
const VAULT_SETTINGS: [SiliconSetting, number][] = [["auctionDuration", 16], ["auctionStartPremium", 32], ["auctionFloor", 256], ["feeRouter", 64]];
const ADDRESS_SETTINGS: readonly SiliconSetting[] = ["feed", "feeRouter"];

export interface SiliconRead {
  state: SiliconState;
  /**
   * Each market's total debt at its index price, summed (SPEC 3.5); 0 with nothing owed. Null
   * while a market that owes synth has no usable price (none, or stopped): never a partial sum.
   */
  mintedUsd: number | null;
}

export async function readSilicon(
  client: PublicClient,
  network: Network,
  kyzn: Address,
  dep: SiliconDeployment,
  source: string,
  warn: (message: string) => void,
): Promise<SiliconRead> {
  const mismatch = (label: string, found: string, expected: string) =>
    new Error(
      `chain provider (${network.name}): ${label} is ${found}, not the recorded deployment's ${expected}: ` +
        `the RPC (${source}) does not serve the deployment in src/data/deployments.ts`,
    );

  // 1. The vault, the oracle, and each market's record, synth and feed.
  const first = new Batch();
  const links = [
    { slot: first.read("Silicon vault kyzn", dep.vault, siliconVaultAbi, "kyzn"), expected: kyzn },
    { slot: first.read("Silicon vault usdg", dep.vault, siliconVaultAbi, "usdg"), expected: dep.usdg },
    { slot: first.read("Silicon vault oracle", dep.vault, siliconVaultAbi, "oracle"), expected: dep.oracle },
  ];
  const floor = first.read("Silicon vault auctionFloorBps", dep.vault, siliconVaultAbi, "auctionFloorBps");
  const premium = first.read("Silicon vault auctionStartPremiumBps", dep.vault, siliconVaultAbi, "auctionStartPremiumBps");
  const duration = first.read("Silicon vault auctionDuration", dep.vault, siliconVaultAbi, "auctionDuration");
  const router = first.read("Silicon vault feeRouter", dep.vault, siliconVaultAbi, "feeRouter");
  // A vault deployed before the setting delay has no pendingSettings: its reads fail and list nothing.
  const pendingOf = (settings: [SiliconSetting, number][], id: number) =>
    settings.map(([setting, bit]) => ({
      setting,
      slot: first.read(`Silicon vault pendingSettings(${bit}, ${id})`, dep.vault, siliconVaultAbi, "pendingSettings", [bit, BigInt(id)]),
    }));
  const vaultPending = pendingOf(VAULT_SETTINGS, 0);
  // Reverts while the oracle has no average or no fresh ETH/USD answer.
  const kyznUsd = first.read("Silicon oracle price", dep.oracle, kyznUsdOracleAbi, "price");
  const reads = dep.markets.map((m) => ({
    m,
    record: first.read(`Silicon vault market(${m.id})`, dep.vault, siliconVaultAbi, "market", [BigInt(m.id)]),
    pending: pendingOf(MARKET_SETTINGS, m.id),
    name: first.read(`name of ${m.synth}`, m.synth, siliconSynthAbi, "name"),
    symbol: first.read(`symbol of ${m.synth}`, m.synth, siliconSynthAbi, "symbol"),
    latest: first.read(`latestPrice of ${m.feed}`, m.feed, stockIndexFeedAbi, "latestPrice"),
    fresh: first.read(`isFresh of ${m.feed}`, m.feed, stockIndexFeedAbi, "isFresh"),
    freshForLiquidation: first.read(`isFreshForLiquidation of ${m.feed}`, m.feed, stockIndexFeedAbi, "isFreshForLiquidation"),
    paused: first.read(`paused of ${m.feed}`, m.feed, stockIndexFeedAbi, "paused"),
    count: first.read(`componentCount of ${m.feed}`, m.feed, stockIndexFeedAbi, "componentCount"),
  }));
  const r1 = await first.send(client, network);
  let unlisted = false;
  const listed = (reads: ReturnType<typeof pendingOf>): SiliconPendingSetting[] =>
    reads.flatMap(({ setting, slot }) => {
      const found = r1.find(slot);
      if (found === undefined) {
        unlisted = true;
        return [];
      }
      const [value, effectiveAt] = found;
      if (effectiveAt === ZERO) return [];
      const address = ADDRESS_SETTINGS.includes(setting);
      return [{ setting, value: address ? null : Number(value), address: address ? getAddress(numberToHex(value, { size: 20 })) : null, effectiveAt: Number(effectiveAt) }];
    });
  for (const { slot, expected } of links) {
    const found = r1.get(slot);
    if (found.toLowerCase() !== expected.toLowerCase()) throw mismatch(slot.label, found, expected);
  }
  const records = reads.map((x) => {
    const record = r1.get(x.record);
    for (const [what, found, expected] of [
      ["synth", record.synth, x.m.synth],
      ["feed", record.feed, x.m.feed],
    ] as const) {
      if (found.toLowerCase() !== expected.toLowerCase()) throw mismatch(`Silicon market ${x.m.id} ${what}`, found, expected);
    }
    return record;
  });

  // 2. Each basket's components and the breaker's flag for each. A basket that cannot be read
  // (null) leaves the breaker unread too.
  const second = new Batch();
  const baskets = reads.map((x) => {
    const n = r1.find(x.count);
    if (n === undefined) {
      warn(`Silicon market ${x.m.id} (${x.m.feed}): its basket size could not be read; no components are shown and it reads as stopped`);
      return null;
    }
    if (n > BigInt(MAX_COMPONENTS)) {
      warn(`Silicon market ${x.m.id} (${x.m.feed}): its feed lists ${n} components, more than ${MAX_COMPONENTS}; none are shown and it reads as stopped`);
      return null;
    }
    return Array.from({ length: Number(n) }, (_, i) => ({
      component: second.read(`component(${i}) of ${x.m.feed}`, x.m.feed, stockIndexFeedAbi, "component", [BigInt(i)]),
      jumped: second.read(`jumped(${i}) of ${x.m.feed}`, x.m.feed, stockIndexFeedAbi, "jumped", [BigInt(i)]),
      needsClear: second.read(`needsClear(${i}) of ${x.m.feed}`, x.m.feed, stockIndexFeedAbi, "needsClear", [BigInt(i)]),
    }));
  });
  const r2 = await second.send(client, network);
  const basketOf = baskets.map((slots, i) =>
    (slots ?? []).flatMap(({ component: slot }) => {
      const component = r2.find(slot);
      if (component === undefined) warn(`Silicon market ${reads[i].m.id}: ${slot.label} could not be read; it is left out of the basket`);
      return component === undefined ? [] : [{ feed: component[0], quantity: component[2] }];
    }),
  );
  // Stopped: a component the breaker stopped (jumped), or a flag or a basket that cannot be read.
  const stoppedOf = baskets.map((slots, i) =>
    slots === null
      ? true
      : slots.some(({ jumped }) => {
          const found = r2.find(jumped);
          if (found === undefined) warn(`Silicon market ${reads[i].m.id}: ${jumped.label} could not be read; the market reads as stopped`);
          return found !== false;
        }),
  );
  // Waiting for the guardian: a component stopped after a quantity change. Any other stop may be a
  // backlog a sync takes, so only this one names the guardian; a flag that cannot be read claims nothing.
  const needsClearOf = baskets.map((slots, i) =>
    (slots ?? []).some(({ needsClear }) => {
      const found = r2.find(needsClear);
      if (found === undefined) warn(`Silicon market ${reads[i].m.id}: ${needsClear.label} could not be read; read as false`);
      return found === true;
    }),
  );

  // 3. The description of each component feed the deployment does not name.
  const third = new Batch();
  const described = new Map<string, Slot<string>>();
  for (const basket of basketOf) {
    for (const { feed } of basket) {
      const key = feed.toLowerCase();
      if (dep.tickers[key] === undefined && !described.has(key)) {
        described.set(key, third.read(`description of ${feed}`, feed, aggregatorAbi, "description"));
      }
    }
  }
  const r3 = await third.send(client, network);

  // The market views. "Minted synthetics" (SPEC 5.4) is the synth positions owe (totalDebt) at the
  // index price. Synth owed by running auctions (auctionDebt) and by no one (badDebt) is not counted:
  // it is no longer any position's mint. One market with debt and no usable price leaves the total
  // unknown (null), never a partial sum.
  let minted: bigint | null = ZERO;
  const markets: SiliconMarket[] = reads.map((x, i) => {
    const record = records[i];
    const symbol = r1.get(x.symbol);
    const [index, updatedAt] = r1.find(x.latest) ?? [undefined, undefined];
    if (index === undefined) warn(`Silicon ${symbol}: no index price could be read from its feed ${x.m.feed}`);
    const stopped = stoppedOf[i];
    // (0, 0) is the feed before its first price; a component it cannot read gives the same. A
    // stopped market's latestPrice is a round the breaker has not accepted: no price.
    const priced = index !== undefined && updatedAt !== undefined && index > ZERO && !stopped;
    if (record.totalDebt > ZERO) minted = priced && minted !== null ? minted + (record.totalDebt * index) / E18 : null;
    const flag = (slot: Slot<boolean>, what: string) => {
      const found = r1.find(slot);
      if (found === undefined) warn(`Silicon ${symbol}: ${what} could not be read from its feed; read as false`);
      return found === true;
    };
    const components: SiliconComponent[] = basketOf[i].map(({ feed, quantity }) => {
      const slot = described.get(feed.toLowerCase());
      return { ticker: componentTicker(feed, slot ? r3.find(slot) : undefined, dep.tickers), feed, quantity: units(quantity) };
    });
    return {
      id: x.m.id,
      symbol,
      name: r1.get(x.name),
      synth: x.m.synth,
      feed: x.m.feed,
      open: record.open,
      mintsPaused: record.mintsPaused,
      price: priced ? units(index) : null,
      priceUpdatedAt: priced ? Number(updatedAt) : null,
      fresh: flag(x.fresh, "isFresh"),
      freshForLiquidation: flag(x.freshForLiquidation, "isFreshForLiquidation"),
      stopped,
      needsClear: needsClearOf[i],
      paused: flag(x.paused, "paused"),
      components,
      mintFeeBps: Number(record.mintFeeBps),
      borrowFeeBpsPerYear: Number(record.borrowFeeBpsPerYear),
      liquidationPenaltyBps: Number(record.liquidationPenaltyBps),
      debtCeiling: units(record.debtCeiling),
      totalDebt: units(record.totalDebt),
      minDebt: units(record.minDebt),
      auctionDebt: units(record.auctionDebt),
      badDebt: units(record.badDebt),
      wei: {
        debtCeiling: String(record.debtCeiling),
        totalDebt: String(record.totalDebt),
        minDebt: String(record.minDebt),
        auctionDebt: String(record.auctionDebt),
        badDebt: String(record.badDebt),
      },
      pending: listed(x.pending),
    };
  });
  const pending = listed(vaultPending);
  if (unlisted) warn("Silicon: the vault's queued settings could not be read (a vault without pendingSettings); none are listed");
  const feeRouter = r1.find(router);
  if (feeRouter === undefined) warn("Silicon: the vault's fee router could not be read");

  const price = r1.find(kyznUsd);
  if (price === undefined) warn("Silicon: the oracle has no $KYZN price to give (no average yet, or no fresh ETH/USD answer)");
  return {
    state: {
      vault: dep.vault,
      usdg: dep.usdg,
      kyznUsd: price === undefined ? null : units(price),
      auctionFloorBps: Number(r1.get(floor)),
      auctionStartPremiumBps: Number(r1.get(premium)),
      auctionDuration: Number(r1.get(duration)),
      feeRouter: feeRouter ?? null,
      pending,
      markets,
    },
    mintedUsd: minted === null ? null : units(minted),
  };
}
