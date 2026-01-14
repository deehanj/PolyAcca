/**
 * POST handler for accumulators
 *
 * - POST /accumulators - Create new accumulator with bets
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { saveAccumulator, saveBet, keys, gsiKeys } from '../../shared/dynamo-client';
import type {
  CreateAccumulatorRequest,
  AccumulatorEntity,
  BetEntity,
} from '../../shared/types';
import { errorResponse, getAccumulatorDetail, successResponse } from './utils';

/**
 * POST /accumulators - Create new accumulator with bets
 */
export async function createAccumulator(
  walletAddress: string,
  body: string | null
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return errorResponse(400, 'Request body required');
  }

  let request: CreateAccumulatorRequest;
  try {
    request = JSON.parse(body);
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  // Validation
  if (!request.name || request.name.trim().length === 0) {
    return errorResponse(400, 'Name is required');
  }

  if (!request.initialStake || parseFloat(request.initialStake) <= 0) {
    return errorResponse(400, 'Initial stake must be greater than 0');
  }

  if (!request.bets || request.bets.length === 0) {
    return errorResponse(400, 'At least one bet is required');
  }

  if (request.bets.length > 10) {
    return errorResponse(400, 'Maximum 10 bets per accumulator');
  }

  // Validate each bet
  for (const bet of request.bets) {
    if (!bet.conditionId || !bet.tokenId || !bet.marketQuestion || !bet.side || !bet.targetPrice) {
      return errorResponse(400, 'Each bet requires conditionId, tokenId, marketQuestion, side, and targetPrice');
    }

    if (!['YES', 'NO'].includes(bet.side)) {
      return errorResponse(400, 'Side must be YES or NO');
    }

    const price = parseFloat(bet.targetPrice);
    if (isNaN(price) || price <= 0 || price >= 1) {
      return errorResponse(400, 'Target price must be between 0 and 1');
    }
  }

  const now = new Date().toISOString();
  const accumulatorId = randomUUID();

  // Create accumulator entity
  const { PK, SK } = keys.accumulator(walletAddress, accumulatorId);
  const gsi = gsiKeys.accumulatorByStatus('PENDING', now);

  const accumulator: AccumulatorEntity = {
    PK,
    SK,
    ...gsi,
    entityType: 'ACCUMULATOR',
    accumulatorId,
    walletAddress: walletAddress.toLowerCase(),
    name: request.name.trim(),
    status: 'PENDING',
    initialStake: request.initialStake,
    currentValue: request.initialStake,
    totalBets: request.bets.length,
    completedBets: 0,
    currentBetSequence: 1,
    createdAt: now,
    updatedAt: now,
  };

  await saveAccumulator(accumulator);

  // Create bet entities
  let currentStake = parseFloat(request.initialStake);

  for (let i = 0; i < request.bets.length; i++) {
    const betInput = request.bets[i];
    const sequence = i + 1;
    const betId = randomUUID();

    const betKeys = keys.bet(accumulatorId, sequence);
    const betGsi1 = gsiKeys.betByStatus(sequence === 1 ? 'READY' : 'QUEUED', now);
    const betGsi2 = gsiKeys.betByCondition(betInput.conditionId, betId);

    // Calculate potential payout based on target price
    // If buying YES at 0.5, payout = stake / price (e.g., $10 / 0.5 = $20)
    const price = parseFloat(betInput.targetPrice);
    const potentialPayout = (currentStake / price).toFixed(2);

    const bet: BetEntity = {
      ...betKeys,
      ...betGsi1,
      ...betGsi2,
      entityType: 'BET',
      betId,
      accumulatorId,
      walletAddress: walletAddress.toLowerCase(),
      sequence,
      conditionId: betInput.conditionId,
      tokenId: betInput.tokenId,
      marketQuestion: betInput.marketQuestion,
      side: betInput.side,
      targetPrice: betInput.targetPrice,
      stake: currentStake.toFixed(2),
      potentialPayout,
      status: sequence === 1 ? 'READY' : 'QUEUED', // First bet is ready, others queued
      createdAt: now,
      updatedAt: now,
    };

    await saveBet(bet);

    // Next bet's stake is this bet's potential payout
    currentStake = parseFloat(potentialPayout);
  }

  // Return created accumulator with details
  const detail = await getAccumulatorDetail(walletAddress, accumulatorId);
  return successResponse(detail, 201);
}
