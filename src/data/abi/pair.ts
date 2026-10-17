// Uniswap v2 pair reads: the $KYZN/WETH pool the app's live board follows.
// Written by hand in scripts/export-abis.mjs; do not edit here.
export const pairAbi = [
  {
    "type": "function",
    "name": "getReserves",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "reserve0",
        "type": "uint112"
      },
      {
        "name": "reserve1",
        "type": "uint112"
      },
      {
        "name": "blockTimestampLast",
        "type": "uint32"
      }
    ]
  },
  {
    "type": "function",
    "name": "token0",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address"
      }
    ]
  }
] as const;
