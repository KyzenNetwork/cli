import { siliconDeployment } from "../../../src/data/silicon";
import { readSilicon } from "../../../src/data/silicon-chain";
import { CONTRACTS, GATEWAY_HEALTH, MAINNET, TESTNET, VERSION } from "../config";
import type { Context } from "../context";
import { batch, clientOf, explain } from "../rpc";
import { ago, bold, dim, down, heading, int, out, table, up, warn } from "../ui";

// `kyzen status`: the mainnet contracts, the SI Gateway's health and the Silicon indices on testnet.
// It never reads a pool, liquidity or a $KYZN price (SPEC 3.8).

interface Health {
  ok?: boolean;
  network?: string;
  live?: boolean;
}

async function gateway(): Promise<string> {
  try {
    const res = await fetch(GATEWAY_HEALTH, { headers: { "user-agent": `kyzen-cli/${VERSION}` }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return warn(`HTTP ${res.status}${res.status === 451 ? " (not available in your region)" : ""}`);
    const h = (await res.json()) as Health;
    if (!h.ok) return down("not healthy");
    return `${up("ok")} ${dim(`· ${h.network ?? "?"} · ${h.live ? "deployment recorded" : "no deployment recorded"}`)}`;
  } catch (e) {
    return warn(`not reachable (${explain(e)})`);
  }
}

/**
 * The testnet Silicon markets, counted: how many the owner has opened. No prices and no breaker
 * states, since the testnet runs on stand-in feeds and liquidation drills, whose values are not
 * market moves.
 */
async function siliconTestnet(): Promise<string> {
  const dep = TESTNET.addresses ? siliconDeployment(TESTNET.addresses) : null;
  if (!TESTNET.addresses || !dep) return dim("no testnet deployment recorded");
  const { state } = await readSilicon(clientOf(TESTNET), TESTNET, TESTNET.addresses.token, dep, TESTNET.rpcUrl, () => undefined);
  const open = state.markets.filter((m) => m.open);
  return `${open.length} of ${state.markets.length} markets open ${dim(`(${open.map((m) => m.symbol).join(", ")} · stand-in feeds)`)}`;
}

export async function status(ctx: Context): Promise<void> {
  out(heading("Status"));
  out();

  out(bold(`Robinhood Chain ${MAINNET.chainId}`));
  const head = await ctx.client.getBlock();
  out(`  block ${int(head.number)} ${dim(`· ${ago(Number(head.timestamp))}`)}`);
  out();

  out(bold("Contracts"));
  const codes = await batch<string>(ctx.network.rpcUrl, CONTRACTS.map((c) => ({ method: "eth_getCode", params: [c.address, "latest"] })));
  const deployed = CONTRACTS.map((c, i) => [`  ${c.name}`, dim(c.address), codes[i] && codes[i] !== "0x" ? up("deployed") : down("no code")]);
  out(table(deployed, ["left", "left", "left"]));
  out();

  out(bold("SI Gateway"));
  out(`  ${GATEWAY_HEALTH}  ${await gateway()}`);
  out();

  out(bold("Silicon"));
  out(`  mainnet  ${dim("not deployed yet")}`);
  try {
    out(`  testnet  ${await siliconTestnet()}`);
  } catch (e) {
    out(`  testnet  ${warn(`could not be read (${explain(e)})`)}`);
  }
}
