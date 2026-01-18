/**
 * POST handler for chains
 *
 * - POST /chains - Create user chain (creates chain if needed)
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import {
  getUserChain,
  upsertMarket,
  createUserChainPosition,
  deleteUserChainPosition,
  keys,
  gsiKeys,
} from '../../shared/dynamo-client';
import {
  generateChainId,
  type CreatePositionRequest,
  type CreateLegInput,
  type ChainEntity,
  type UserChainEntity,
  type BetEntity,
  type ChainLeg,
  type MarketEntity,
} from '../../shared/types';
import { errorResponse, getUserChainDetail, successResponse } from './utils';
import { fetchMarketByConditionId } from '../../shared/gamma-client';

async function hydrateLegsFromGamma(legs: CreateLegInput[]): Promise<CreateLegInput[]> {
  const uniqueConditionIds = Array.from(new Set(legs.map((leg) => leg.conditionId)));
  const markets = await Promise.all(
    uniqueConditionIds.map(async (conditionId) => {
      const market = await fetchMarketByConditionId(conditionId);
      return { conditionId, market };
    })
  );

  const marketsByCondition = new Map(
    markets.map(({ conditionId, market }) => [conditionId, market])
  );

  const now = Date.now();

  return legs.map((leg) => {
    const market = marketsByCondition.get(leg.conditionId);
    if (!market) {
      throw new Error(`Market not found for conditionId: ${leg.conditionId}`);
    }

    const marketEnd = new Date(market.endDate).getTime();
    if (!Number.isFinite(marketEnd) || marketEnd <= now || !market.active || market.closed) {
      throw new Error(`Market is not active for conditionId: ${leg.conditionId}`);
    }

    const normalizedQuestion = market.question.trim();
    if (leg.questionId && leg.questionId !== market.id) {
      throw new Error(`Question ID mismatch for conditionId: ${leg.conditionId}`);
    }
    if (leg.marketQuestion && leg.marketQuestion.trim() !== normalizedQuestion) {
      throw new Error(`Market question mismatch for conditionId: ${leg.conditionId}`);
    }
    if (leg.yesTokenId && leg.yesTokenId !== market.yesTokenId) {
      throw new Error(`YES token mismatch for conditionId: ${leg.conditionId}`);
    }
    if (leg.noTokenId && leg.noTokenId !== market.noTokenId) {
      throw new Error(`NO token mismatch for conditionId: ${leg.conditionId}`);
    }
    if (leg.endDate) {
      const legEnd = new Date(leg.endDate).getTime();
      if (!Number.isFinite(legEnd) || legEnd !== marketEnd) {
        throw new Error(`End date mismatch for conditionId: ${leg.conditionId}`);
      }
    }
    if (leg.category && leg.category.toLowerCase() !== market.category.toLowerCase()) {
      throw new Error(`Category mismatch for conditionId: ${leg.conditionId}`);
    }

    const expectedTokenId = leg.side === 'YES' ? market.yesTokenId : market.noTokenId;
    if (leg.tokenId && leg.tokenId !== expectedTokenId) {
      throw new Error(`Token ID mismatch for conditionId: ${leg.conditionId}`);
    }

    return {
      ...leg,
      questionId: market.id,
      marketQuestion: normalizedQuestion,
      description: market.description ?? leg.description,
      category: market.category ?? leg.category,
      yesTokenId: market.yesTokenId,
      noTokenId: market.noTokenId,
      endDate: market.endDate,
      tokenId: expectedTokenId,
    };
  });
}

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

  const initialStakeValue = parseFloat(request.initialStake || '');
  if (!Number.isFinite(initialStakeValue) || initialStakeValue <= 0) {
    return errorResponse(400, 'Initial stake must be a valid number greater than 0');
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
    if (!Number.isFinite(price) || price <= 0 || price >= 1) {
      return errorResponse(400, 'Target price must be between 0 and 1');
    }

    // Validate market fields required for market storage
    if (!leg.questionId) {
      return errorResponse(400, 'Each leg requires questionId');
    }
    if (!leg.yesTokenId || !leg.noTokenId) {
      return errorResponse(400, 'Each leg requires yesTokenId and noTokenId');
    }
    if (!leg.endDate) {
      return errorResponse(400, 'Each leg requires endDate');
    }
  }

  let validatedLegs: CreateLegInput[];
  try {
    validatedLegs = await hydrateLegsFromGamma(request.legs);
  } catch (error) {
    console.error('Market validation failed:', error);
    const message = (error as Error).message || 'Market validation failed';
    const statusCode = message.includes('Gamma API') ? 502 : 400;
    return errorResponse(statusCode, message);
  }

  const now = new Date().toISOString();

  // Generate deterministic chain ID from chain definition
  const chainId = generateChainId(validatedLegs);

  // Check if user already has a position on this chain
  const existingUserChain = await getUserChain(chainId, walletAddress);
  if (existingUserChain) {
    // Allow retry if previous attempt failed or was cancelled
    const terminalFailedStatuses = ['FAILED', 'CANCELLED'];
    if (!terminalFailedStatuses.includes(existingUserChain.status)) {
      return errorResponse(400, 'You already have an active position on this chain');
    }
    // Delete the old failed position so we can create a new one
    const totalLegs = validatedLegs.length;
    await deleteUserChainPosition(chainId, walletAddress, totalLegs);
  }

  // Build chain definition
  const chainKeys = keys.chain(chainId);

  const legs: ChainLeg[] = validatedLegs.map((leg, index) => ({
    sequence: index + 1,
    conditionId: leg.conditionId,
    tokenId: leg.tokenId,
    side: leg.side,
    marketQuestion: leg.marketQuestion,
  }));

  // Simple chain format for debugging: ["conditionId:YES", "conditionId:NO"]
  const chainArray = validatedLegs.map((leg) => `${leg.conditionId}:${leg.side}`);

  const chainEntity: ChainEntity = {
    ...chainKeys,
    entityType: 'CHAIN',
    chainId,
    // name, description, imageKey are set via PUT /chains/{chainId} after creation
    chain: chainArray,
    legs,
    totalValue: 0, // Will be set by upsert
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  // Upsert markets for each unique conditionId
  // This ensures markets exist in DynamoDB for resolution handling
  const uniqueMarkets = new Map<string, CreateLegInput>();
  for (const leg of validatedLegs) {
    if (!uniqueMarkets.has(leg.conditionId)) {
      uniqueMarkets.set(leg.conditionId, leg);
    }
  }

  for (const [conditionId, leg] of uniqueMarkets) {
    const marketKeys = keys.market(conditionId);
    const marketGsi = gsiKeys.marketByStatus('ACTIVE', leg.endDate);

    const market: MarketEntity = {
      ...marketKeys,
      ...marketGsi,
      entityType: 'MARKET',
      conditionId,
      questionId: leg.questionId,
      question: leg.marketQuestion,
      description: leg.description,
      yesTokenId: leg.yesTokenId,
      noTokenId: leg.noTokenId,
      status: 'ACTIVE',
      endDate: leg.endDate,
      category: leg.category,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await upsertMarket(market);
  }

  // Create user chain
  const userChainKeys = keys.userChain(chainId, walletAddress);
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

  // Create bet entities for each leg
  let currentStake = initialStakeValue;
  const bets: BetEntity[] = [];

  for (let i = 0; i < validatedLegs.length; i++) {
    const legInput = validatedLegs[i];
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

    bets.push(bet);

    // Next bet's stake is this bet's potential payout
    currentStake = parseFloat(potentialPayout);
  }

  try {
    await createUserChainPosition(chainEntity, request.initialStake, userChain, bets);
  } catch (error) {
    const name = (error as Error).name;
    if (name === 'TransactionCanceledException' || name === 'ConditionalCheckFailedException') {
      return errorResponse(400, 'You already have a position on this chain');
    }
    throw error;
  }

  // Return created user chain with details
  const detail = await getUserChainDetail(userChain);
  return successResponse(detail, 201);
}
