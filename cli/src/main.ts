import { MAINNET, VERSION, indexOf } from "./config";
import { chain } from "./commands/chain";
import { index, unknownIndex } from "./commands/index-cmd";
import { feeds, silicon } from "./commands/silicon";
import { markets } from "./commands/markets";
import { status } from "./commands/status";
import { token } from "./commands/token";
import { verify } from "./commands/verify";
import { loop, type Context } from "./context";
import { clientOf, withRpc } from "./rpc";
import { banner } from "./banner";
import { accent, bold, dim, out, setColour } from "./ui";

// kyzen: Kyzen Network's read-only command line (SPEC 3.8). No keys and no wallet: it reads
// public Robinhood Chain data and Kyzen Network's public endpoints, nothing else.

export interface Args {
  command: string | undefined;
  rest: string[];
  flags: Set<string>;
  rpc: string | undefined;
}

/** The command, its operands, its flags and --rpc's value; "--rpc=<url>" and "--rpc <url>" both read. */
export function parseArgs(argv: string[]): Args {
  const flags = new Set<string>();
  const rest: string[] = [];
  let rpc: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--rpc") rpc = argv[++i];
    else if (a.startsWith("--rpc=")) rpc = a.slice("--rpc=".length);
    else if (a === "-h") flags.add("--help");
    else if (a === "-v") flags.add("--version");
    else if (a.startsWith("-")) flags.add(a);
    else rest.push(a);
  }
  return { command: rest.shift(), rest, flags, rpc };
}

const COMMANDS: [string, string][] = [
  ["token", "$KYZN: price, market cap, supply, burned, staked, Reserve and backing"],
  ["markets", "The four kSynthetics markets: index level, limit, minted, open or closed"],
  ["silicon [--watch]", "The seven chip stock feeds: price, stage, last 16 rounds, last update"],
  ["index <name>", "A stage index (kDESIGN, kMEMORY, kFAB, kEQUIP): basket, methodology, level, market"],
  ["feeds [--tail]", "The latest price rounds; with --tail, every round as it lands"],
  ["chain [--watch]", "Robinhood Chain blocks as they land: number, transactions, gas"],
  ["verify", "Each mainnet contract's verified source (Sourcify) and on-chain code hash, Silicon included"],
  ["status", "Contracts deployed, AI Gateway health, Silicon markets"],
];

function help(): void {
  const art = banner();
  if (art.length > 0) {
    out();
    for (const line of art) out(`  ${line}`);
    out();
  }
  out(`${accent(bold("Kyzen Network"))} ${dim(`CLI ${VERSION}`)}`);
  out(dim("Read-only: no keys, no wallet. Public Robinhood Chain data only."));
  out();
  out(bold("Usage"));
  out("  kyzen <command> [options]");
  out();
  out(bold("Commands"));
  const width = Math.max.apply(null, COMMANDS.map(([c]) => c.length));
  for (const [c, what] of COMMANDS) out(`  ${c.padEnd(width)}  ${dim(what)}`);
  out();
  out(bold("Options"));
  const OPTIONS: [string, string][] = [
    ["--rpc <url>", `Read through another Robinhood Chain RPC (default ${MAINNET.rpcUrl})`],
    ["--no-color", "Plain text (NO_COLOR is honoured too)"],
    ["-h, --help", "This help"],
    ["-v, --version", "The version"],
  ];
  for (const [o, what] of OPTIONS) out(`  ${o.padEnd(width)}  ${dim(what)}`);
  out();
  out(dim("Docs: https://docs.kyzen.network/cli"));
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.flags.has("--no-color")) setColour(false);
  if (args.flags.has("--version")) {
    out(VERSION);
    return 0;
  }
  if (!args.command || args.command === "help" || args.flags.has("--help")) {
    help();
    return 0;
  }
  const network = withRpc(MAINNET, args.rpc);
  const ctx: Context = { network, client: clientOf(network), tty: Boolean(process.stdout.isTTY), every: loop };
  const watching = args.flags.has("--watch") || args.flags.has("-w");
  switch (args.command) {
    case "silicon":
      await silicon(ctx, watching);
      return 0;
    case "index": {
      const name = args.rest[0];
      const x = name ? indexOf(name) : undefined;
      if (!x) {
        process.stderr.write(`${name ? unknownIndex(name) : "Name an index: kyzen index kMEMORY"}\n`);
        return 2;
      }
      await index(ctx, x);
      return 0;
    }
    case "feeds":
      await feeds(ctx, args.flags.has("--tail") || args.flags.has("-f"));
      return 0;
    case "chain":
      await chain(ctx, watching);
      return 0;
    case "verify":
      return verify(ctx);
    case "token":
      return token(ctx);
    case "markets":
      return markets(ctx);
    case "status":
      await status(ctx);
      return 0;
    default:
      process.stderr.write(`Unknown command "${args.command}". Run kyzen --help for the list.\n`);
      return 2;
  }
}
