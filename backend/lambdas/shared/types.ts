/**
 * PolyAcca Shared Types
 *
 * Single-table DynamoDB entity types and API types
 */

import { createHash } from 'crypto';

// =============================================================================
// DynamoDB Entity Types
// =============================================================================

/**
 * Base entity with common DynamoDB attributes
 */
export interface BaseEntity {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
  TTL?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * User profile entity
 * PK: USER#<walletAddress>
 * SK: PROFILE
 *
 * walletAddress: User's MetaMask wallet (used for authentication)
 * embeddedWalletAddress: Turnkey-managed wallet for trading
 * polymarketSafeAddress: Gnosis Safe deployed on Polymarket for the embedded wallet
 */
export interface UserEntity extends BaseEntity {
  entityType: 'USER';
  walletAddress: string; // MetaMask wallet (identity)
  displayName?: string;
  hasCredentials: boolean; // True when Safe is deployed and credentials derived
  // Embedded wallet fields (created on first auth)
  turnkeyWalletId?: string; // Turnkey wallet ID
  embeddedWalletAddress?: string; // Turnkey-managed EOA address
  polymarketSafeAddress?: string; // Gnosis Safe for trading on Polymarket
}

/**
 * Polymarket signature types for order signing
 */
export type SignatureType = 'EOA' | 'POLY_PROXY' | 'GNOSIS_SAFE';

/**
 * Embedded wallet Polymarket credentials (encrypted)
 * PK: USER#<walletAddress>
 * SK: CREDS#polymarket
 *
 * Derived from Turnkey embedded wallet and cached for reuse.
 * Stored in separate credentials table for security isolation.
 */
export interface EmbeddedWalletCredentialsEntity extends BaseEntity {
  entityType: 'EMBEDDED_WALLET_CREDS';
  walletAddress: string;
  encryptedApiKey: string;
  encryptedApiSecret: string;
  encryptedPassphrase: string;
  signatureType: SignatureType;
}

/**
 * Auth nonce entity (short-lived)
 * PK: NONCE#<walletAddress>
 * SK: NONCE
 */
export interface NonceEntity extends BaseEntity {
  entityType: 'NONCE';
  walletAddress: string;
  nonce: string;
  TTL: number; // Auto-expire after 5 minutes
}

/**
 * Chain leg definition
 */
export interface ChainLeg {
  sequence: number;
  conditionId: string;
  tokenId: string;
  side: 'YES' | 'NO';
  marketQuestion: string;
}

/**
 * Chain entity - shared chain definition (immutable once created)
 * PK: CHAIN#<chainId>
 * SK: DEFINITION
 *
 * The chainId is a deterministic hash of the chain (conditions + sides)
 */
export interface ChainEntity extends BaseEntity {
  entityType: 'CHAIN';
  chainId: string; // Hash of chain: sha256(cond1:side1|cond2:side2|...)
  name?: string; // Human-readable chain name (set via PUT /chains/{id})
  description?: string; // Optional description
  imageKey?: string; // S3 key for chain image (frontend prepends CloudFront domain)
  chain: string[]; // Simple format for debugging: ["conditionId:YES", "conditionId:NO"]
  legs: ChainLeg[]; // Full leg details
  totalValue: number; // Aggregate of all user stakes (USDC)
  status: ChainStatus; // Based on market resolutions
  // Denormalized fields for display (computed at creation)
  categories?: string[]; // Unique categories from underlying markets
  firstMarketEndDate?: string; // Earliest end date among all legs (ISO string)
}

export type ChainStatus =
  | 'ACTIVE' // Markets still open
  | 'WON' // All legs won
  | 'LOST'; // A leg lost

/**
 * UserChain entity - user's stake on a chain
 * PK: CHAIN#<chainId>
 * SK: USER#<walletAddress>
 * GSI1PK: USER#<walletAddress> (for listing user's chains)
 * GSI1SK: CHAIN#<chainId>
 */
export interface UserChainEntity extends BaseEntity {
  entityType: 'USER_CHAIN';
  chainId: string;
  walletAddress: string;
  initialStake: string; // USDC amount as string (to preserve precision)
  currentValue: string; // Current accumulated value
  completedLegs: number; // How many legs have been processed (won + skipped) - kept for backwards compat
  wonLegs?: number; // How many legs were actually WON (not skipped)
  skippedLegs?: number; // How many legs were skipped due to closed markets
  currentLegSequence: number; // Which leg is currently active
  status: UserChainStatus;
  // Platform fee fields (populated when status = WON)
  platformFee?: string; // Fee amount collected (2% of profit)
  platformFeeTxHash?: string; // Transaction hash of fee transfer
  feeCollectionFailed?: boolean; // True if fee collection failed
  feeCollectionError?: string; // Error message if fee collection failed
}

export type UserChainStatus =
  | 'PENDING' // Not started
  | 'ACTIVE' // Currently running
  | 'WON' // All bets won
  | 'LOST' // A bet lost
  | 'CANCELLED' // User cancelled
  | 'FAILED'; // Execution failed (detail on bet)

/**
 * Bet entity - user's individual bet execution within a position
 * PK: CHAIN#<chainId>
 * SK: BET#<walletAddress>#<sequence>
 * GSI1PK: BETSTATUS#<status>
 * GSI1SK: <createdAt>
 * GSI2PK: CONDITION#<conditionId>
 * GSI2SK: BET#<betId>
 */
export interface BetEntity extends BaseEntity {
  entityType: 'BET';
  betId: string;
  chainId: string;
  walletAddress: string;
  sequence: number;
  conditionId: string; // Polymarket condition ID (market identifier)
  tokenId: string; // Polymarket token ID (YES or NO token for order placement)
  marketQuestion: string; // Human-readable market question
  side: 'YES' | 'NO';
  targetPrice: string; // Price to buy at
  stake: string; // Amount to bet (USDC)
  potentialPayout: string; // If win (projected at creation time)
  status: BetStatus;
  orderId?: string; // Polymarket order ID once placed
  executedAt?: string;
  // Fill tracking (set when order fills)
  fillPrice?: string; // Actual price the order filled at
  sharesAcquired?: string; // Actual shares received (stake / fillPrice)
  fillBlockNumber?: number; // Block number when fill was confirmed (for timeboxing redemption lookup)
  // Settlement (set when market resolves)
  settledAt?: string;
  outcome?: 'WON' | 'LOST';
  actualPayout?: string; // Actual payout received (verified from on-chain transfer)
  redemptionTxHash?: string; // Transaction hash of the redemption/payout transfer
  // Slippage fields
  maxPrice?: string; // targetPrice * (1 + slippage)
  maxSlippage?: string; // User's slippage setting (e.g., "0.025")
  requestedStake?: string; // What user intended to bet
  actualStake?: string; // What actually filled (may be less)
  fillPercentage?: string; // e.g., "0.85" for 85%
  priceImpact?: string; // Actual vs target price difference
}

export type BetStatus =
  // Lifecycle
  | 'QUEUED' // Waiting for previous bet to complete
  | 'READY' // Ready to execute (previous bet won)
  | 'EXECUTING' // Order being placed
  | 'PLACED' // Order placed, waiting for fill
  | 'FILLED' // Order filled, waiting for market resolution
  | 'SETTLED' // Market resolved

  // Terminal - User action
  | 'CANCELLED' // User cancelled

  // Terminal - Chain broken
  | 'VOIDED' // Earlier bet lost/failed

  // Terminal - Execution failures
  | 'INSUFFICIENT_LIQUIDITY' // Market lacks liquidity at target price
  | 'NO_CREDENTIALS' // Missing/invalid Polymarket credentials
  | 'ORDER_REJECTED' // Polymarket rejected the order
  | 'MARKET_CLOSED' // Market closed/suspended/resolved
  | 'EXECUTION_ERROR' // Known technical failure (timeout, network, etc.)
  | 'UNKNOWN_FAILURE'; // Unexpected/unclassified failure

/**
 * Market entity - cached Polymarket market data
 * PK: MARKET#<conditionId>
 * SK: MARKET
 * GSI1PK: MARKETSTATUS#<status>
 * GSI1SK: <endDate>
 */
export interface MarketEntity extends BaseEntity {
  entityType: 'MARKET';
  conditionId: string; // Polymarket condition ID
  questionId: string; // Polymarket question ID
  question: string; // Human-readable question
  description?: string;
  yesTokenId: string; // Token ID for YES outcome
  noTokenId: string; // Token ID for NO outcome
  status: MarketStatus;
  endDate: string; // When market closes for trading
  resolutionDate?: string; // When market was resolved
  outcome?: MarketOutcome; // Winning outcome if resolved
  category?: string;
  volume?: string; // Total volume traded
  liquidity?: string; // Current liquidity
  lastSyncedAt: string; // When we last synced from Polymarket
}

/**
 * Market outcome types
 * - YES/NO: Standard binary outcomes
 * - VOID: Market was cancelled, voided, or had a split/invalid resolution
 */
export type MarketOutcome = 'YES' | 'NO' | 'VOID';

export type MarketStatus =
  | 'ACTIVE' // Open for trading
  | 'CLOSED' // Trading closed, awaiting resolution
  | 'RESOLVED' // Market resolved with outcome
  | 'CANCELLED'; // Market cancelled/voided

// =============================================================================
// Chain ID Generation
// =============================================================================

/**
 * Generate a deterministic chain ID from the chain definition
 * Same chain always produces the same ID (idempotent)
 */
export function generateChainId(
  legs: Array<{ conditionId: string; side: 'YES' | 'NO' }>
): string {
  const chain = legs
    .map((l) => `${l.conditionId}:${l.side}`)
    .join('|');

  return createHash('sha256')
    .update(chain)
    .digest('hex')
    .slice(0, 16); // 16 char hex = 64 bits
}

// =============================================================================
// API Request/Response Types
// =============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Auth
export interface NonceRequest {
  walletAddress: string;
}

export interface NonceResponse {
  nonce: string;
  message: string;
}

export interface VerifyRequest {
  walletAddress: string;
  signature: string;
}

export interface VerifyResponse {
  token: string;
  walletAddress: string;
  expiresAt: string;
}

// Wallet Withdraw (signature-based auth)
export interface WithdrawRequest {
  walletAddress: string;
  amount: string; // USDC amount (e.g., "100.00")
  signature: string; // Signature of the withdraw message
}

export interface WithdrawResponse {
  txHash: string;
  amount: string;
  destination: string; // The connected wallet that received funds
}

// Users
export interface UserProfile {
  walletAddress: string; // MetaMask wallet (identity)
  displayName?: string;
  hasCredentials: boolean; // True when Safe is deployed and credentials derived
  createdAt: string;
  admin?: boolean;
  // Embedded wallet info (for funding)
  embeddedWalletAddress?: string; // User funds this address with USDC
  polymarketSafeAddress?: string; // Polymarket Safe address
}

export interface UpdateProfileRequest {
  displayName?: string;
}

// Note: SetCredentialsRequest removed - credentials now derived automatically via embedded wallets

// Chains
export interface CreateLegInput {
  // Existing fields
  conditionId: string;
  tokenId: string;
  marketQuestion: string;
  side: 'YES' | 'NO';
  targetPrice: string;
  // New fields for market storage
  questionId: string;
  yesTokenId: string;
  noTokenId: string;
  endDate: string; // ISO date string
  description?: string; // Optional
  category?: string; // Optional
}

export interface CreatePositionRequest {
  legs: CreateLegInput[];
  initialStake: string;
}

/**
 * Request to customize a chain (name, description, image)
 * Only allowed if chain doesn't already have these set (first-come-first-served)
 */
export interface UpdateChainRequest {
  name?: string;
  description?: string;
  imageData?: string; // Base64-encoded image
  imageContentType?: string; // e.g., "image/jpeg", "image/png"
}

export interface ChainSummary {
  chainId: string;
  name?: string;
  description?: string;
  imageKey?: string; // S3 key - frontend prepends CloudFront domain
  chain: string[]; // Array of "conditionId:side" pairs
  totalValue: number; // Aggregate of all user stakes (USDC)
  status: ChainStatus;
  createdAt: string;
  // Extended fields for trending display
  categories?: string[]; // Unique categories from underlying markets
  firstMarketEndDate?: string; // Earliest end date (for "time to resolution")
  participantCount?: number; // Number of users who've staked on this chain
  completedLegs?: number; // Number of legs that have resolved (chain-wide)
  totalLegs?: number; // Total number of legs in the chain
}

export interface UserChainSummary {
  chainId: string;
  walletAddress: string;
  initialStake: string;
  currentValue: string;
  completedLegs: number;
  totalLegs: number;
  status: UserChainStatus;
  createdAt: string;
}

export interface UserChainDetail extends UserChainSummary {
  chainDefinition: ChainSummary;
  bets: BetSummary[];
}

/**
 * WebSocket connection entity
 * PK: CONN#<connectionId>
 * SK: CONN
 */
export interface ConnectionEntity extends BaseEntity {
  entityType: 'CONNECTION';
  connectionId: string;
  walletAddress?: string; // Optional - may not be authenticated
  connectedAt: string;
  TTL: number; // 24 hour expiry
}

export interface BetSummary {
  betId: string;
  sequence: number;
  conditionId: string;
  tokenId: string;
  marketQuestion: string;
  side: 'YES' | 'NO';
  targetPrice: string;
  stake: string;
  potentialPayout: string;
  status: BetStatus;
  outcome?: 'WON' | 'LOST';
  actualPayout?: string;
}

// =============================================================================
// JWT Types
// =============================================================================

export interface JwtPayload {
  sub: string; // Wallet address
  iat: number;
  exp: number;
}

// =============================================================================
// Polymarket Types
// =============================================================================

export interface PolymarketCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  signatureType: SignatureType;
}

/** Builder credentials (stored in Secrets Manager) for order attribution */
export type BuilderCredentials = Pick<PolymarketCredentials, 'apiKey' | 'apiSecret' | 'passphrase'>;

export interface PolymarketOrder {
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
}

// =============================================================================
// Orderbook Types (for price impact calculation)
// =============================================================================

export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  midPrice: string;
  spread: string;
  timestamp: string;
}

export interface CheckoutLegEstimate {
  conditionId: string;
  displayedPrice: string;
  estimatedFillPrice: string;
  estimatedImpact: string;
  liquidityDepth: string;
  requiresOrderbookFetch: boolean;
}

export interface CheckoutEstimate {
  legs: CheckoutLegEstimate[];
  totalEstimatedCost: string;
  totalImpactPercent: string;
  warnings: string[];
}

// =============================================================================
// Gamma API Types
// =============================================================================

/**
 * Raw market response from Gamma API
 * Reference: https://gamma-api.polymarket.com/markets
 */
export interface GammaApiMarket {
  id: string;
  conditionId: string;
  slug: string;
  category: string;
  question: string;
  description: string;
  outcomes: string; // JSON string: '["Yes", "No"]'
  marketType: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  volume: string;
  volumeNum: number;
  liquidity: string;
  liquidityNum: number;
  outcomePrices: string; // JSON string: '["0.42", "0.58"]'
  clobTokenIds: string; // JSON string: '["123...", "456..."]'
  active: boolean;
  closed: boolean;
  archived: boolean;
  image?: string;
  icon?: string;
  volume24hr?: number;
  volume1wk?: number;
  events?: GammaApiEvent[];
}

export interface GammaApiEvent {
  id: string;
  title: string;
  slug: string;
  category: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Transformed market for frontend consumption
 */
export interface GammaMarket {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  description?: string;
  category: string;
  endDate: string;
  image?: string;
  // Parsed outcome prices
  yesPrice: number;
  noPrice: number;
  // Parsed token IDs
  yesTokenId: string;
  noTokenId: string;
  // Volume and liquidity
  volume: string;
  volumeNum: number;
  liquidity: string;
  liquidityNum: number;
  volume24hr?: number;
  // Status
  active: boolean;
  closed: boolean;
}

/**
 * API response for market listing
 */
export interface MarketsListResponse {
  markets: GammaMarket[];
  total?: number;
  limit: number;
  offset: number;
}

/**
 * Query parameters for market listing
 * Supports server-side filtering and sorting via Gamma API
 */
export interface MarketsQueryParams {
  // Pagination
  limit?: number;
  offset?: number;
  // Status filters
  active?: boolean;
  closed?: boolean;
  // Range filters
  liquidityMin?: number;
  liquidityMax?: number;
  volumeMin?: number;
  volumeMax?: number;
  // Date filters
  endDateMin?: string; // ISO date string
  endDateMax?: string; // ISO date string
  // Sorting - maps to Gamma API field names
  order?: 'volume' | 'liquidity' | 'endDate' | 'startDate' | 'volume24hr';
  ascending?: boolean;
  // Tag filter (server-side category)
  tagId?: number;
}
