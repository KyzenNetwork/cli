import { keccak256 } from "viem";
import { describe, expect, it } from "vitest";
import { STOCK_INDICES } from "../../src/components/docs/content/silicon-markets/indices";
import { deployments } from "../../src/data/deployments";
import { networks } from "../../src/data/networks";
import { STOCK_TICKERS, stockFeed } from "../../src/data/stock-feeds";
import { landed, STEP_BLOCKS } from "./commands/chain";
import { verdict } from "./commands/verify";
import { CONTRACTS, FEEDS, indexOf, MAINNET } from "./config";
import { parseArgs } from "./main";
import { ago, fixed, move, setColour, spark, table, usd, visible } from "./ui";

setColour(false);

describe("what the CLI reads (SPEC 3.8)", () => {
  it("reads the seven mainnet stock feeds the data layer records, in its order", () => {
    expect(MAINNET.chainId).toBe(4663);
    expect(FEEDS.map((f) => f.ticker)).toEqual(Array.from(STOCK_TICKERS));
    for (const f of FEEDS) expect(f.address).toBe(stockFeed(networks.mainnet, f.ticker));
  });

  it("gives each feed the stage of the index it sits in, and the index baskets the same feeds", () => {
    for (const x of STOCK_INDICES)
      for (const s of x.basket) {
        const f = FEEDS.find((y) => y.ticker === s.ticker);
        expect(f?.address).toBe(s.feed);
        expect(f?.stage).toBe(x.stage);
      }
  });

  it("verifies exactly the five Kyzen Network contracts of the recorded mainnet deployment", () => {
    const d = deployments[4663]!;
    expect(CONTRACTS.map((c) => c.address)).toEqual([d.token, d.reserve, d.staking, d.weightRegistry, d.gateway]);
    // The pair is Uniswap's and is never read (no pool readings, SPEC 3.8).
    expect(CONTRACTS.map((c) => c.address)).not.toContain(d.pair);
  });

  it("finds an index by symbol or slug in any case", () => {
    expect(indexOf("kMEMORY")?.symbol).toBe("kMEMORY");
    expect(indexOf("kmemory")?.symbol).toBe("kMEMORY");
    expect(indexOf("KEQUIP")?.basket.map((s) => s.ticker)).toEqual(["ASML"]);
    expect(indexOf("kGPU")).toBeUndefined();
  });
});

describe("arguments", () => {
  it("reads the command, operands, flags and --rpc in both forms", () => {
    expect(parseArgs(["index", "kfab", "--no-color"])).toEqual({ command: "index", rest: ["kfab"], flags: new Set(["--no-color"]), rpc: undefined });
    expect(parseArgs(["silicon", "--watch", "--rpc", "http://x"]).rpc).toBe("http://x");
    expect(parseArgs(["--rpc=http://y", "chain"]).rpc).toBe("http://y");
    expect(parseArgs(["-h"]).flags.has("--help")).toBe(true);
  });
});

describe("blocks", () => {
  const raw = (n: number, txs: number) => ({ number: `0x${n.toString(16)}`, timestamp: "0x6ace5805", gasUsed: "0x1fd2e", baseFeePerGas: "0x1312d00", transactions: Array(txs).fill("0x") });

  it("keeps the blocks up to the first one not made yet", () => {
    const got = landed([raw(10, 3), raw(11, 1), null, raw(13, 2)]);
    expect(got.map((b) => b.number)).toEqual([BigInt(10), BigInt(11)]);
    expect(got[0]).toMatchObject({ txs: 3, gasUsed: BigInt(130350), baseFee: BigInt(20_000_000) });
  });

  it("asks for more blocks a step than the chain makes in one", () => {
    expect(STEP_BLOCKS).toBeGreaterThan(10);
  });
});

describe("verify", () => {
  const code = "0x6080604052" as const;
  const hash = keccak256(code);

  it("passes an exact match whose verified code is the code on chain", () => {
    expect(verdict({ match: "exact_match", runtimeMatch: "exact_match", runtimeBytecode: { onchainBytecode: code } }, hash)).toEqual({ ok: true, text: "exact match, the code on chain is the verified code" });
  });

  it("fails when Sourcify holds nothing, when the chain holds no code, or when the two codes differ", () => {
    expect(verdict(null, hash).ok).toBe(false);
    expect(verdict({ match: "exact_match" }, null).ok).toBe(false);
    expect(verdict({ match: "exact_match", runtimeBytecode: { onchainBytecode: "0x60806040" } }, hash)).toEqual({ ok: false, text: "the code on chain differs from the verified code" });
  });

  it("labels a partial match as one", () => {
    expect(verdict({ match: "match", runtimeMatch: "match" }, hash).text).toBe("partial match, the code on chain is the verified code");
  });
});

describe("terminal output", () => {
  it("draws a sparkline between the lowest and highest values, a flat one on the middle bar", () => {
    expect(spark([1, 2, 3, 4, 5, 6, 7, 8])).toBe("▁▂▃▄▅▆▇█");
    expect(spark([5, 5, 5])).toBe("▄▄▄");
    expect(spark([])).toBe("");
  });

  it("formats prices, moves and ages", () => {
    expect(usd(1449.87)).toBe("$1,449.87");
    expect(usd(0.5)).toBe("$0.5000");
    expect(move(100, 103.5)).toBe("+3.50%");
    expect(move(100, 99)).toBe("-1.00%");
    expect(move(0, 1)).toBe("n/a");
    expect(ago(1000, 1042)).toBe("42s ago");
    expect(ago(0, 7 * 3600)).toBe("7h ago");
    expect(ago(0, 2 * 86_400 + 5)).toBe("2d ago");
  });

  it("pads table columns by visible width, colour codes left out", () => {
    setColour(true);
    const t = table([["A", "\x1b[32mlong\x1b[39m"], ["wider", "x"]], ["left", "right"]).split("\n");
    setColour(false);
    expect(t.map(visible)).toEqual([11, 11]);
    expect(fixed(["a", "b", "c"], [3, 2])).toBe("a    b   c");
  });
});
