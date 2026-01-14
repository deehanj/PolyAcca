/**
 * Shared utilities for accumulators handlers
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type {
  ApiResponse,
  AccumulatorSummary,
  AccumulatorDetail,
  BetSummary,
  AccumulatorEntity,
  BetEntity,
} from '../../shared/types';
import { getAccumulator, getAccumulatorBets } from '../../shared/dynamo-client';

export const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Extract wallet address from authorizer context
 */
export function getWalletAddress(event: APIGatewayProxyEvent): string | null {
  return event.requestContext.authorizer?.walletAddress || null;
}

/**
 * Convert AccumulatorEntity to AccumulatorSummary
 */
export function toSummary(entity: AccumulatorEntity): AccumulatorSummary {
  return {
    accumulatorId: entity.accumulatorId,
    name: entity.name,
    status: entity.status,
    initialStake: entity.initialStake,
    currentValue: entity.currentValue,
    totalBets: entity.totalBets,
    completedBets: entity.completedBets,
    createdAt: entity.createdAt,
  };
}

/**
 * Convert BetEntity to BetSummary
 */
export function toBetSummary(entity: BetEntity): BetSummary {
  return {
    betId: entity.betId,
    sequence: entity.sequence,
    conditionId: entity.conditionId,
    tokenId: entity.tokenId,
    marketQuestion: entity.marketQuestion,
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
 * Build error response
 */
export function errorResponse(statusCode: number, error: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify({ success: false, error } as ApiResponse),
  };
}

/**
 * Build success response
 */
export function successResponse<T>(data: T, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify({ success: true, data } as ApiResponse<T>),
  };
}

/**
 * Get accumulator with full details (including bets)
 */
export async function getAccumulatorDetail(
  walletAddress: string,
  accumulatorId: string
): Promise<AccumulatorDetail | null> {
  const accumulator = await getAccumulator(walletAddress, accumulatorId);

  if (!accumulator) {
    return null;
  }

  const bets = await getAccumulatorBets(accumulatorId);
  const betSummaries = bets.map(toBetSummary).sort((a, b) => a.sequence - b.sequence);

  return {
    ...toSummary(accumulator),
    bets: betSummaries,
  };
}
