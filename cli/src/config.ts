import type { Address } from "viem";
import { STOCK_INDICES, methodologyFile, type StockIndex } from "../../src/components/docs/content/silicon-markets/indices";
import { deployments, type Deployment } from "../../src/data/deployments";
import { networks, type Network } from "../../src/data/networks";
import { STOCK_TICKERS, stockFeed } from "../../src/data/stock-feeds";
import { HOSTS } from "../../src/lib/hosts";

// What the CLI reads (SPEC 3.8), taken from the app's own data layer so the two can never differ:
// the stock feeds (src/data/stock-feeds.ts), the four stage indices' baskets (the docs' indices.ts),
// the recorded deployments (src/data/deployments.ts) and the public hosts (src/lib/hosts.ts).

export const VERSION = "0.2.0";

export const MAINNET: Network = networks.mainnet;
export const TESTNET: Network = networks.testnet;

export const GATEWAY_HEALTH = `https://${HOSTS.app}/v1/health`;
export const DOCS_ORIGIN = `https://${HOSTS.docs}`;
export const SOURCIFY = "https://sourcify.dev/server/v2/contract";

export interface Feed {
  ticker: string;
  /** The stage of the chip supply chain, as the index the stock sits in names it. */
  stage: string;
  address: Address;
}

const stageOf = (ticker: string): string => STOCK_INDICES.find((x) => x.basket.some((s) => s.ticker === ticker))?.stage ?? "";

/** The seven Chainlink stock feeds on mainnet, in the Reserve's order (SPEC 3.2a). */
export const FEEDS: Feed[] = STOCK_TICKERS.map((ticker) => {
  const address = stockFeed(MAINNET, ticker);
  if (!address) throw new Error(`no mainnet feed recorded for ${ticker}`);
  return { ticker, stage: stageOf(ticker), address };
});

export const INDICES: StockIndex[] = STOCK_INDICES;

/** An index by its symbol or slug, any case ("kmemory" finds kMEMORY). */
export const indexOf = (name: string): StockIndex | undefined =>
  INDICES.find((x) => x.symbol.toLowerCase() === name.toLowerCase() || x.slug === name.toLowerCase());

export const methodologyUrl = (x: StockIndex) => DOCS_ORIGIN + methodologyFile(x.slug);
export const indexDocsUrl = (x: StockIndex) => `${DOCS_ORIGIN}/silicon-markets/${x.slug}`;

export interface Contract {
  name: string;
  address: Address;
}

/** The Kyzen Network contracts the recorded mainnet deployment names; empty before one is recorded. */
export function contractsOf(d: Deployment | undefined): Contract[] {
  if (!d) return [];
  return [
    { name: "$KYZN token", address: d.token },
    { name: "Reserve", address: d.reserve },
    { name: "Staking", address: d.staking },
    { name: "Weight registry", address: d.weightRegistry },
    { name: "Gateway settlement", address: d.gateway },
  ];
}

/**
 * The two owner transactions that deployed Silicon on mainnet (2026-10-16): the kit, then the deployment
 * contract that made everything else. Neither is in the recorded deployment's address list.
 */
export const SILICON_DEPLOYERS: Contract[] = [
  { name: "Silicon kit", address: "0xE726f9018fA8b650BfD031001fcfA61f685f8569" },
  { name: "Silicon deployment", address: "0x614C7f1e9bc345c9e2D809d122999731665d0484" },
];

const SYMBOLS = ["kDESIGN", "kMEMORY", "kFAB", "kEQUIP"];

/** The Silicon contracts the recorded mainnet deployment names (silicon.* keys); empty before Silicon is recorded. */
export function siliconContractsOf(d: Deployment | undefined): Contract[] {
  const o = d?.other ?? {};
  if (!o["silicon.vault"]) return [];
  const named: [string, string][] = [
    ["Silicon vault", "silicon.vault"],
    ["$KYZN oracle", "silicon.oracle"],
    ["Market calendar", "silicon.calendar"],
    ["Silicon fee router", "silicon.feeRouter"],
    ["Silicon swap adapter", "silicon.swapAdapter"],
  ];
  const list: Contract[] = named.filter(([, k]) => o[k]).map(([name, k]) => ({ name, address: o[k] as Address }));
  for (let i = 0; o[`silicon.markets.${i}.synth`]; i++) {
    const symbol = SYMBOLS[i] ?? `market ${i}`;
    list.push({ name: `${symbol} synth`, address: o[`silicon.markets.${i}.synth`] as Address });
    list.push({ name: `${symbol} index feed`, address: o[`silicon.markets.${i}.feed`] as Address });
  }
  return SILICON_DEPLOYERS.concat(list);
}

export const CONTRACTS: Contract[] = contractsOf(deployments[MAINNET.chainId]);
export const SILICON_CONTRACTS: Contract[] = siliconContractsOf(deployments[MAINNET.chainId]);
