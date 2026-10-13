import { keccak256, type Address, type Hex } from "viem";
import { CONTRACTS, MAINNET, SOURCIFY } from "../config";
import type { Context } from "../context";
import { batch } from "../rpc";
import { bold, dim, down, heading, out, up, warn } from "../ui";

// `kyzen verify`: each mainnet Kyzen Network contract's verified source on Sourcify and the hash
// of its code on chain, read now. A contract passes when Sourcify matched its source exactly to
// the deployed code and that code is still what the chain holds.

interface SourcifyMatch {
  match: string | null;
  runtimeMatch?: string | null;
  verifiedAt?: string;
  compilation?: { name?: string; fullyQualifiedName?: string; compilerVersion?: string };
  runtimeBytecode?: { onchainBytecode?: Hex };
}

export interface Verdict {
  ok: boolean;
  text: string;
}

/** The outcome for one contract, from what Sourcify holds and the code hash read now. */
export function verdict(found: SourcifyMatch | null, liveHash: Hex | null): Verdict {
  if (!liveHash) return { ok: false, text: "no code on chain" };
  if (!found || !found.match) return { ok: false, text: "not verified on Sourcify" };
  const verifiedHash = found.runtimeBytecode?.onchainBytecode ? keccak256(found.runtimeBytecode.onchainBytecode) : null;
  if (verifiedHash && verifiedHash !== liveHash) return { ok: false, text: "the code on chain differs from the verified code" };
  const kind = found.runtimeMatch === "exact_match" || found.match === "exact_match" ? "exact match" : "partial match";
  return { ok: true, text: `${kind}, the code on chain is the verified code` };
}

async function sourcify(address: Address): Promise<SourcifyMatch | null> {
  const fields = "compilation.name,compilation.fullyQualifiedName,compilation.compilerVersion,runtimeBytecode.onchainBytecode";
  const res = await fetch(`${SOURCIFY}/${MAINNET.chainId}/${address}?fields=${fields}`, { signal: AbortSignal.timeout(20_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sourcify answered HTTP ${res.status} for ${address}`);
  return (await res.json()) as SourcifyMatch;
}

export async function verify(ctx: Context): Promise<number> {
  out(heading("Verify · mainnet contracts"));
  out(dim(`Source from Sourcify, code read now from Robinhood Chain ${MAINNET.chainId}`));
  out();
  if (CONTRACTS.length === 0) {
    out("No mainnet deployment is recorded.");
    return 1;
  }
  const codes = await batch<Hex>(ctx.network.rpcUrl, CONTRACTS.map((c) => ({ method: "eth_getCode", params: [c.address, "latest"] })));
  let failed = 0;
  for (const [i, c] of CONTRACTS.entries()) {
    const code = codes[i];
    const liveHash = code && code !== "0x" ? keccak256(code) : null;
    const found = await sourcify(c.address);
    const v = verdict(found, liveHash);
    if (!v.ok) failed++;
    const source = found?.compilation?.fullyQualifiedName;
    out(`${v.ok ? up("PASS") : down("FAIL")}  ${bold(c.name)}  ${dim(c.address)}`);
    out(`      ${v.ok ? v.text : warn(v.text)}`);
    if (source) out(`      ${dim("source")}    ${source} ${dim(`(solc ${found?.compilation?.compilerVersion ?? "?"})`)}`);
    if (liveHash) out(`      ${dim("code hash")} ${liveHash}`);
    if (found?.verifiedAt) out(`      ${dim("verified")}  ${found.verifiedAt.replace("T", " ").replace("Z", " UTC")}`);
    out(`      ${dim("explorer")}  ${MAINNET.explorerUrl}/address/${c.address}`);
    out();
  }
  out(failed === 0 ? up(`All ${CONTRACTS.length} contracts verified.`) : down(`${failed} of ${CONTRACTS.length} contracts did not pass.`));
  return failed === 0 ? 0 : 1;
}
