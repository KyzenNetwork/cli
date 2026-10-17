import { formatUnits } from "viem";
import { kyznAbi } from "../../../src/data/abi/kyzn";
import { kyznUsdOracleAbi } from "../../../src/data/abi/kyznUsdOracle";
import { reserveAbi } from "../../../src/data/abi/reserve";
import { stakingAbi } from "../../../src/data/abi/staking";
import { MAINNET } from "../config";
import type { Context } from "../context";
import { explain } from "../rpc";
import { bold, dim, heading, int, out, table, usd, warn } from "../ui";

// `kyzen token`: $KYZN on mainnet, read now. The price is the Silicon $KYZN oracle's (the lower of its
// 1-hour and 24-hour pool averages times Chainlink ETH/USD, owner decision 2026-10-17), the rest is the
// token, the Staking contract and the Reserve.

const INITIAL_SUPPLY = 1_000_000_000;


/** The readyAt of the oracle's TwapNotReady(readyAt) revert, or null for any other failure. */
export function readyAtOf(e: unknown): number | null {
  const data = (e as { cause?: { data?: { errorName?: string; args?: readonly unknown[] } } })?.cause?.data;
  return data?.errorName === "TwapNotReady" && typeof data.args?.[0] === "bigint" ? Number(data.args[0]) : null;
}

const units = (v: bigint) => Number(formatUnits(v, 18));
const share = (part: number, whole: number) => `${((part / whole) * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export async function token(ctx: Context): Promise<number> {
  const a = ctx.network.addresses;
  out(heading("$KYZN"));
  out(dim(`Robinhood Chain ${MAINNET.chainId}, read now`));
  out();
  if (!a) {
    out("No mainnet deployment is recorded.");
    return 1;
  }
  const oracle = a.other["silicon.oracle"];
  // One read after another: the public RPC sees one call at a time.
  const supply = units(await ctx.client.readContract({ address: a.token, abi: kyznAbi, functionName: "totalSupply" }));
  const staked = units(await ctx.client.readContract({ address: a.staking, abi: stakingAbi, functionName: "totalStaked" }));
  const [value] = await ctx.client.readContract({ address: a.reserve, abi: reserveAbi, functionName: "reserveValue" });
  const reserveUsd = units(value);
  let price: number | null = null;
  let why = "no Silicon oracle is recorded";
  if (oracle) {
    try {
      price = units(await ctx.client.readContract({ address: oracle, abi: kyznUsdOracleAbi, functionName: "price" }));
    } catch (e) {
      // TwapNotReady(readyAt): the oracle prices once it has 24 hours of observations.
      const readyAt = readyAtOf(e);
      why = readyAt ? `prices from ${new Date(readyAt * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC` : `no price yet (${explain(e)})`;
    }
  }
  const burned = INITIAL_SUPPLY - supply;
  const rows: string[][] = [
    [dim("Price"), price === null ? warn(why) : bold(usd(price)), dim(price === null ? "" : "$KYZN oracle: lower of the 1 h and 24 h pool averages")],
    [dim("Market cap"), price === null ? dim("n/a") : usd(price * supply), dim("price x supply")],
    [dim("Supply"), int(Math.round(supply)), dim(`of ${int(INITIAL_SUPPLY)} minted at launch; no mint function`)],
    [dim("Burned"), int(Math.round(burned)), dim(`${share(burned, INITIAL_SUPPLY)} of the launch supply`)],
    [dim("Staked"), int(Math.round(staked)), dim(`${share(staked, supply)} of supply, earning 1% of every trade in ETH`)],
    [dim("Reserve"), usd(reserveUsd), dim("tokenized chip stocks and ETH, at Chainlink prices")],
    [dim("Backing"), usd(reserveUsd / supply), dim("Reserve value per $KYZN")],
  ];
  out(table(rows, ["left", "right", "left"]));
  out();
  out(`${dim("Token")}  ${a.token}`);
  out(`${dim("Scan")}   ${MAINNET.explorerUrl}/token/${a.token}`);
  return 0;
}
