/**
 * POST handler for accumulators
 *
 * - POST /accumulators - Create user acca (creates accumulator if needed)
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import {
  upsertAccumulator,
  getUserAcca,
  saveUserAcca,
  saveBet,
  keys,
  gsiKeys,
} from '../../shared/dynamo-client';
import {
  generateAccumulatorId,
  type CreatePositionRequest,
  type AccumulatorEntity,
  type UserAccaEntity,
  type BetEntity,
  type AccumulatorLeg,
} from '../../shared/types';
import { errorResponse, getUserAccaDetail, successResponse } from './utils';

/**
 * POST /accumulators - Create user acca
 *
 * If the accumulator chain doesn't exist, it creates it.
 * Then creates the user's acca and bets.
 */
export async function createUserAcca(
  walletAddress: string,
  body: string | null
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return errorResponse(400, 'Request body required');
  }

  let request: CreatePositionRequest;
  try {
    request = JSON.parse(body);
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  // Validation
  if (!request.legs || request.legs.length === 0) {
    return errorResponse(400, 'At least one leg is required');
  }

  if (request.legs.length > 10) {
    return errorResponse(400, 'Maximum 10 legs per accumulator');
  }

  if (!request.initialStake || parseFloat(request.initialStake) <= 0) {
    return errorResponse(400, 'Initial stake must be greater than 0');
  }

  // Validate each leg
  for (const leg of request.legs) {
    if (!leg.conditionId || !leg.tokenId || !leg.marketQuestion || !leg.side || !leg.targetPrice) {
      return errorResponse(400, 'Each leg requires conditionId, tokenId, marketQuestion, side, and targetPrice');
    }

    if (!['YES', 'NO'].includes(leg.side)) {
      return errorResponse(400, 'Side must be YES or NO');
    }

    const price = parseFloat(leg.targetPrice);
    if (isNaN(price) || price <= 0 || price >= 1) {
      return errorResponse(400, 'Target price must be between 0 and 1');
    }
  }

  const now = new Date().toISOString();

  // Generate deterministic accumulator ID from chain
  const accumulatorId = generateAccumulatorId(request.legs);

  // Build accumulator definition
  const accumulatorKeys = keys.accumulator(accumulatorId);

  const legs: AccumulatorLeg[] = request.legs.map((leg, index) => ({
    sequence: index + 1,
    conditionId: leg.conditionId,
    tokenId: leg.tokenId,
    side: leg.side,
    marketQuestion: leg.marketQuestion,
  }));

  // Simple chain format for debugging: ["conditionId:YES", "conditionId:NO"]
  const chain = request.legs.map((leg) => `${leg.conditionId}:${leg.side}`);

  const accumulator: AccumulatorEntity = {
    ...accumulatorKeys,
    entityType: 'ACCUMULATOR',
    accumulatorId,
    chain,
    legs,
    totalValue: 0, // Will be set by upsert
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  // Upsert: creates if not exists, adds stake to totalValue if exists
  await upsertAccumulator(accumulator, request.initialStake);

  // Check if user already has an acca on this accumulator
  const existingUserAcca = await getUserAcca(accumulatorId, walletAddress);
  if (existingUserAcca) {
    return errorResponse(400, 'You already have a position on this accumulator');
  }

  // Create user acca
  const userAccaKeys = keys.position(accumulatorId, walletAddress);
  const userAccaGsi = gsiKeys.userAccaByUser(walletAddress, accumulatorId);

  const userAcca: UserAccaEntity = {
    ...userAccaKeys,
    ...userAccaGsi,
    entityType: 'USER_ACCA',
    accumulatorId,
    walletAddress: walletAddress.toLowerCase(),
    initialStake: request.initialStake,
    currentValue: request.initialStake,
    completedLegs: 0,
    currentLegSequence: 1,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };

  await saveUserAcca(userAcca);

  // Create bet entities for each leg
  let currentStake = parseFloat(request.initialStake);

  for (let i = 0; i < request.legs.length; i++) {
    const legInput = request.legs[i];
    const sequence = i + 1;
    const betId = randomUUID();

    const betKeys = keys.bet(accumulatorId, walletAddress, sequence);
    const betGsi1 = gsiKeys.betByStatus(sequence === 1 ? 'READY' : 'QUEUED', now);
    const betGsi2 = gsiKeys.betByCondition(legInput.conditionId, betId);

    // Calculate potential payout: stake / price
    const price = parseFloat(legInput.targetPrice);
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
      conditionId: legInput.conditionId,
      tokenId: legInput.tokenId,
      marketQuestion: legInput.marketQuestion,
      side: legInput.side,
      targetPrice: legInput.targetPrice,
      stake: currentStake.toFixed(2),
      potentialPayout,
      status: sequence === 1 ? 'READY' : 'QUEUED',
      createdAt: now,
      updatedAt: now,
    };

    await saveBet(bet);

    // Next bet's stake is this bet's potential payout
    currentStake = parseFloat(potentialPayout);
  }

  // Return created user acca with details
  const detail = await getUserAccaDetail(userAcca);
  return successResponse(detail, 201);
}
