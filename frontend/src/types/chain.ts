/**
 * Chain/Accumulator types for frontend
 */

export type ChainStatus = 'PENDING' | 'ACTIVE' | 'WON' | 'LOST' | 'CANCELLED' | 'FAILED';

export type BetStatus =
  | 'READY'
  | 'QUEUED'
  | 'EXECUTING'
  | 'PLACED'
  | 'FILLED'
  | 'WON'
  | 'LOST'
  | 'VOIDED'
  | 'CANCELLED'
  | 'FAILED';

export interface UserChainSummary {
  chainId: string;
  walletAddress: string;
  initialStake: string;
  currentValue: string;
  completedLegs: number;
  totalLegs: number;
  status: ChainStatus;
  createdAt: string;
}

export interface BetSummary {
  sequence: number;
  conditionId: string;
  marketQuestion: string;
  side: 'YES' | 'NO';
  stake: string;
  potentialPayout: string;
  status: BetStatus;
  outcome?: 'WIN' | 'LOSS';
}

export interface ChainLeg {
  sequence: number;
  marketQuestion: string;
  side: string;
}

export interface ChainDefinition {
  chainId: string;
  name: string;
  description?: string;
  legs: ChainLeg[];
}

export interface UserChainDetail extends UserChainSummary {
  chainDefinition: ChainDefinition;
  bets: BetSummary[];
}

export interface ChainsResponse {
  success: boolean;
  data?: UserChainSummary[];
  error?: string;
}

export interface ChainDetailResponse {
  success: boolean;
  data?: UserChainDetail;
  error?: string;
}
