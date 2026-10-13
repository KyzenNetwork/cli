import type { Address } from "viem";
import { STOCK_INDICES, methodologyFile, type StockIndex } from "../../src/components/docs/content/silicon-markets/indices";
import { deployments, type Deployment } from "../../src/data/deployments";
import { networks, type Network } from "../../src/data/networks";
import { STOCK_TICKERS, stockFeed } from "../../src/data/stock-feeds";
import { HOSTS } from "../../src/lib/hosts";

// What the CLI reads (SPEC 3.8), taken from the app's own data layer so the two can never differ:
// the stock feeds (src/data/stock-feeds.ts), the four stage indices' baskets (the docs' indices.ts),
// the recorded deployments (src/data/deployments.ts) and the public hosts (src/lib/hosts.ts).

export const VERSION = "0.1.0";

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

export const CONTRACTS: Contract[] = contractsOf(deployments[MAINNET.chainId]);
