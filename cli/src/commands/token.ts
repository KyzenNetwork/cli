import { formatUnits } from "viem";
import { kyznAbi } from "../../../src/data/abi/kyzn";
import { aggregatorAbi } from "../../../src/data/abi/aggregator";
import { kyznUsdOracleAbi } from "../../../src/data/abi/kyznUsdOracle";
import { pairAbi } from "../../../src/data/abi/pair";
import { reserveAbi } from "../../../src/data/abi/reserve";
import { stakingAbi } from "../../../src/data/abi/staking";
import { MAINNET } from "../config";
import type { Context } from "../context";
import { explain } from "../rpc";
import { bold, dim, heading, int, out, table, usd, warn } from "../ui";

// `kyzen token`: $KYZN on mainnet, read now. The price is the pool's spot price (the $KYZN/WETH pair's
// reserves times Chainlink ETH/USD), as charts show it; the Silicon $KYZN oracle's value (the lower of
// its 1-hour and 24-hour pool averages, what the vault prices collateral at) is its own line, and lags a
// moving market by design (owner decisions 2026-10-17, SPEC 3.8). The rest is the token, the Staking
// contract and the Reserve.

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
  // The pool's spot price: WETH per $KYZN from the reserves, times Chainlink ETH/USD.
  const ethUsdFeed = a.other.ethUsdFeed ?? "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9";
  const reserves = await ctx.client.readContract({ address: a.pair, abi: pairAbi, functionName: "getReserves" });
  const token0 = await ctx.client.readContract({ address: a.pair, abi: pairAbi, functionName: "token0" });
  const round = await ctx.client.readContract({ address: ethUsdFeed, abi: aggregatorAbi, functionName: "latestRoundData" });
  const feedDecimals = await ctx.client.readContract({ address: ethUsdFeed, abi: aggregatorAbi, functionName: "decimals" });
  const kyznFirst = token0.toLowerCase() === a.token.toLowerCase();
  const kyznReserve = units(kyznFirst ? reserves[0] : reserves[1]);
  const wethReserve = units(kyznFirst ? reserves[1] : reserves[0]);
  const ethUsd = Number(formatUnits(round[1], Number(feedDecimals)));
  const spot = kyznReserve > 0 ? (wethReserve / kyznReserve) * ethUsd : null;
  const burned = INITIAL_SUPPLY - supply;
  const rows: string[][] = [
    [dim("Price"), spot === null ? warn("the pool holds no $KYZN") : bold(usd(spot)), dim("pool spot: $KYZN/WETH reserves x Chainlink ETH/USD")],
    [dim("Market cap"), spot === null ? dim("n/a") : usd(spot * supply), dim("price x supply")],
    [dim("Liquidity"), usd(wethReserve * ethUsd * 2), dim(`${int(Math.round(kyznReserve))} $KYZN and ${wethReserve.toFixed(4)} WETH in the pool`)],
    [dim("Oracle"), price === null ? warn(why) : usd(price), dim(price === null ? "" : "vault pricing: lower of the 1 h and 24 h pool averages")],
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
