// The CLI banner's letters and colours, with no terminal code, so the website can draw the same
// banner (src/components/nx/cli-banner.tsx) as the CLI prints (cli/src/banner.ts): KYZEN in the block
// letters of the ANSI Shadow figlet face, and the gradient's stops around the brand blue
// (#3B82F6, SPEC 5.7).

export const KYZEN_ROWS = [
  "██╗  ██╗██╗   ██╗███████╗███████╗███╗   ██╗",
  "██║ ██╔╝╚██╗ ██╔╝╚══███╔╝██╔════╝████╗  ██║",
  "█████╔╝  ╚████╔╝   ███╔╝ █████╗  ██╔██╗ ██║",
  "██╔═██╗   ╚██╔╝   ███╔╝  ██╔══╝  ██║╚██╗██║",
  "██║  ██╗   ██║   ███████╗███████╗██║ ╚████║",
  "╚═╝  ╚═╝   ╚═╝   ╚══════╝╚══════╝╚═╝  ╚═══╝",
];

/** The banner's width in columns. */
export const BANNER_WIDTH = Array.from(KYZEN_ROWS[0]).length;

export type Rgb = [number, number, number];
/** Light blue, the brand blue, a deeper blue: the gradient's stops from left to right. */
export const STOPS: Rgb[] = [[165, 200, 255], [59, 130, 246], [37, 99, 235]];
/** How much darker the shadow strokes are than the block faces. */
export const SHADE = 0.5;

/** The gradient's colour at `x` from 0 (left) to 1 (right). */
export function gradient(x: number): Rgb {
  const span = (STOPS.length - 1) * Math.min(1, Math.max(0, x));
  const i = Math.min(STOPS.length - 2, Math.floor(span));
  const f = span - i;
  return STOPS[i].map((c, k) => Math.round(c + (STOPS[i + 1][k] - c) * f)) as Rgb;
}

export const shade = (c: Rgb): Rgb => c.map((v) => Math.round(v * SHADE)) as Rgb;
