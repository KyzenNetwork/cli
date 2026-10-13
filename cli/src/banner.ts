import { BANNER_WIDTH, KYZEN_ROWS, gradient, shade, type Rgb } from "../../src/lib/cli-banner-art";
import { colourOn, dim } from "./ui";

// The banner `kyzen` and `kyzen --help` open with: the name in block letters, KYZEN over a spaced
// NETWORK so the full name reads, in a left-to-right gradient around the brand blue (#3B82F6,
// SPEC 5.7). The block faces take the gradient and the shadow strokes a darker shade of it, which
// gives the letters depth. Truecolour where the terminal has it, the 256-colour cube otherwise,
// plain text with colour off. Too narrow a terminal gets no banner.

const KYZEN = KYZEN_ROWS;
export { BANNER_WIDTH, gradient };

const truecolour = /truecolor|24bit/i.test(process.env.COLORTERM ?? "");
/** The nearest colour of the 6 x 6 x 6 cube of a 256-colour terminal. */
const cube = ([r, g, b]: Rgb) => 16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5);
const fg = (c: Rgb) => (truecolour ? `\x1b[38;2;${c[0]};${c[1]};${c[2]}m` : `\x1b[38;5;${cube(c)}m`);

/** One row of block letters, each column in its gradient colour, shadow strokes darker. */
function paintRow(row: string): string {
  const cells = Array.from(row);
  const out = cells.map((ch, i) => {
    if (ch === " ") return ch;
    const c = gradient(i / (cells.length - 1));
    return fg(ch === "█" ? c : shade(c)) + ch;
  });
  return out.join("") + "\x1b[39m";
}

/** NETWORK spaced out under KYZEN, ending at its right edge. */
function networkLine(): string {
  const word = "N E T W O R K";
  const pad = " ".repeat(BANNER_WIDTH - word.length);
  if (!colourOn()) return pad + word;
  const start = pad.length;
  return pad + Array.from(word).map((ch, i) => (ch === " " ? ch : fg(gradient((start + i) / (BANNER_WIDTH - 1))) + ch)).join("") + "\x1b[39m";
}

/** The banner's lines; none when the terminal is narrower than the banner. */
export function banner(columns = process.stdout.columns ?? 80): string[] {
  if (columns < BANNER_WIDTH + 2) return [];
  const rows = colourOn() ? KYZEN.map(paintRow) : KYZEN.slice();
  return rows.concat(networkLine(), "", dim("Tokenized intelligence, backed by chip equity."));
}
