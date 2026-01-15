/**
 * Shared utilities for accumulators handlers
 */

import type {
  AccumulatorSummary,
  UserAccaSummary,
  UserAccaDetail,
  BetSummary,
  AccumulatorEntity,
  UserAccaEntity,
  BetEntity,
} from '../../shared/types';
import { getAccumulator, getPositionBets } from '../../shared/dynamo-client';

// Re-export common utilities from shared
export { HEADERS, getWalletAddress, errorResponse, successResponse } from '../../shared/api-utils';

/**
 * Convert AccumulatorEntity to AccumulatorSummary
 */
export function toAccumulatorSummary(entity: AccumulatorEntity): AccumulatorSummary {
  return {
    accumulatorId: entity.accumulatorId,
    chain: entity.chain,
    totalValue: entity.totalValue,
    status: entity.status,
    createdAt: entity.createdAt,
  };
}

/**
 * Convert UserAccaEntity to UserAccaSummary
 */
export function toUserAccaSummary(
  userAcca: UserAccaEntity,
  totalLegs: number
): UserAccaSummary {
  return {
    accumulatorId: userAcca.accumulatorId,
    walletAddress: userAcca.walletAddress,
    initialStake: userAcca.initialStake,
    currentValue: userAcca.currentValue,
    completedLegs: userAcca.completedLegs,
    totalLegs,
    status: userAcca.status,
    createdAt: userAcca.createdAt,
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
 * Get user acca with full details (including accumulator and bets)
 */
export async function getUserAccaDetail(
  userAcca: UserAccaEntity
): Promise<UserAccaDetail | null> {
  const accumulator = await getAccumulator(userAcca.accumulatorId);

  if (!accumulator) {
    return null;
  }

  const bets = await getPositionBets(userAcca.accumulatorId, userAcca.walletAddress);

  // Get market questions from bets (stored when bet was created)
  const betSummaries = bets
    .map((bet) => toBetSummary(bet, bet.marketQuestion))
    .sort((a, b) => a.sequence - b.sequence);

  return {
    ...toUserAccaSummary(userAcca, accumulator.chain.length),
    accumulator: toAccumulatorSummary(accumulator),
    bets: betSummaries,
  };
}
