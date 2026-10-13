// Terminal output: colour when the terminal shows it (not with NO_COLOR, --no-color or a pipe),
// tables padded by visible width, sparklines, prices, moves and ages. Every line the CLI prints
// follows SPEC 5 (the copy check scans this folder).

let colour = Boolean(process.stdout.isTTY) && !("NO_COLOR" in process.env);
export const setColour = (on: boolean) => {
  colour = on;
};

const truecolour = /truecolor|24bit/i.test(process.env.COLORTERM ?? "");
const paint = (open: string, close = "\x1b[39m") => (s: string) => (colour ? `\x1b[${open}m${s}${close}` : s);

/** The brand blue (#3B82F6, SPEC 5.7), its nearest ANSI colour where the terminal has no 24-bit colour. */
export const accent = paint(truecolour ? "38;2;59;130;246" : "94");
export const dim = paint("2", "\x1b[22m");
export const bold = paint("1", "\x1b[22m");
export const up = paint("32");
export const down = paint("31");
export const warn = paint("33");

const ANSI = /\x1b\[[0-9;]*m/g;
export const visible = (s: string) => s.replace(ANSI, "").length;

export type Align = "left" | "right";

/** Rows as columns, two spaces apart, each cell padded to its column's widest visible text. */
export function table(rows: string[][], align: Align[] = []): string {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, visible(cell))));
  return rows
    .map((row) =>
      row
        .map((cell, i) => {
          const pad = " ".repeat(widths[i] - visible(cell));
          return align[i] === "right" ? pad + cell : i === row.length - 1 ? cell : cell + pad;
        })
        .join("  "),
    )
    .join("\n");
}

/** One line of cells padded to fixed widths (the last cell unpadded), for lines printed one at a time. */
export function fixed(cells: string[], widths: number[], align: Align[] = []): string {
  return cells
    .map((cell, i) => {
      if (i >= widths.length) return cell;
      const pad = " ".repeat(Math.max(0, widths[i] - visible(cell)));
      return align[i] === "right" ? pad + cell : cell + pad;
    })
    .join("  ")
    .trimEnd();
}

const BARS = "▁▂▃▄▅▆▇█";

/** One bar per value, scaled between the lowest and the highest; a flat series sits on the middle bar. */
export function spark(values: number[]): string {
  if (values.length === 0) return "";
  const lo = Math.min.apply(null, values);
  const hi = Math.max.apply(null, values);
  if (hi === lo) return BARS[3].repeat(values.length);
  return values.map((v) => BARS[Math.round(((v - lo) / (hi - lo)) * (BARS.length - 1))]).join("");
}

const grouped = (n: number, digits: number) => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** A USD price: two decimals, four under one dollar. */
export const usd = (n: number) => `$${grouped(n, Math.abs(n) < 1 ? 4 : 2)}`;
export const int = (n: number | bigint) => (typeof n === "bigint" ? n.toLocaleString("en-US") : grouped(n, 0));

/** A move from `from` to `to` as a signed percentage, green up, red down; "0.00%" when flat. */
export function move(from: number, to: number): string {
  if (!(from > 0)) return dim("n/a");
  const pct = ((to - from) / from) * 100;
  const text = `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%`;
  return pct > 0 ? up(text) : pct < 0 ? down(text) : text;
}

/** How long ago a unix time was, in the largest whole unit: "42s ago", "7m ago", "3h ago", "2d ago". */
export function ago(unix: number, now = Math.floor(Date.now() / 1000)): string {
  const s = Math.max(0, now - unix);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

/** A unix time as HH:MM:SS UTC. */
export const clock = (unix: number) => new Date(unix * 1000).toISOString().slice(11, 19);

/** The heading every command opens with: the product, then what the command shows. */
export const heading = (what: string) => `${accent(bold("Kyzen Network"))} ${dim("·")} ${what}`;

export const out = (s = "") => process.stdout.write(s + "\n");
