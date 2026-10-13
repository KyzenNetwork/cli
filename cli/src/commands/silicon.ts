import { aggregatorAbi } from "../../../src/data/abi/aggregator";
import { FEEDS, MAINNET } from "../config";
import { readRange, readRounds, type Round } from "../feeds";
import { aggOf, phaseOf } from "../../../src/data/history";
import type { Context } from "../context";
import { ago, clock, dim, fixed, heading, move, out, spark, table, usd } from "../ui";

// `kyzen silicon [--watch]`: the seven Chainlink stock feeds, each with its stage, price, the last
// 16 rounds and the last update. `kyzen feeds [--tail]`: the latest round of each, then (with
// --tail) every round as it lands.

const HISTORY = 16;
const WATCH_SECONDS = 15;
const TAIL_SECONDS = 10;
/** Rounds read back for one feed between two polls before the gap is reported instead. */
const MAX_GAP = 20;

export async function silicon(ctx: Context, watch: boolean): Promise<void> {
  const draw = async () => {
    const feeds = await readRounds(ctx.client, ctx.network, FEEDS, HISTORY);
    const block = await ctx.client.getBlockNumber();
    const rows = [["TICKER", "STAGE", "PRICE", `LAST ${HISTORY} ROUNDS`, "MOVE", "UPDATED"].map(dim)];
    for (const { feed, rounds } of feeds) {
      const last = rounds[rounds.length - 1];
      if (!last) {
        rows.push([feed.ticker, feed.stage, dim("no answer"), "", "", ""]);
        continue;
      }
      rows.push([feed.ticker, feed.stage, usd(last.price), spark(rounds.map((r) => r.price)), move(rounds[0].price, last.price), ago(last.updatedAt)]);
    }
    if (watch && ctx.tty) process.stdout.write("\x1b[H\x1b[2J");
    out(heading("Silicon · chip stock feeds"));
    out(dim(`Chainlink on Robinhood Chain ${MAINNET.chainId} · block ${block.toLocaleString("en-US")} · ${clock(Math.floor(Date.now() / 1000))} UTC`));
    out();
    out(table(rows, ["left", "left", "right", "left", "right", "right"]));
    out();
    out(dim(`Move: the oldest of the last ${HISTORY} rounds to the latest. Feeds update when prices move, so a closed market shows old rounds.`));
    if (watch) out(dim(`Refreshing every ${WATCH_SECONDS}s. Ctrl+C to stop.`));
  };
  await draw();
  if (watch) await ctx.every(WATCH_SECONDS, draw);
}

/** One round as a line of fixed columns, so lines printed apart still align: time, ticker, price, move, round. */
const line = (ticker: string, r: Round, before: Round | undefined) =>
  fixed([dim(clock(r.updatedAt)), ticker, usd(r.price), before ? move(before.price, r.price) : "", dim(`round ${aggOf(r.id).toString()}`)], [8, 5, 11, 8], ["left", "left", "right", "right"]);

export async function feeds(ctx: Context, tail: boolean): Promise<void> {
  const first = await readRounds(ctx.client, ctx.network, FEEDS, 2);
  out(heading("Feeds · latest rounds"));
  out(dim(`Chainlink on Robinhood Chain ${MAINNET.chainId}, UTC`));
  out();
  out(fixed(["TIME", "TICKER", "PRICE", "MOVE", "ROUND"].map(dim), [8, 5, 11, 8], ["left", "left", "right", "right"]));
  const last = new Map<string, Round>();
  const decimals = new Map<string, number>();
  for (const { feed, rounds } of first) {
    const r = rounds[rounds.length - 1];
    if (!r) {
      out(fixed([dim("--:--:--"), feed.ticker, dim("no answer")], [8, 5, 11], ["left", "left", "right"]));
      continue;
    }
    last.set(feed.ticker, r);
    out(line(feed.ticker, r, rounds[rounds.length - 2]));
  }
  if (!tail) return;

  out();
  out(dim(`Watching for new rounds every ${TAIL_SECONDS}s. Ctrl+C to stop.`));
  await ctx.every(TAIL_SECONDS, async () => {
    const now = await readRounds(ctx.client, ctx.network, FEEDS, 1);
    for (const { feed, rounds } of now) {
      const head = rounds[0];
      const prev = last.get(feed.ticker);
      if (!head || (prev && head.id === prev.id)) continue;
      let landed: Round[] = [head];
      // Rounds that landed between two polls, read back in one call (same phase only).
      if (prev && phaseOf(prev.id) === phaseOf(head.id) && aggOf(head.id) - aggOf(prev.id) > BigInt(1)) {
        const gap = aggOf(head.id) - aggOf(prev.id) - BigInt(1);
        if (gap <= BigInt(MAX_GAP)) {
          if (!decimals.has(feed.ticker)) decimals.set(feed.ticker, await ctx.client.readContract({ address: feed.address, abi: aggregatorAbi, functionName: "decimals" }));
          const between = await readRange(ctx.client, ctx.network, feed, phaseOf(head.id), aggOf(prev.id) + BigInt(1), aggOf(head.id) - BigInt(1), decimals.get(feed.ticker) as number);
          landed = between.concat(landed);
        } else {
          out(dim(`${feed.ticker}: ${gap.toString()} rounds landed since the last poll`));
        }
      }
      let before = prev;
      for (const r of landed) {
        out(line(feed.ticker, r, before));
        before = r;
      }
      last.set(feed.ticker, head);
    }
  });
}
