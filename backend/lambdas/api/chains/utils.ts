/**
 * Shared utilities for chains handlers
 */

import type {
  ChainSummary,
  UserChainSummary,
  UserChainDetail,
  BetSummary,
  ChainEntity,
  UserChainEntity,
  BetEntity,
} from '../../shared/types';
import { getChain, getChainBets } from '../../shared/dynamo-client';

// Re-export common utilities from shared
export { HEADERS, getWalletAddress, errorResponse, successResponse } from '../../shared/api-utils';

/**
 * Convert ChainEntity to ChainSummary
 */
export function toChainSummary(entity: ChainEntity): ChainSummary {
  return {
    chainId: entity.chainId,
    chain: entity.chain,
    totalValue: entity.totalValue,
    status: entity.status,
    createdAt: entity.createdAt,
  };
}

/**
 * Convert UserChainEntity to UserChainSummary
 */
export function toUserChainSummary(
  userChain: UserChainEntity,
  totalLegs: number
): UserChainSummary {
  return {
    chainId: userChain.chainId,
    walletAddress: userChain.walletAddress,
    initialStake: userChain.initialStake,
    currentValue: userChain.currentValue,
    completedLegs: userChain.completedLegs,
    totalLegs,
    status: userChain.status,
    createdAt: userChain.createdAt,
  };
}

/**
 * Convert BetEntity to BetSummary
 */
export function toBetSummary(entity: BetEntity, marketQuestion: string): BetSummary {
  return {
    betId: entity.betId,
    sequence: entity.sequence,
    conditionId: entity.conditionId,
    tokenId: entity.tokenId,
    marketQuestion,
    side: entity.side,
    targetPrice: entity.targetPrice,
    stake: entity.stake,
    potentialPayout: entity.potentialPayout,
    status: entity.status,
    outcome: entity.outcome,
    actualPayout: entity.actualPayout,
  };
}

/**
 * Get user chain with full details (including chain definition and bets)
 */
export async function getUserChainDetail(
  userChain: UserChainEntity
): Promise<UserChainDetail | null> {
  const chain = await getChain(userChain.chainId);

  if (!chain) {
    return null;
  }

  const bets = await getChainBets(userChain.chainId, userChain.walletAddress);

  // Get market questions from bets (stored when bet was created)
  const betSummaries = bets
    .map((bet) => toBetSummary(bet, bet.marketQuestion))
    .sort((a, b) => a.sequence - b.sequence);

  return {
    ...toUserChainSummary(userChain, chain.chain.length),
    chainDefinition: toChainSummary(chain),
    bets: betSummaries,
  };
}
