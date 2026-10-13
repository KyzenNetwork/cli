import type { PublicClient } from "viem";
import { aggregatorAbi } from "../../src/data/abi/aggregator";
import { aggOf, phaseOf, roundId } from "../../src/data/history";
import { Batch } from "../../src/data/multicall";
import type { Network } from "../../src/data/networks";
import type { Feed } from "./config";

// Chainlink rounds of the seven stock feeds: the latest round of each, and the rounds before it,
// read in two Multicall3 calls whatever the number of feeds.

export interface Round {
  /** The proxy's round id: the phase in the top bits over the round's number in the phase. */
  id: bigint;
  price: number;
  /** Unix seconds. */
  updatedAt: number;
}

export interface FeedRounds {
  feed: Feed;
  /** Oldest first, the latest last; empty when the feed could not be read. */
  rounds: Round[];
}

const asRound = (id: bigint, answer: bigint, updatedAt: bigint, decimals: number): Round | null =>
  updatedAt > BigInt(0) && answer > BigInt(0) ? { id, price: Number(answer) / 10 ** decimals, updatedAt: Number(updatedAt) } : null;

/** Each feed's latest round and up to `history - 1` rounds before it, in its latest round's phase. */
export async function readRounds(client: PublicClient, network: Network, feeds: Feed[], history: number): Promise<FeedRounds[]> {
  const first = new Batch();
  const heads = feeds.map((f) => ({
    latest: first.read(`latestRoundData of ${f.ticker}`, f.address, aggregatorAbi, "latestRoundData"),
    decimals: first.read(`decimals of ${f.ticker}`, f.address, aggregatorAbi, "decimals"),
  }));
  const r1 = await first.send(client, network);

  const second = new Batch();
  const tails = heads.map((h, i) => {
    const latest = r1.find(h.latest);
    const decimals = r1.find(h.decimals);
    if (!latest || decimals === undefined) return null;
    const phase = phaseOf(latest[0]);
    const agg = aggOf(latest[0]);
    const ids: bigint[] = [];
    for (let k = BigInt(history - 1); k >= BigInt(1); k -= BigInt(1)) if (agg > k) ids.push(roundId(phase, agg - k));
    const slots = ids.map((id) => ({ id, slot: second.read(`getRoundData ${id} of ${feeds[i].ticker}`, feeds[i].address, aggregatorAbi, "getRoundData", [id]) }));
    return { latest, decimals: Number(decimals), slots };
  });
  const r2 = await second.send(client, network);

  return feeds.map((feed, i) => {
    const t = tails[i];
    if (!t) return { feed, rounds: [] };
    const rounds: Round[] = [];
    for (const { id, slot } of t.slots) {
      const data = r2.find(slot);
      const r = data ? asRound(id, data[1], data[3], t.decimals) : null;
      if (r) rounds.push(r);
    }
    const latest = asRound(t.latest[0], t.latest[1], t.latest[3], t.decimals);
    if (latest) rounds.push(latest);
    return { feed, rounds };
  });
}

/** The rounds of one feed from `fromAgg` to `toAgg` in `phase`, in one Multicall3 call; unreadable ones left out. */
export async function readRange(client: PublicClient, network: Network, feed: Feed, phase: bigint, fromAgg: bigint, toAgg: bigint, decimals: number): Promise<Round[]> {
  const ids: bigint[] = [];
  for (let a = fromAgg; a <= toAgg; a += BigInt(1)) ids.push(roundId(phase, a));
  const b = new Batch();
  const slots = ids.map((id) => ({ id, slot: b.read(`getRoundData ${id} of ${feed.ticker}`, feed.address, aggregatorAbi, "getRoundData", [id]) }));
  const r = await b.send(client, network);
  const out: Round[] = [];
  for (const { id, slot } of slots) {
    const data = r.find(slot);
    const round = data ? asRound(id, data[1], data[3], decimals) : null;
    if (round) out.push(round);
  }
  return out;
}
