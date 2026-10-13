import type { StockIndex } from "../../../src/components/docs/content/silicon-markets/indices";
import { createRoundReader } from "../../../src/data/history-reader";
import { findStart, phaseOf, roundId, type Round, type RoundReader } from "../../../src/data/history";
import type { Address } from "viem";
import { indexDocsUrl, INDICES, indexOf, MAINNET, methodologyUrl } from "../config";
import type { Context } from "../context";
import { ago, bold, dim, heading, move, out, table, usd } from "../ui";

// `kyzen index <kDESIGN|kMEMORY|kFAB|kEQUIP>`: the basket, the methodology in short and each
// component's live price with its move over 24 hours and 7 days. No index level: Silicon is not
// deployed on mainnet, and a level needs the reference prices its deployment records (SPEC 3.8).

const DAY = 86_400;

/** The methodology in short, from the published text (public/methodology/<slug>.txt). */
const RULES = [
  "A fixed basket of Chainlink stock feeds on Robinhood Chain, equal dollar weights at deployment, starting at $100. It never rebalances.",
  "Mints: Monday to Friday, 14:30 to 20:00 UTC (17:00 on early-close days), closed on exchange holidays, with every price at most 24 hours old.",
  "Liquidations: any day and hour, with every price at most 96 hours old.",
  "Jump breaker: a component moving more than 30% in one round stops the index until the guardian clears that round.",
  "Splits change no quantity: each feed's per-token price already reflects the token's multiplier.",
];

/** The price a feed held at `from`: the round before the first one at or after it. Null when the feed's phase starts inside the range. */
async function priceAt(reader: RoundReader, feed: Address, latest: Round, from: number): Promise<number | null> {
  if (latest.t < from) return latest.price;
  const { agg, truncated } = await findStart(reader, feed, latest, from);
  if (truncated) return null;
  const [before] = await reader.rounds(feed, [roundId(phaseOf(latest.id), agg - BigInt(1))]);
  return before ? before.price : null;
}

export function unknownIndex(name: string): string {
  return `No stage index named "${name}". Choose one of: ${INDICES.map((x) => x.symbol).join(", ")}.`;
}

export async function index(ctx: Context, x: StockIndex): Promise<void> {
  const reader = createRoundReader(ctx.client, ctx.network);
  const now = Math.floor(Date.now() / 1000);
  const rows = [["#", "TICKER", "CHAINLINK FEED", "PRICE", "24H", "7D", "UPDATED"].map(dim)];
  // One component after another: the public RPC sees one call at a time.
  for (const [i, s] of x.basket.entries()) {
    const latest = await reader.latest(s.feed);
    const day = await priceAt(reader, s.feed, latest, now - DAY);
    const week = await priceAt(reader, s.feed, latest, now - 7 * DAY);
    rows.push([String(i), s.ticker, dim(s.feed), usd(latest.price), day === null ? dim("n/a") : move(day, latest.price), week === null ? dim("n/a") : move(week, latest.price), ago(latest.t, now)]);
  }
  const weight = x.basket.length === 1 ? "the whole basket" : `1/${x.basket.length} each`;
  out(heading(`${bold(x.symbol)} · ${x.stage} index`));
  out(dim(`Silicon stage index on Robinhood Chain ${MAINNET.chainId} · weights at deployment: ${weight}`));
  out();
  out(table(rows, ["right", "left", "left", "right", "right", "right", "right"]));
  out();
  out(bold("Methodology"));
  for (const rule of RULES) out(`  ${dim("-")} ${rule}`);
  out();
  out(`${dim("Full text")}  ${methodologyUrl(x)}`);
  out(`${dim("Docs")}       ${indexDocsUrl(x)}`);
  out();
  out(dim("Index level: shown once Silicon is deployed on mainnet. Until then each component is shown on its own."));
}

export { indexOf };
