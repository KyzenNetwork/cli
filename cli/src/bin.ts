import { main } from "./main";
import { explain } from "./rpc";

// The `kyzen` executable: runs a command and exits with its code; a failed read prints one plain line.
// Output piped into a reader that stops early (`kyzen verify | head`) ends the command quietly.
process.stdout.on("error", (e: NodeJS.ErrnoException) => {
  if (e.code === "EPIPE") process.exit(0);
  throw e;
});
main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`kyzen: ${explain(e)}\n`);
    process.exit(1);
  },
);
