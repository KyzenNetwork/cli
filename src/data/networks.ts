import type { Address } from "viem";
import { deployments, type Deployment } from "./deployments";

// Robinhood Chain networks the data layer can read (SPEC 3.2a, Step 4). Contract addresses
// come only from the generated deployments map (scripts/sync-deployments.mjs): a network
// without a recorded deployment has none, and the chain provider refuses it. Mainnet has
// none until the owner deploys (SPEC Step 9). Client-safe: no server env is read here.
//
// The anvil rehearsal (local, 31337) exists only in a build made with
// NEXT_PUBLIC_KYZEN_NETWORK=local: its RPC and its addresses (the generated, git-ignored
// deployments.local.json) sit behind that build-time constant, so the bundler drops them from
// every other build, and a fresh checkout builds without the file.

export type NetworkName = "mainnet" | "testnet" | "local";

export interface Network {
  name: NetworkName;
  chainId: number;
  rpcUrl: string;
  /** Block explorer; the local anvil has none. */
  explorerUrl: string | null;
  /** Multicall3: the same address on both networks and on an anvil fork of the testnet. */
  multicall3: Address;
  addresses: Deployment | null;
}

export const MULTICALL3: Address = "0xcA11bde05977b3631167028862bE2a173976CA11";

function network(name: NetworkName, chainId: number, rpcUrl: string, explorerUrl: string | null, addresses = deployments[chainId] ?? null): Network {
  return { name, chainId, rpcUrl, explorerUrl, multicall3: MULTICALL3, addresses };
}

// Read directly (not through a variable) so Next.js inlines it and the bundler can drop the
// local branch; the require runs only in a local build.
const localDeployment: Deployment | null =
  process.env.NEXT_PUBLIC_KYZEN_NETWORK === "local"
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("./deployments.local.json") as Deployment | null)
    : null;
const localRpcUrl = process.env.NEXT_PUBLIC_KYZEN_NETWORK === "local" ? "http://127.0.0.1:8546" : "";

export const networks: Readonly<Record<NetworkName, Network>> = {
  mainnet: network("mainnet", 4663, "https://rpc.mainnet.chain.robinhood.com", "https://robinhoodchain.blockscout.com"),
  testnet: network(
    "testnet",
    46630,
    "https://rpc.testnet.chain.robinhood.com",
    "https://explorer.testnet.chain.robinhood.com",
  ),
  // The Step 4 rehearsal: an anvil fork of the testnet with chain id 31337, on port 8546
  // (KYZEN_LOCAL_RPC_URL moves it, src/data/provider.ts). Empty outside a local build.
  local: network("local", 31337, localRpcUrl, null, localDeployment),
};

export function isNetworkName(value: string): value is NetworkName {
  return value === "mainnet" || value === "testnet" || value === "local";
}

/**
 * The network the app (/app) acts on, from NEXT_PUBLIC_KYZEN_NETWORK: mainnet (the default),
 * testnet or local. Next.js inlines the value at build time, in the server and client bundles
 * alike, so one build serves one network. Any other value fails the build.
 */
export function parseAppNetwork(value: string | undefined): NetworkName {
  if (value === undefined || value === "") return "mainnet";
  if (!isNetworkName(value)) throw new Error(`NEXT_PUBLIC_KYZEN_NETWORK must be mainnet, testnet or local, not "${value}"`);
  return value;
}

// Read directly (not through a variable) so Next.js inlines it.
export const appNetwork: Network = networks[parseAppNetwork(process.env.NEXT_PUBLIC_KYZEN_NETWORK)];
