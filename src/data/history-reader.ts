import type { Address, PublicClient } from "viem";
import { aggregatorAbi } from "./abi/aggregator";
import { Batch } from "./multicall";
import type { Network } from "./networks";
import type { Round, RoundReader } from "./history";

/** Rounds asked for in one Multicall3 call. */
const CHUNK = 250;

/**
 * Chainlink rounds read through Multicall3: a feed's decimals once, then its rounds in calls of up
 * to 250, one call at a time (the public RPC refuses bursts). A round the feed cannot answer (a
 * revert, or never updated) is null.
 */
export function createRoundReader(client: PublicClient, network: Network): RoundReader {
  const decimals = new Map<string, Promise<number>>();
  const scaleOf = (feed: Address) => {
    const key = feed.toLowerCase();
    let d = decimals.get(key);
    if (!d) {
      d = client.readContract({ address: feed, abi: aggregatorAbi, functionName: "decimals" }).then(Number);
      d.catch(() => decimals.delete(key));
      decimals.set(key, d);
    }
    return d;
  };
  const round = (id: bigint, answer: bigint, updatedAt: bigint, scale: number): Round | null =>
    updatedAt > BigInt(0) && answer > BigInt(0) ? { id, t: Number(updatedAt), price: Number(answer) / 10 ** scale } : null;
  return {
    async latest(feed) {
      const [scale, data] = await Promise.all([scaleOf(feed), client.readContract({ address: feed, abi: aggregatorAbi, functionName: "latestRoundData" })]);
      const r = round(data[0], data[1], data[3], scale);
      if (!r) throw new Error(`chain provider (${network.name}): the feed ${feed} has no round`);
      return r;
    },
    async rounds(feed, ids) {
      const scale = await scaleOf(feed);
      const out: (Round | null)[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = new Batch();
        const slots = ids.slice(i, i + CHUNK).map((id) => batch.read(`getRoundData ${id}`, feed, aggregatorAbi, "getRoundData", [id]));
        const results = await batch.send(client, network);
        slots.forEach((slot, j) => {
          const data = results.find(slot);
          out.push(data ? round(ids[i + j], data[1], data[3], scale) : null);
        });
      }
      return out;
    },
  };
}
