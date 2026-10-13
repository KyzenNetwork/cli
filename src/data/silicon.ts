import type { Address } from "viem";
import type { Deployment } from "./deployments";

// What the data layer knows of Silicon (SPEC 3.5) without reading the chain: the vault, the
// oracle, USDG and each market's synth and index feed, from the recorded deployment
// (scripts/sync-deployments.mjs flattens contracts/deployments/<chainId>.json's `silicon` object
// into `other["silicon.*"]`), and the ticker a component feed's description names. Client-safe: the
// chain provider and the wallet provider both use it.

/** Market N of the vault: the synth and the index feed the deployment records for it. */
export interface SiliconMarketDeployment {
  /** The vault's market id: its position in the deployment's markets list. */
  id: number;
  synth: Address;
  feed: Address;
}

export interface SiliconDeployment {
  vault: Address;
  oracle: Address;
  usdg: Address;
  /** By id, ascending. */
  markets: SiliconMarketDeployment[];
  /** A stock feed's tickers by its lowercase address, from the silicon.stockFeeds.<TICKER> keys. */
  tickers: Readonly<Record<string, string>>;
}

const MARKET_KEY = /^silicon\.markets\.(\d+)\.(synth|feed)$/;
const STOCK_FEED_KEY = /^silicon\.stockFeeds\.(.+)$/;

/**
 * The Silicon addresses a deployment records, or null when it records no vault, oracle and USDG:
 * mainnet until the owner deploys Silicon there. A market missing its synth or its feed is left out.
 */
export function siliconDeployment(a: Deployment): SiliconDeployment | null {
  const vault = a.other["silicon.vault"];
  const oracle = a.other["silicon.oracle"];
  const usdg = a.other["silicon.usdg"];
  if (!vault || !oracle || !usdg) return null;
  const parts = new Map<number, { synth?: Address; feed?: Address }>();
  const tickers: Record<string, string> = {};
  for (const [key, value] of Object.entries(a.other)) {
    const market = MARKET_KEY.exec(key);
    if (market) {
      const id = Number(market[1]);
      parts.set(id, Object.assign({}, parts.get(id), { [market[2]]: value }));
      continue;
    }
    const stock = STOCK_FEED_KEY.exec(key);
    if (stock) tickers[value.toLowerCase()] = stock[1];
  }
  const markets: SiliconMarketDeployment[] = [];
  parts.forEach(({ synth, feed }, id) => {
    if (synth && feed) markets.push({ id, synth, feed });
  });
  markets.sort((x, y) => x.id - y.id);
  return { vault, oracle, usdg, markets, tickers };
}

/** The stocks Silicon baskets are made of (the Reserve's list, SPEC 3.2a), checked before a prefix is cut. */
const KNOWN_TICKERS: readonly string[] = ["NVDA", "AMD", "MU", "SNDK", "TSM", "INTC", "ASML"];
/** Robinhood's stock-token feeds carry the ticker behind this prefix. */
const TOKEN_PREFIX = "RH";

/**
 * The ticker a component feed's description() names, or null when it names none. The formats:
 *   "NVDA / USD testnet stand-in"  the testnet stand-in feeds
 *   "RHNVDA / USD"                 a Robinhood stock-token feed
 *   "Robinhood TSM / USD"          a Robinhood stock-token feed
 * It reads what stands before the first "/". A listed stock in it, with or without the "RH" prefix,
 * is the answer. Otherwise a single word is the ticker (without the prefix when two or more letters
 * remain), and several words are a description that names none.
 */
export function tickerFromDescription(description: string): string | null {
  const head = description.split("/")[0].trim();
  const words = head.toUpperCase().split(/\s+/);
  for (const word of words) {
    if (KNOWN_TICKERS.includes(word)) return word;
    if (word.startsWith(TOKEN_PREFIX) && KNOWN_TICKERS.includes(word.slice(TOKEN_PREFIX.length))) return word.slice(TOKEN_PREFIX.length);
  }
  const named = words.filter((word) => word !== "ROBINHOOD");
  if (named.length !== 1 || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(named[0])) return null;
  const word = named[0];
  return word.startsWith(TOKEN_PREFIX) && word.length >= TOKEN_PREFIX.length + 2 ? word.slice(TOKEN_PREFIX.length) : word;
}

/**
 * A component's ticker: the deployment's stockFeeds key for its address first, then what its
 * description names, else the feed's address (as the Reserve's list falls back to a token's address).
 */
export function componentTicker(feed: Address, description: string | undefined, tickers: Readonly<Record<string, string>>): string {
  return tickers[feed.toLowerCase()] ?? (description === undefined ? null : tickerFromDescription(description)) ?? feed;
}
