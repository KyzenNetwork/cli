import type { Address } from "viem";
import type { Network } from "./networks";

// The Chainlink feeds of the seven stock tokens (SPEC 3.2a), by ticker. Mainnet: the Robinhood Chain
// feeds the contracts name (contracts/script/RobinhoodChain.sol, the *_USD constants); testnet and the
// local rehearsal: the stand-in feeds the Silicon deployment recorded (silicon.stockFeeds.<TICKER>).

export const STOCK_TICKERS = ["NVDA", "AMD", "MU", "SNDK", "TSM", "INTC", "ASML"] as const;

const MAINNET: Readonly<Record<string, Address>> = {
  NVDA: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
  AMD: "0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72",
  MU: "0x425EEFdCf05ed6526C3cE61Af99429A228a6d596",
  SNDK: "0xfb133Fa4B7b385802B693a293606682Df47109A3",
  TSM: "0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F",
  INTC: "0x3f390C5C24628Ac7C489515402235FeAD71D1913",
  ASML: "0xB4106147E8cce40b7d46124090d373A71b70f87D",
};

/** The feed of a stock token on `network`; null where the network records none. */
export function stockFeed(network: Network, ticker: string): Address | null {
  if (network.chainId === 4663) return MAINNET[ticker] ?? null;
  return network.addresses?.other[`silicon.stockFeeds.${ticker}`] ?? null;
}
