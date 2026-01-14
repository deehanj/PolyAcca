/**
 * PolyAcca Shared Types
 *
 * Single-table DynamoDB entity types and API types
 */

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
 */
export interface UserEntity extends BaseEntity {
  entityType: 'USER';
  walletAddress: string;
  displayName?: string;
  hasCredentials: boolean;
}

/**
 * User Polymarket credentials (encrypted)
 * PK: USER#<walletAddress>
 * SK: CREDS#polymarket
 */
export interface UserCredsEntity extends BaseEntity {
  entityType: 'USER_CREDS';
  walletAddress: string;
  encryptedApiKey: string;
  encryptedApiSecret: string;
  encryptedPassphrase: string;
  signatureType: number; // 0=EOA, 1=POLY_PROXY, 2=GNOSIS_SAFE
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
 * Accumulator entity - a chain of bets
 * PK: USER#<walletAddress>
 * SK: ACCA#<accumulatorId>
 * GSI1PK: STATUS#<status>
 * GSI1SK: <createdAt>
 */
export interface AccumulatorEntity extends BaseEntity {
  entityType: 'ACCUMULATOR';
  accumulatorId: string;
  walletAddress: string;
  name: string;
  status: AccumulatorStatus;
  initialStake: string; // USDC amount as string (to preserve precision)
  currentValue: string; // Current accumulated value
  totalBets: number;
  completedBets: number;
  currentBetSequence: number; // Which bet in the chain is active
}

export type AccumulatorStatus =
  | 'PENDING' // Not started
  | 'ACTIVE' // Currently running
  | 'WON' // All bets won
  | 'LOST' // A bet lost
  | 'CANCELLED'; // User cancelled

/**
 * Bet entity - individual bet in an accumulator
 * PK: ACCA#<accumulatorId>
 * SK: BET#<sequence> (padded, e.g., BET#001)
 * GSI1PK: BETSTATUS#<status>
 * GSI1SK: <createdAt>
 * GSI2PK: CONDITION#<conditionId>
 * GSI2SK: BET#<betId>
 */
export interface BetEntity extends BaseEntity {
  entityType: 'BET';
  betId: string;
  accumulatorId: string;
  walletAddress: string;
  sequence: number;
  conditionId: string; // Polymarket condition ID (market identifier)
  tokenId: string; // Polymarket token ID (YES or NO token for order placement)
  marketQuestion: string; // Human-readable market question
  side: 'YES' | 'NO';
  targetPrice: string; // Price to buy at
  stake: string; // Amount to bet (USDC)
  potentialPayout: string; // If win
  status: BetStatus;
  orderId?: string; // Polymarket order ID once placed
  executedAt?: string;
  settledAt?: string;
  outcome?: 'WON' | 'LOST';
  actualPayout?: string;
}

export type BetStatus =
  | 'QUEUED' // Waiting for previous bet to complete
  | 'READY' // Ready to execute (previous bet won)
  | 'EXECUTING' // Order being placed
  | 'PLACED' // Order placed, waiting for fill
  | 'FILLED' // Order filled, waiting for market resolution
  | 'SETTLED' // Market resolved
  | 'CANCELLED'; // Bet cancelled

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
  outcome?: 'YES' | 'NO'; // Winning outcome if resolved
  category?: string;
  volume?: string; // Total volume traded
  liquidity?: string; // Current liquidity
  lastSyncedAt: string; // When we last synced from Polymarket
}

export type MarketStatus =
  | 'ACTIVE' // Open for trading
  | 'CLOSED' // Trading closed, awaiting resolution
  | 'RESOLVED' // Market resolved with outcome
  | 'CANCELLED'; // Market cancelled/voided

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

// Users
export interface UserProfile {
  walletAddress: string;
  displayName?: string;
  hasCredentials: boolean;
  createdAt: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
}

export interface SetCredentialsRequest {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  signatureType?: number;
}

// Accumulators
export interface CreateAccumulatorRequest {
  name: string;
  initialStake: string;
  bets: CreateBetInput[];
}

export interface CreateBetInput {
  conditionId: string;
  tokenId: string;
  marketQuestion: string;
  side: 'YES' | 'NO';
  targetPrice: string;
}

export interface AccumulatorSummary {
  accumulatorId: string;
  name: string;
  status: AccumulatorStatus;
  initialStake: string;
  currentValue: string;
  totalBets: number;
  completedBets: number;
  createdAt: string;
}

export interface AccumulatorDetail extends AccumulatorSummary {
  bets: BetSummary[];
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
  signatureType: number;
}

export interface PolymarketOrder {
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
}
