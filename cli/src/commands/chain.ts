import { MAINNET } from "../config";
import type { Context } from "../context";
import { batch } from "../rpc";
import { clock, dim, fixed, heading, int, out } from "../ui";

// `kyzen chain [--watch]`: Robinhood Chain's latest block, then (with --watch) every block as it
// lands. The chain makes about ten blocks a second, so each step asks for the next blocks by
// number in one JSON-RPC batch: the ones not made yet come back empty and are asked for again.

/** Blocks asked for in one step. */
export const STEP_BLOCKS = 24;
const STEP_MS = 1000;

interface RawBlock {
  number: string;
  timestamp: string;
  gasUsed: string;
  baseFeePerGas?: string;
  transactions: string[];
}

export interface Block {
  number: bigint;
  timestamp: number;
  txs: number;
  gasUsed: bigint;
  baseFee: bigint | null;
}

const parse = (b: RawBlock): Block => ({
  number: BigInt(b.number),
  timestamp: Number(BigInt(b.timestamp)),
  txs: b.transactions.length,
  gasUsed: BigInt(b.gasUsed),
  baseFee: b.baseFeePerGas ? BigInt(b.baseFeePerGas) : null,
});

/** The blocks that came back, in order, up to the first one not made yet. */
export function landed(replies: (RawBlock | null)[]): Block[] {
  const out: Block[] = [];
  for (const r of replies) {
    if (!r) break;
    out.push(parse(r));
  }
  return out;
}

const gwei = (wei: bigint) => `${(Number(wei) / 1e9).toFixed(3)} gwei`;
const line = (b: Block) =>
  fixed([`#${int(b.number)}`, dim(clock(b.timestamp)), `${b.txs} tx`, `gas ${int(b.gasUsed)}`, b.baseFee === null ? "" : dim(`base ${gwei(b.baseFee)}`)], [12, 8, 6, 15], ["left", "left", "right", "right"]);

const blocksFrom = (url: string, first: bigint, count: number) =>
  batch<RawBlock>(url, Array.from({ length: count }, (_, i) => ({ method: "eth_getBlockByNumber", params: [`0x${(first + BigInt(i)).toString(16)}`, false] })));

export async function chain(ctx: Context, watch: boolean): Promise<void> {
  const url = ctx.network.rpcUrl;
  const [head] = await batch<RawBlock>(url, [{ method: "eth_getBlockByNumber", params: ["latest", false] }]);
  if (!head) throw new Error("the RPC sent no latest block");
  const latest = parse(head);
  out(heading(`Robinhood Chain ${MAINNET.chainId} · blocks`));
  out(dim("UTC times; tx counts include the chain's own system transaction"));
  out();
  out(line(latest));
  if (!watch) return;

  let next = latest.number + BigInt(1);
  let shown = 0;
  let since = Date.now();
  await ctx.every(STEP_MS / 1000, async () => {
    const blocks = landed(await blocksFrom(url, next, STEP_BLOCKS));
    for (const b of blocks) out(line(b));
    shown += blocks.length;
    if (blocks.length > 0) next = blocks[blocks.length - 1].number + BigInt(1);
    // Every 10 seconds, the pace the chain kept.
    if (Date.now() - since >= 10_000) {
      out(dim(`  ${(shown / ((Date.now() - since) / 1000)).toFixed(1)} blocks a second · Ctrl+C to stop`));
      shown = 0;
      since = Date.now();
    }
  });
}
