import {
  BaseError,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type ContractFunctionParameters,
  type ContractFunctionReturnType,
  type PublicClient,
} from "viem";
import type { Network } from "./networks";

// The chain provider's reads: calls sent together in one Multicall3 aggregate3 call, each result
// decoded against its contract's ABI. A read the snapshot cannot go without throws, naming the
// read (Results.get); one it tolerates missing gives undefined (Results.find).

export type Mutability = "pure" | "view";
type Outcome = { status: "success"; result: unknown } | { status: "failure"; error: unknown };

export interface Slot<T> {
  readonly index: number;
  readonly label: string;
  /** Phantom: the decoded result type. */
  readonly result?: T;
}

/** Reads sent together in one Multicall3 aggregate3 call. */
export class Batch {
  private readonly calls: ContractFunctionParameters[] = [];

  read<
    const abi extends Abi,
    name extends ContractFunctionName<abi, Mutability>,
    const args extends ContractFunctionArgs<abi, Mutability, name>,
  >(label: string, address: Address, abi: abi, functionName: name, args?: args) {
    this.calls.push({ address, abi, functionName, args } as ContractFunctionParameters);
    const slot: Slot<ContractFunctionReturnType<abi, Mutability, name, args>> = { index: this.calls.length - 1, label };
    return slot;
  }

  async send(client: PublicClient, network: Network): Promise<Results> {
    if (this.calls.length === 0) return new Results(network, []);
    const outcomes = await client.multicall({
      contracts: this.calls,
      allowFailure: true,
      multicallAddress: network.multicall3,
      batchSize: 0, // one aggregate3 call, whatever the calldata size
    });
    return new Results(network, outcomes as Outcome[]);
  }
}

export class Results {
  constructor(
    private readonly network: Network,
    private readonly outcomes: readonly Outcome[],
  ) {}

  /** A value the snapshot cannot go without: throws, naming the read, when it failed. */
  get<T>(slot: Slot<T>): T {
    const outcome = this.outcomes[slot.index];
    if (outcome.status === "success") return outcome.result as T;
    throw new Error(`chain provider (${this.network.name}): ${slot.label} could not be read: ${reason(outcome.error)}`, {
      cause: outcome.error,
    });
  }

  /** A value the Reserve itself tolerates missing: undefined when it failed. */
  find<T>(slot: Slot<T>): T | undefined {
    const outcome = this.outcomes[slot.index];
    return outcome.status === "success" ? (outcome.result as T) : undefined;
  }
}

export function reason(error: unknown): string {
  if (error instanceof BaseError) return [error.shortMessage, error.details].filter(Boolean).join(" ");
  return error instanceof Error ? error.message : String(error);
}
