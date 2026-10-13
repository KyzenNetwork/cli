import type { PublicClient } from "viem";
import type { Network } from "../../src/data/networks";
import { explain } from "./rpc";
import { dim, out } from "./ui";

/** What every command gets: the mainnet network and its client, and a loop for the watching commands. */
export interface Context {
  network: Network;
  client: PublicClient;
  tty: boolean;
  /** Runs `step` every `seconds` until Ctrl+C; a failed step prints why and the loop goes on. */
  every(seconds: number, step: () => Promise<void>): Promise<void>;
}

export function loop(seconds: number, step: () => Promise<void>): Promise<void> {
  return new Promise<void>((done) => {
    let timer: NodeJS.Timeout | undefined;
    process.once("SIGINT", () => {
      clearTimeout(timer);
      out();
      done();
    });
    const run = async () => {
      try {
        await step();
      } catch (e) {
        out(dim(`read failed: ${explain(e)} Trying again in ${seconds}s.`));
      }
      timer = setTimeout(run, seconds * 1000);
    };
    timer = setTimeout(run, seconds * 1000);
  });
}
