# Kyzen Network CLI

`kyzen` reads Kyzen Network's public data on Robinhood Chain from a terminal. It is read-only: no keys, no wallet and no token needed.

## Install

Node 20 or later:

```sh
npm i -g kyzen-cli
```

The command it installs is `kyzen`. The same package is served by Kyzen Network itself: `npm i -g https://kyzen.network/dl/kyzen-0.1.0.tgz`.

## Commands

| Command | Shows |
|---|---|
| `kyzen silicon [--watch]` | The seven chip stock feeds (NVDA, AMD, MU, SNDK, TSM, INTC, ASML): price, stage, the last 16 rounds, last update |
| `kyzen index <name>` | A stage index (kDESIGN, kMEMORY, kFAB, kEQUIP): its basket, its methodology, each component's live price and its move over 24 hours and 7 days |
| `kyzen feeds [--tail]` | The latest Chainlink round of each feed; with `--tail`, every round as it lands |
| `kyzen chain [--watch]` | Robinhood Chain blocks as they land: number, transactions, gas |
| `kyzen verify` | Each mainnet Kyzen Network contract's verified source on Sourcify and its code hash on chain |
| `kyzen status` | Contracts deployed, SI Gateway health, Silicon indices on testnet |

Options: `--rpc <url>` reads through another Robinhood Chain RPC; `--no-color` (or `NO_COLOR`) prints plain text.

## What it reads

Chainlink feeds and contracts on Robinhood Chain (chain ID 4663) through the public RPC and Multicall3, contract sources on Sourcify, and the SI Gateway's health at `https://app.kyzen.network/v1/health`. Nothing else, and nothing is sent.

## Build from source

Node 20 or later:

```sh
npm install
npm test
npm run build
```

`npm run build` bundles `cli/src/bin.ts` with viem into one file, `cli/pkg/kyzen.js`, and packs it as `public/dl/kyzen-<version>.tgz`, the file kyzen.network serves.

## Layout

- `cli/`: the CLI itself and the published package's manifest.
- `src/`: the files it shares with the Kyzen Network app, at the same paths: the Robinhood Chain networks and the recorded deployments, the Chainlink stock feeds, the four stage indices' baskets, the Multicall3 reads, the round history reader and the banner's letters. The app and the CLI read the same addresses from the same files.

Docs: https://docs.kyzen.network/cli · Source: https://github.com/KyzenNetwork/cli

MIT License.
