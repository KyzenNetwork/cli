import { CONTRACTS, GATEWAY_HEALTH, MAINNET, SILICON_CONTRACTS, VERSION } from "../config";
import type { Context } from "../context";
import { batch, explain } from "../rpc";
import { mainnetSilicon } from "./markets";
import { ago, bold, dim, down, heading, int, out, table, up, warn } from "../ui";

// `kyzen status`: the mainnet contracts, the AI Gateway's health and the Silicon markets on mainnet.

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

  out(bold("AI Gateway"));
  out(`  ${GATEWAY_HEALTH}  ${await gateway()}`);
  out();

  out(bold("Silicon"));
  try {
    const s = await mainnetSilicon(ctx);
    if (!s) out(`  ${dim("no Silicon deployment recorded on mainnet")}`);
    else {
      const open = s.markets.filter((m) => m.open);
      out(`  ${SILICON_CONTRACTS.length} contracts deployed ${dim("· kSynthetics:")} ${s.markets.map((m) => m.symbol).join(", ")}`);
      out(`  ${open.length} of ${s.markets.length} markets open ${dim(`· $KYZN oracle ${s.kyznUsd === null ? "gathering observations" : "pricing"}`)} ${dim("· kyzen markets for the detail")}`);
    }
  } catch (e) {
    out(`  ${warn(`could not be read (${explain(e)})`)}`);
  }
}
