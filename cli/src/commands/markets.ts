import { siliconDeployment } from "../../../src/data/silicon";
import { readSilicon } from "../../../src/data/silicon-chain";
import type { SiliconMarket, SiliconState } from "../../../src/data/types";
import { MAINNET } from "../config";
import type { Context } from "../context";
import { bold, dim, down, heading, out, table, up, usd, warn } from "../ui";

// `kyzen markets`: the four Silicon markets on mainnet (SPEC 3.5), read from the vault and the index
// feeds now: each synth, its index level, its limit and what is minted against it, and whether the
// market is open and minting.

/** The Silicon vault and its markets on mainnet, or null where no Silicon deployment is recorded. */
export async function mainnetSilicon(ctx: Context): Promise<SiliconState | null> {
  const a = ctx.network.addresses;
  const dep = a ? siliconDeployment(a) : null;
  if (!a || !dep) return null;
  const { state } = await readSilicon(ctx.client, ctx.network, a.token, dep, ctx.network.rpcUrl, () => undefined);
  return state;
}

/** A market's state in one word: open and minting, open outside the mint window, stopped, or closed. */
export function marketStatus(m: SiliconMarket): string {
  if (!m.open) return warn("CLOSED");
  if (m.stopped || m.paused || m.mintsPaused) return down("STOPPED");
  return m.fresh ? up("OPEN · MINTING") : up("OPEN") + dim(" · mints in the window");
}

const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

export async function markets(ctx: Context): Promise<number> {
  const s = await mainnetSilicon(ctx);
  out(heading("Markets · kSynthetics"));
  out(dim(`Silicon vault on Robinhood Chain ${MAINNET.chainId}, read now`));
  out();
  if (!s) {
    out("No Silicon deployment is recorded on mainnet.");
    return 1;
  }
  const rows = [["SYNTH", "INDEX", "LIMIT", "MINTED", "STATUS", "ADDRESS"].map(dim)];
  for (const m of s.markets) {
    const level = m.price === null ? dim("n/a") : usd(m.price);
    const limit = m.price === null ? dim("n/a") : usd(m.debtCeiling * m.price);
    const minted = m.price === null ? dim("n/a") : usd((m.totalDebt + m.auctionDebt + m.badDebt) * m.price);
    rows.push([bold(m.symbol), level, limit, minted, marketStatus(m), dim(m.synth)]);
  }
  out(table(rows, ["left", "right", "right", "right", "left", "left"]));
  out();
  const first = s.markets[0];
  if (first) {
    out(`${dim("Fees")}        mint ${pct(first.mintFeeBps)} · borrow ${pct(first.borrowFeeBpsPerYear)} a year · liquidation penalty ${pct(first.liquidationPenaltyBps)}`);
    out(`${dim("Minimum")}     ${first.price === null ? "n/a" : usd(first.minDebt * first.price)} of synth per position`);
  }
  out(`${dim("Collateral")}  $KYZN and USDG, at least half $KYZN, 150% of the debt`);
  out(`${dim("$KYZN")}       ${s.kyznUsd === null ? warn("the oracle is gathering its 24 hours of observations") : `${usd(s.kyznUsd)} ${dim("(oracle: the lower of the 1 h and 24 h pool averages)")}`}`);
  out(`${dim("Mints")}       Monday to Friday, 14:30 to 20:00 UTC, closed on exchange holidays`);
  out();
  out(dim("Index level: the basket's Chainlink prices, $100 at deployment. Limit and minted at that level. Docs: https://docs.kyzen.network/silicon-markets"));
  return 0;
}
