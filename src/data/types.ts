// Data layer types, SPEC.md Step 3. Every on-chain value the UI shows flows
// through KyzenSnapshot. Swapping providers must require no UI changes.
import type { Address } from "viem";
import type { Network } from "./networks";
import type { RoundReader } from "./history";

export type Stage = "design" | "memory" | "fab" | "equipment" | "power";

/** Chip equity held by the Reserve, plus ETH from the tax awaiting conversion (SPEC 3.2). */
export type ReserveAsset = "NVDA" | "AMD" | "MU" | "SNDK" | "TSM" | "INTC" | "ASML" | "ETH";

export interface ReserveHolding {
  asset: ReserveAsset;
  /** Token units held by the Reserve. */
  balance: number;
  valueUsd: number;
}

export interface StageWeights {
  design: number;
  memory: number;
  fab: number;
  equipment: number;
  power: number;
}

/** One scorecard reading, as the latest memo records it. */
export interface SchedulerReading {
  /** The scorecard input's id: "hbm-contract". */
  input: string;
  /** The SPEC 3.4 input: "HBM contract prices". */
  name: string;
  stage: Stage;
  /** 0 slack, 1 easing, 2 balanced, 3 tight, 4 binding. */
  reading: number;
  note: string;
  /** https links. */
  sources: string[];
}

/** The latest rotation's memo: present only once its bytes match the registry's memoHash (SPEC Step 6). */
export interface SchedulerMemo {
  /** The registry's index; the docs and the posts number rotations from 1. */
  rotation: number;
  /** The month the scorecard reads: "2026-11". */
  month: string;
  /** ISO time the rotation executes. */
  executesAt: string;
  /** The constraint the memo names: "HBM". */
  bottleneckLabel: string;
  /** The rulebook version that set the weights: "v1". */
  rulebook: string;
  /** "rulebook", or "model:<id>". */
  writer: string;
  /** Test readings, not a market assessment. */
  dryRun: boolean;
  readings: SchedulerReading[];
  /** Markdown: paragraphs and "- " lists. */
  text: string;
  /** keccak-256 of the memo's bytes, as the registry records it. */
  hash: string;
  /** The registry's memoURI. */
  url: string;
}

export interface SchedulerState {
  /** The stage the latest memo names as binding, once that memo's hash is verified. Null until then. */
  bottleneck: Stage | null;
  weights: StageWeights | null;
  /** ISO date of the memo that set the current weights. */
  asOf: string | null;
  memoUrl: string | null;
  /** ISO date the next rotation executes. */
  nextRotation: string | null;
  /** The latest rotation's memo, verified against its on-chain hash; null when there is none or it does not verify. */
  memo: SchedulerMemo | null;
}

export interface GatewayState {
  /** From the Gateway service (SPEC Step 5); null when it could not be read: never a zero in its place. */
  requestsServed: number | null;
  /** KYZN burned by Gateway usage, lifetime (the settlement contract). */
  burnedKyzn: number;
  /** KYZN burned by Gateway usage over the trailing 24 hours (the Gateway service); null when unread. */
  burnedLast24hKyzn: number | null;
  /** Models currently serving requests (the Gateway service); null when unread. */
  modelsOnline: number | null;
}

export interface StakingState {
  /** $KYZN currently staked. */
  totalStakedKyzn: number;
  /** Lifetime ETH streamed to stakers (SPEC 3.3). */
  paidToStakersEth: number;
  /** ETH funded into the staking contract by the most recent 24-hour funding. */
  lastFundingEth: number;
  /** ISO time of the most recent notifyRewards() call. */
  lastFundingAt: string | null;
  /** ISO time the next funding becomes callable. */
  nextFundingAt: string | null;
}

/** One stock of a Silicon index's basket. */
export interface SiliconComponent {
  /** The stock's ticker: "NVDA". The feed's address when no ticker can be told from it. */
  ticker: string;
  /** The component's Chainlink feed. */
  feed: Address;
  /** Stock units one index unit holds. */
  quantity: number;
}

/**
 * A Silicon setting that bears on open positions: a market's borrow fee, liquidation penalty and
 * feed, and the vault's auction duration, starting premium, floor and fee router. Once positions
 * can exist, the vault queues a change of one for 24 hours (SiliconVault.SETTING_DELAY).
 */
export type SiliconSetting = "borrowFee" | "liquidationPenalty" | "feed" | "auctionDuration" | "auctionStartPremium" | "auctionFloor" | "feeRouter";

/** A queued change (SiliconVault.pendingSettings): anyone may apply it from `effectiveAt` on; until then the value in force stays. */
export interface SiliconPendingSetting {
  setting: SiliconSetting;
  /** The queued value: basis points (the borrow fee per year, the penalty, the premium, the floor) or seconds (the duration); null for an address. */
  value: number | null;
  /** The queued address (the feed, the fee router); null for a number. */
  address: Address | null;
  /** Unix seconds from which anyone may apply it. */
  effectiveAt: number;
}

/**
 * One Silicon index market (SPEC 3.5), as the vault and its feed report it. A value the chain
 * could not give is null (the price) or false (a freshness flag): never a stand-in number.
 */
export interface SiliconMarket {
  /** The vault's market id (0 to 3: Design, Memory, Fab, Equipment). */
  id: number;
  /** The synth's ERC-20 symbol: "kDESIGN". */
  symbol: string;
  /** The synth's ERC-20 name. */
  name: string;
  synth: Address;
  /** The index feed. */
  feed: Address;
  /** The owner has opened the market. */
  open: boolean;
  mintsPaused: boolean;
  /**
   * The index in USD (feed.latestPrice); null before the feed's first price, while a component
   * cannot be read, and while the market is stopped (latestPrice does not consult the breaker).
   */
  price: number | null;
  /** Unix seconds the oldest component was updated; null with the price. */
  priceUpdatedAt: number | null;
  /** feed.isFresh(): the price may be minted against now (window open, nothing stale, nothing stopped). False when it could not be read. */
  fresh: boolean;
  /** feed.isFreshForLiquidation(): the price may start a liquidation. False when it could not be read. */
  freshForLiquidation: boolean;
  /**
   * The breaker has stopped a component (feed.jumped(i): a move of more than 30%, a round it cannot
   * read, or a quantity change the guardian has not cleared): no mints, no liquidations, no price
   * shown. True also when a component's flag, or the basket, cannot be read.
   */
  stopped: boolean;
  /**
   * A component waits for the guardian's clear after a quantity change (feed.needsClear(i)): the one
   * stop known to need the guardian. False when it could not be read.
   */
  needsClear: boolean;
  /** feed.paused(): the guardian has paused the index for mints. False when it could not be read. */
  paused: boolean;
  /** The basket, in the feed's order; empty when the feed could not be read. */
  components: SiliconComponent[];
  mintFeeBps: number;
  borrowFeeBpsPerYear: number;
  liquidationPenaltyBps: number;
  /** The most synth the market may owe in all (totalDebt, auctionDebt and badDebt together), in synth units (18 decimals). */
  debtCeiling: number;
  /** Synth owed by positions, borrow fee included, as of the last drip. */
  totalDebt: number;
  /** The least synth a position may owe, other than nothing. */
  minDebt: number;
  /** Synth owed by running auctions, and synth owed by no one: both count against the ceiling with totalDebt. */
  auctionDebt: number;
  badDebt: number;
  /** The same amounts exact, as decimal strings (wei, 18 decimals), so the snapshot survives JSON (PoolState does the same). */
  wei: { debtCeiling: string; totalDebt: string; minDebt: string; auctionDebt: string; badDebt: string };
  /** This market's queued changes (borrow fee, liquidation penalty, feed), in that order; empty when none, or the vault cannot list them. */
  pending: SiliconPendingSetting[];
}

/** The Silicon vault and its markets (SPEC 3.5). */
export interface SiliconState {
  vault: Address;
  usdg: Address;
  /** USD per $KYZN from the oracle (pool average x ETH/USD); null while the oracle cannot give one. */
  kyznUsd: number | null;
  /** The share of the oracle value an auction's price falls to, in basis points. */
  auctionFloorBps: number;
  /** How far above the oracle value an auction's price starts, in basis points. */
  auctionStartPremiumBps: number;
  /** Seconds an auction's price takes to fall from its start to its floor. */
  auctionDuration: number;
  /** Where fee synth goes; null when it could not be read. */
  feeRouter: Address | null;
  /** The vault-wide queued changes (auction duration, starting premium, floor, fee router), in that order; empty when none, or the vault cannot list them. */
  pending: SiliconPendingSetting[];
  /** Every market the deployment records, by id. */
  markets: SiliconMarket[];
}

export interface KyzenSnapshot {
  contractAddress: string | null;
  totalSupply: number | null;
  /** Reserve value divided by total supply (SPEC 3.2). */
  backingPerKyznUsd: number;
  reserveValueUsd: number;
  reserveHoldings: ReserveHolding[];
  staking: StakingState;
  /** Lifetime KYZN burned by Gateway usage. */
  burnedByUsageKyzn: number;
  /**
   * Synth owed by positions (each Silicon market's totalDebt) at its index price, summed; 0 with
   * nothing owed (SPEC 3.5). Null while a market that owes synth has no usable price (none, or
   * stopped): never a partial sum.
   */
  mintedSyntheticsUsd: number | null;
  /** The Silicon vault and its markets; null where the deployment records no Silicon (mainnet until launch). */
  silicon: SiliconState | null;
  scheduler: SchedulerState;
  gateway: GatewayState;
  generatedAt: string;
}

/** The $KYZN/WETH pool and the token's live tax, for the app's live board. */
export interface PoolState {
  /** The pool's reserves, in wei (decimal strings, so the value survives JSON). */
  kyznWei: string;
  wethWei: string;
  /** The pair's last reserve update: its blockTimestampLast, in unix seconds. */
  updatedAt: number;
  /** The token's tax on buys and on sells, in basis points. */
  buyTaxBps: number;
  sellTaxBps: number;
}

export interface KyzenProvider {
  readonly id: string;
  getSnapshot(): Promise<KyzenSnapshot>;
  /** The pool as it is now; null where there is no pool to read (the stub). */
  getPool(): Promise<PoolState | null>;
  /** Chainlink rounds on the provider's network, for price history; null where there is no chain to read (the stub). */
  getRoundReader(): { network: Network; reader: RoundReader } | null;
}

/** Payout mode a staker selects in the app (SPEC 3.3). */
export type PayoutMode = "eth" | "compound" | "equity";

/** A Reserve asset as the app shows it to one wallet (Redeem view). */
export interface WalletReserveAsset {
  /** The stock token's address. */
  token: string;
  /** ERC-20 symbol; the token address when the symbol cannot be read. */
  symbol: string;
  /** Whether the Reserve's balance of the token can be read. Redemption skips an unreadable one, and its share stays in the Reserve. */
  readable: boolean;
  /** Tokens the Reserve owes this wallet from a redemption made while the token could not transfer (SPEC 3.2). */
  claim: number;
  claimWei: bigint;
  /**
   * What claiming pays now: the claim in full while the Reserve holds what is claimed; after an
   * issuer burn below that, claim x balance / total claimed, rounded down (SPEC 3.2). Null while
   * the Reserve's balance cannot be read (the claim then reverts and stays recorded).
   */
  claimPaysWei: bigint | null;
}

/** Per-wallet position read by the app at /app. */
export interface WalletPosition {
  address: string;
  /** Unstaked $KYZN in the wallet. */
  kyznBalance: number;
  stakedKyzn: number;
  /** ETH streamed to this staker and not yet claimed. */
  claimableEth: number;
  payoutMode: PayoutMode;
  /** $KYZN staked by everyone, read in the same call as the position. */
  totalStakedKyzn: number;
  /** Staking.equityEnabled: the owner switch for chip-equity payouts, off until counsel review (SPEC 3.3). */
  equityEnabled: boolean;
  /** The same amounts in wei (18 decimals), exact, for transactions; and the wallet's $KYZN approvals. */
  wei: {
    kyznBalance: bigint;
    stakedKyzn: bigint;
    claimableEth: bigint;
    stakingAllowance: bigint;
    reserveAllowance: bigint;
  };
  /** Every asset the Reserve lists, in its order. */
  reserveAssets: WalletReserveAsset[];
  /** False when Reserve.reserveValue() reports oldestUpdate 0: a holding's balance or price could not be read. */
  reserveComplete: boolean;
}

/** Reserve.previewRedeem(amount): exactly what redeem(amount) pays now, asset by asset. */
export interface RedeemPreview {
  /** $KYZN burned, in wei. */
  amountWei: bigint;
  ethOutWei: bigint;
  /** Every listed asset, in the Reserve's order; 0 for one not held or unreadable. */
  assets: { token: string; amountWei: bigint }[];
}

/** SiliconVault.health(): a position's value and ratio at the latest prices, whatever their age. */
export interface SiliconPositionHealth {
  collateralValueUsd: number;
  debtValueUsd: number;
  /** Collateral value over debt value in basis points; null when the position owes nothing. */
  ratioBps: number | null;
  /** The $KYZN share of the collateral's value, in basis points. */
  kyznShareBps: number;
}

/** One wallet's position in one Silicon market. */
export interface SiliconMarketPosition {
  id: number;
  /** Collateral in the vault, in tokens: $KYZN (18 decimals) and USDG (its own decimals). */
  kyznDeposited: number;
  usdgDeposited: number;
  /** debtOf(): what a full repay burns now, borrow fee accrued included, in synth units. */
  debt: number;
  /** The wallet's own balance of this market's synth. */
  synthBalance: number;
  /**
   * The vault's reading of the position; null when it cannot be had: the oracle has no $KYZN price,
   * or the position owes synth while the index has no price.
   */
  health: SiliconPositionHealth | null;
  /** The same amounts exact: collateral and synth in wei of their token, debt in synth wei. */
  wei: { kyznDeposited: bigint; usdgDeposited: bigint; debt: bigint; synthBalance: bigint };
}

/**
 * The wallet's Silicon balances, approvals and positions. Repaying burns the caller's synth in the
 * vault (SiliconSynth.burn takes no allowance), so no synth approval is read.
 */
export interface SiliconWalletPosition {
  vault: Address;
  usdg: Address;
  /** USDG's decimals (6 on Robinhood Chain's USDG). */
  usdgDecimals: number;
  /** In tokens. */
  kyznBalance: number;
  usdgBalance: number;
  /** Exact, in each token's smallest unit; the allowances are to the vault. */
  wei: { kyznBalance: bigint; kyznAllowance: bigint; usdgBalance: bigint; usdgAllowance: bigint };
  /** Every market the deployment records, by id. */
  markets: SiliconMarketPosition[];
}

export interface WalletProvider {
  readonly id: string;
  getPosition(address: string): Promise<WalletPosition>;
  /** The wallet's Silicon position; null where the network's deployment records no Silicon. */
  getSiliconPosition(address: string): Promise<SiliconWalletPosition | null>;
  /** $KYZN that `ethWei` buys through the $KYZN/WETH pool now (Router02 getAmountsOut; a Compound buy is tax-free). */
  quoteCompound(ethWei: bigint): Promise<bigint>;
  previewRedeem(kyznWei: bigint): Promise<RedeemPreview>;
}
