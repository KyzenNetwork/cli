import { createPublicClient, http, type PublicClient } from "viem";
import type { Network } from "../../src/data/networks";
import { VERSION } from "./config";

// The CLI's reads: a viem client on the network's public RPC (or --rpc), Multicall3 for contract
// reads (src/data/multicall.ts), and raw JSON-RPC batches for blocks, one HTTP request a step.
// The public RPC refuses bursts, so every command sends few requests and waits between them.

const HEADERS = { "content-type": "application/json", "user-agent": `kyzen-cli/${VERSION}` };

export function clientOf(network: Network): PublicClient {
  return createPublicClient({
    transport: http(network.rpcUrl, { retryCount: 2, retryDelay: 1500, timeout: 20_000, fetchOptions: { headers: { "user-agent": HEADERS["user-agent"] } } }),
  }) as PublicClient;
}

/** The network with its RPC replaced by `rpcUrl` when one is given. */
export const withRpc = (network: Network, rpcUrl: string | undefined): Network => (rpcUrl ? Object.assign({}, network, { rpcUrl }) : network);

export interface RpcCall {
  method: string;
  params: unknown[];
}

/** Several JSON-RPC calls in one HTTP request; each result in the order asked, null where the node had none. */
export async function batch<T>(rpcUrl: string, calls: RpcCall[]): Promise<(T | null)[]> {
  if (calls.length === 0) return [];
  const body = calls.map((c, id) => ({ jsonrpc: "2.0", id, method: c.method, params: c.params }));
  const res = await fetch(rpcUrl, { method: "POST", headers: HEADERS, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new HttpError(res.status, rpcUrl);
  const replies = (await res.json()) as { id: number; result?: T; error?: { message: string } }[];
  const byId = new Map(replies.map((r) => [r.id, r]));
  return calls.map((c, id) => {
    const r = byId.get(id);
    if (r?.error) throw new Error(`${c.method}: ${r.error.message}`);
    return r?.result ?? null;
  });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} from ${url}`);
  }
}

/** One plain line for a failed read: what refused it and what to try. */
export function explain(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/\b(403|429)\b/.test(text)) return "The public RPC is limiting requests from this address. Wait a minute, or pass --rpc <url>.";
  if (/timed? ?out|ETIMEDOUT|ECONNRESET|fetch failed|ENOTFOUND/i.test(text)) return `The network could not be reached (${text.split("\n")[0]}). Check the connection, or pass --rpc <url>.`;
  return text.split("\n")[0];
}
