// The four Silicon stock indices: one per stage of the chip supply chain that has stock tokens
// with Chainlink feeds (Power has none). Plain data for the docs pages, their methodology texts
// (public/methodology/<slug>.txt) and the tests that hold the two together.
//
// Sources: docs/superpowers/specs/kyzen-silicon-indices-design.md (the four baskets, equal dollar
// weights at deployment, $100 at the start), SPEC 3.5 (the set), contracts/script/RobinhoodChain.sol
// (each stock's Chainlink feed on Robinhood Chain, NVDA_USD to ASML_USD) and
// contracts/script/testnet/DeploySilicon.s.sol (the names, symbols, slugs and the basket order,
// which is each stock's component number in its StockIndexFeed).

export type IndexStock = { ticker: string; feed: `0x${string}` };
export type StockIndex = {
  /** The docs address under silicon-markets and the methodology file's name. */
  slug: "kdesign" | "kmemory" | "kfab" | "kequip";
  /** The stage, as the Scheduler and the Reserve name it. */
  stage: string;
  symbol: string;
  /** The basket in component order: component i of the index's feed is basket[i]. */
  basket: IndexStock[];
};

export const STOCK_INDICES: StockIndex[] = [
  { slug: "kdesign", stage: "Design", symbol: "kDESIGN", basket: [
    { ticker: "NVDA", feed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15" },
    { ticker: "AMD", feed: "0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72" },
  ] },
  { slug: "kmemory", stage: "Memory", symbol: "kMEMORY", basket: [
    { ticker: "MU", feed: "0x425EEFdCf05ed6526C3cE61Af99429A228a6d596" },
    { ticker: "SNDK", feed: "0xfb133Fa4B7b385802B693a293606682Df47109A3" },
  ] },
  { slug: "kfab", stage: "Fab", symbol: "kFAB", basket: [
    { ticker: "TSM", feed: "0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F" },
    { ticker: "INTC", feed: "0x3f390C5C24628Ac7C489515402235FeAD71D1913" },
  ] },
  { slug: "kequip", stage: "Equipment", symbol: "kEQUIP", basket: [
    { ticker: "ASML", feed: "0xB4106147E8cce40b7d46124090d373A71b70f87D" },
  ] },
];

export const stockIndex = (slug: StockIndex["slug"]) => STOCK_INDICES.find((x) => x.slug === slug)!;

/** Where the docs host serves an index's methodology text, byte for byte (public/methodology). */
export const methodologyFile = (slug: string) => `/methodology/${slug}.txt`;
