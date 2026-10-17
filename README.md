# Kyzen Network CLI

`kyzen` reads Kyzen Network's public data on Robinhood Chain from a terminal. It is read-only: no keys, no wallet and no token needed.

## Install

Node 20 or later:

```sh
npm i -g kyzen-cli
```

The command it installs is `kyzen`.

The same package is served by Kyzen Network itself: `npm i -g https://kyzen.network/dl/kyzen-0.2.1.tgz`.

## Commands

| Command | Shows |
|---|---|
| `kyzen token` | $KYZN: its pool price, market cap and liquidity, the Silicon $KYZN oracle's price, supply, burned, staked, the Reserve and the backing per token |
| `kyzen markets` | The four kSynthetics markets on mainnet: index level, limit, minted, open or closed, fees and the mint window |
| `kyzen silicon [--watch]` | The seven chip stock feeds (NVDA, AMD, MU, SNDK, TSM, INTC, ASML): price, stage, the last 16 rounds, last update |
| `kyzen index <name>` | A stage index (kDESIGN, kMEMORY, kFAB, kEQUIP): its basket, its methodology, each component's live price and its move over 24 hours and 7 days, then its level and market on mainnet |
| `kyzen feeds [--tail]` | The latest Chainlink round of each feed; with `--tail`, every round as it lands |
| `kyzen chain [--watch]` | Robinhood Chain blocks as they land: number, transactions, gas |
| `kyzen verify` | Each mainnet Kyzen Network contract's verified source on Sourcify and its code hash on chain, the fifteen Silicon contracts included |
| `kyzen status` | Contracts deployed, AI Gateway health, Silicon on mainnet |

Options: `--rpc <url>` reads through another Robinhood Chain RPC; `--no-color` (or `NO_COLOR`) prints plain text.

## What it reads

Chainlink feeds and contracts on Robinhood Chain (chain ID 4663) through the public RPC and Multicall3, the $KYZN pool, the Silicon vault and $KYZN oracle, contract sources on Sourcify, and the AI Gateway's health at `https://app.kyzen.network/v1/health`. Nothing else, and nothing is sent.

Docs: https://docs.kyzen.network/cli · Source: https://github.com/KyzenNetwork/cli

MIT License.
