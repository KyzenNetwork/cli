import type { Address } from "viem";

// Price history from Chainlink feeds (the market pages' charts): the rounds a feed answered over a
// range, read back from the chain. A round's id is its phase in the top 16 bits over its number in
// the phase (Chainlink's proxy scheme); the search stays in the latest round's phase, so a feed whose
// phase began inside the range starts there, and the answer says so (truncated). Each price is a
// round's answer as the chain recorded it; the first point holds the price of the round before the
// range at its start, and the last holds the latest price up to now, as the feed itself holds it.

export type Range = "1D" | "1W" | "1M" | "3M";
export const RANGES: Range[] = ["1D", "1W", "1M", "3M"];
export const RANGE_SECONDS: Readonly<Record<Range, number>> = { "1D": 86_400, "1W": 604_800, "1M": 2_592_000, "3M": 7_776_000 };
/** The most rounds read for a range: every round of a day up to 400, an even sample of 240 beyond. */
const MAX_POINTS: Readonly<Record<Range, number>> = { "1D": 400, "1W": 240, "1M": 240, "3M": 240 };
/** Rounds probed per step of the search, in one call. */
const PROBES = 15;

/** [unix seconds, USD]. */
export type Point = [number, number];
export type Round = { id: bigint; t: number; price: number };
export interface RoundReader {
  latest(feed: Address): Promise<Round>;
  /** The rounds asked for, in order; null for one the feed cannot answer. */
  rounds(feed: Address, ids: readonly bigint[]): Promise<(Round | null)[]>;
}

const SHIFT = BigInt(64);
const MASK = (BigInt(1) << SHIFT) - BigInt(1);
const ONE = BigInt(1);
export const phaseOf = (id: bigint) => id >> SHIFT;
export const aggOf = (id: bigint) => id & MASK;
export const roundId = (phase: bigint, agg: bigint) => (phase << SHIFT) | agg;

/**
 * The first round of the latest round's phase updated at or after `from`. Each step reads up to 15
 * evenly spaced rounds in one call and keeps the interval between the last before `from` and the
 * first at or after it; a round the feed cannot answer is skipped. `truncated`: the phase's first
 * round is the answer, so the feed's history may begin inside the range.
 */
export async function findStart(reader: RoundReader, feed: Address, latest: Round, from: number): Promise<{ agg: bigint; truncated: boolean }> {
  const phase = phaseOf(latest.id);
  let lo = ONE, hi = aggOf(latest.id);
  if (latest.t < from) return { agg: hi, truncated: false };
  while (lo < hi) {
    const span = hi - lo;
    const k = span < BigInt(PROBES) ? span : BigInt(PROBES);
    const aggs: bigint[] = [];
    for (let i = BigInt(0); i < k; i += ONE) aggs.push(lo + (span * i) / k);
    const rounds = await reader.rounds(feed, aggs.map((a) => roundId(phase, a)));
    let nextLo = lo, nextHi = hi;
    for (let i = 0; i < aggs.length; i++) {
      const r = rounds[i];
      if (!r) continue;
      if (r.t >= from) { nextHi = aggs[i]; break; }
      nextLo = aggs[i] + ONE;
    }
    if (nextLo === lo && nextHi === hi) break; // nothing in the interval answered: keep the bound known
    lo = nextLo;
    hi = nextHi;
  }
  return { agg: hi, truncated: hi === ONE };
}

/** Round ids from `a` to `b` in `phase`: every one when there are at most `max`, else `max` spread evenly, both ends kept. */
export function sampleIds(phase: bigint, a: bigint, b: bigint, max: number): bigint[] {
  const count = b - a + ONE;
  if (count <= BigInt(max)) {
    const all: bigint[] = [];
    for (let x = a; x <= b; x += ONE) all.push(roundId(phase, x));
    return all;
  }
  const out: bigint[] = [];
  const steps = BigInt(max - 1);
  for (let i = BigInt(0); i <= steps; i += ONE) {
    const id = roundId(phase, a + ((count - ONE) * i) / steps);
    if (out[out.length - 1] !== id) out.push(id);
  }
  return out;
}

/** A feed's prices over `range` up to `now` (unix seconds). */
export async function feedHistory(reader: RoundReader, feed: Address, range: Range, now: number): Promise<{ points: Point[]; truncated: boolean }> {
  const latest = await reader.latest(feed);
  const from = now - RANGE_SECONDS[range];
  const phase = phaseOf(latest.id);
  const { agg, truncated } = await findStart(reader, feed, latest, from);
  const ids = sampleIds(phase, agg, aggOf(latest.id), MAX_POINTS[range]);
  // The round before the range holds the price at its start.
  const before = !truncated && agg > ONE && latest.t >= from ? [roundId(phase, agg - ONE)] : [];
  const rounds = await reader.rounds(feed, before.concat(ids));
  const points: Point[] = [];
  rounds.forEach((r, i) => {
    if (!r) return;
    const t = i < before.length || r.t < from ? from : r.t;
    if (points.length && points[points.length - 1][0] === t) points[points.length - 1] = [t, r.price];
    else points.push([t, r.price]);
  });
  if (points.length && points[points.length - 1][0] < now) points.push([now, latest.price]);
  return { points, truncated };
}

/**
 * An index from its parts, as the index feed prices it: at every time any part moved, the sum of
 * each part's quantity times its last price, from the first time every part has a price.
 */
export function composeIndex(parts: { quantity: number; points: Point[] }[]): Point[] {
  const times = Array.from(new Set(parts.flatMap((p) => p.points.map(([t]) => t)))).sort((x, y) => x - y);
  const at = parts.map(() => -1);
  const out: Point[] = [];
  for (const t of times) {
    parts.forEach((p, i) => { while (at[i] + 1 < p.points.length && p.points[at[i] + 1][0] <= t) at[i]++; });
    if (at.some((x) => x < 0)) continue;
    out.push([t, parts.reduce((sum, p, i) => sum + p.quantity * p.points[at[i]][1], 0)]);
  }
  return out;
}

/** A series set to `base` at its first point (to compare parts that price differently); empty when it starts at 0. */
export function rebase(points: Point[], base = 100): Point[] {
  const first = points[0]?.[1];
  if (!first) return [];
  return points.map(([t, v]): Point => [t, (v / first) * base]);
}

/** Where a market's line comes from: one feed, an index of quantities, the parts of an index not yet priced, or nothing. */
export type HistorySource =
  | { kind: "feed"; label: string; feed: Address }
  | { kind: "index"; label: string; parts: { label: string; feed: Address; quantity: number }[] }
  | { kind: "components"; parts: { label: string; feed: Address }[] }
  | { kind: "none" };

export interface HistoryData {
  kind: HistorySource["kind"];
  series: { label: string; points: Point[] }[];
  from: number;
  to: number;
  feeds: Address[];
  /** A feed's history begins inside the range. */
  truncated: boolean;
}

/** A market's lines over `range` up to `now`, from its source. */
export async function loadHistory(reader: RoundReader, source: HistorySource, range: Range, now: number): Promise<HistoryData> {
  const base = { kind: source.kind, from: now - RANGE_SECONDS[range], to: now };
  if (source.kind === "none") return Object.assign(base, { series: [], feeds: [], truncated: false });
  const parts = source.kind === "feed" ? [{ label: source.label, feed: source.feed, quantity: 1 }] : source.parts.map((p) => Object.assign({ quantity: 1 }, p));
  // One feed after another: the RPC sees one call at a time.
  const lines: { points: Point[]; truncated: boolean }[] = [];
  for (const p of parts) lines.push(await feedHistory(reader, p.feed, range, now));
  const truncated = lines.some((l) => l.truncated);
  const feeds = parts.map((p) => p.feed);
  if (source.kind === "index") {
    return Object.assign(base, { series: [{ label: source.label, points: composeIndex(parts.map((p, i) => ({ quantity: p.quantity, points: lines[i].points }))) }], feeds, truncated });
  }
  if (source.kind === "components") return Object.assign(base, { series: parts.map((p, i) => ({ label: p.label, points: rebase(lines[i].points) })), feeds, truncated });
  return Object.assign(base, { series: [{ label: parts[0].label, points: lines[0].points }], feeds, truncated });
}
