/**
 * POST handler for chains
 *
 * - POST /chains - Create user chain (creates chain if needed)
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import {
  upsertChain,
  getUserChain,
  saveUserChain,
  saveBet,
  keys,
  gsiKeys,
} from '../../shared/dynamo-client';
import {
  generateChainId,
  type CreatePositionRequest,
  type ChainEntity,
  type UserChainEntity,
  type BetEntity,
  type ChainLeg,
} from '../../shared/types';
import { errorResponse, getUserChainDetail, successResponse } from './utils';

/**
 * POST /chains - Create user chain
 *
 * If the chain doesn't exist, it creates it.
 * Then creates the user's chain position and bets.
 */
export async function createUserChain(
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
    return errorResponse(400, 'Maximum 10 legs per chain');
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

  // Generate deterministic chain ID from chain definition
  const chainId = generateChainId(request.legs);

  // Build chain definition
  const chainKeys = keys.chain(chainId);

  const legs: ChainLeg[] = request.legs.map((leg, index) => ({
    sequence: index + 1,
    conditionId: leg.conditionId,
    tokenId: leg.tokenId,
    side: leg.side,
    marketQuestion: leg.marketQuestion,
  }));

  // Simple chain format for debugging: ["conditionId:YES", "conditionId:NO"]
  const chainArray = request.legs.map((leg) => `${leg.conditionId}:${leg.side}`);

  const chainEntity: ChainEntity = {
    ...chainKeys,
    entityType: 'CHAIN',
    chainId,
    chain: chainArray,
    legs,
    totalValue: 0, // Will be set by upsert
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  // Upsert: creates if not exists, adds stake to totalValue if exists
  await upsertChain(chainEntity, request.initialStake);

  // Check if user already has a position on this chain
  const existingUserChain = await getUserChain(chainId, walletAddress);
  if (existingUserChain) {
    return errorResponse(400, 'You already have a position on this chain');
  }

  // Create user chain
  const userChainKeys = keys.position(chainId, walletAddress);
  const userChainGsi = gsiKeys.userChainByUser(walletAddress, chainId);

  const userChain: UserChainEntity = {
    ...userChainKeys,
    ...userChainGsi,
    entityType: 'USER_CHAIN',
    chainId,
    walletAddress: walletAddress.toLowerCase(),
    initialStake: request.initialStake,
    currentValue: request.initialStake,
    completedLegs: 0,
    currentLegSequence: 1,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };

  await saveUserChain(userChain);

  // Create bet entities for each leg
  let currentStake = parseFloat(request.initialStake);

  for (let i = 0; i < request.legs.length; i++) {
    const legInput = request.legs[i];
    const sequence = i + 1;
    const betId = randomUUID();

    const betKeys = keys.bet(chainId, walletAddress, sequence);
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
      chainId,
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

  // Return created user chain with details
  const detail = await getUserChainDetail(userChain);
  return successResponse(detail, 201);
}
