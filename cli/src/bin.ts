import { main } from "./main";
import { explain } from "./rpc";

// The `kyzen` executable: runs a command and exits with its code; a failed read prints one plain line.
main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e: unknown) => {
    process.stderr.write(`kyzen: ${explain(e)}\n`);
    process.exit(1);
  },
);
