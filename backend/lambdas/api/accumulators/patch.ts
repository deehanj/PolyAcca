/**
 * PATCH handler for accumulators
 *
 * - PATCH /accumulators/{id} - Modify accumulator chain (add/remove/replace bets)
 *
 * Operations supported:
 * - { operation: 'add', bet: CreateBetInput } - Add bet to end of chain
 * - { operation: 'remove', sequence: number } - Remove bet at sequence (and all after)
 * - { operation: 'replace', bets: CreateBetInput[] } - Replace entire bet chain
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { randomUUID } from 'crypto';
import {
  getAccumulator,
  getAccumulatorBets,
  saveBet,
  saveAccumulator,
  deleteBet,
  keys,
  gsiKeys,
} from '../../shared/dynamo-client';
import type {
  CreateBetInput,
  BetEntity,
  AccumulatorEntity,
} from '../../shared/types';
import { errorResponse, getAccumulatorDetail, successResponse } from './utils';

interface AddBetOperation {
  operation: 'add';
  bet: CreateBetInput;
}

interface RemoveBetOperation {
  operation: 'remove';
  sequence: number;
}

interface ReplaceBetsOperation {
  operation: 'replace';
  bets: CreateBetInput[];
}

type PatchOperation = AddBetOperation | RemoveBetOperation | ReplaceBetsOperation;

/**
 * Validate a bet input
 */
function validateBetInput(bet: CreateBetInput): string | null {
  if (!bet.conditionId || !bet.tokenId || !bet.marketQuestion || !bet.side || !bet.targetPrice) {
    return 'Each bet requires conditionId, tokenId, marketQuestion, side, and targetPrice';
  }

  if (!['YES', 'NO'].includes(bet.side)) {
    return 'Side must be YES or NO';
  }

  const price = parseFloat(bet.targetPrice);
  if (isNaN(price) || price <= 0 || price >= 1) {
    return 'Target price must be between 0 and 1';
  }

  return null;
}

/**
 * Add a bet to the end of the chain
 */
async function addBet(
  accumulator: AccumulatorEntity,
  existingBets: BetEntity[],
  betInput: CreateBetInput
): Promise<void> {
  const now = new Date().toISOString();
  const sequence = accumulator.totalBets + 1;
  const betId = randomUUID();

  // Find the last bet to get stake for new bet
  const sortedBets = existingBets.sort((a, b) => b.sequence - a.sequence);
  const lastBet = sortedBets[0];

  // New bet's stake is the previous bet's potential payout
  const stake = lastBet ? lastBet.potentialPayout : accumulator.initialStake;
  const price = parseFloat(betInput.targetPrice);
  const potentialPayout = (parseFloat(stake) / price).toFixed(2);

  const betKeys = keys.bet(accumulator.accumulatorId, sequence);
  const betGsi1 = gsiKeys.betByStatus('QUEUED', now);
  const betGsi2 = gsiKeys.betByCondition(betInput.conditionId, betId);

  const bet: BetEntity = {
    ...betKeys,
    ...betGsi1,
    ...betGsi2,
    entityType: 'BET',
    betId,
    accumulatorId: accumulator.accumulatorId,
    walletAddress: accumulator.walletAddress,
    sequence,
    conditionId: betInput.conditionId,
    tokenId: betInput.tokenId,
    marketQuestion: betInput.marketQuestion,
    side: betInput.side,
    targetPrice: betInput.targetPrice,
    stake,
    potentialPayout,
    status: 'QUEUED',
    createdAt: now,
    updatedAt: now,
  };

  await saveBet(bet);

  // Update accumulator
  const updatedAccumulator: AccumulatorEntity = {
    ...accumulator,
    totalBets: accumulator.totalBets + 1,
    updatedAt: now,
  };
  await saveAccumulator(updatedAccumulator);
}

/**
 * Remove bets from sequence onwards
 */
async function removeBetsFrom(
  accumulator: AccumulatorEntity,
  existingBets: BetEntity[],
  fromSequence: number
): Promise<void> {
  const now = new Date().toISOString();
  const betsToRemove = existingBets.filter((b) => b.sequence >= fromSequence);

  // Delete bets
  for (const bet of betsToRemove) {
    await deleteBet(accumulator.accumulatorId, bet.sequence);
  }

  // Update accumulator
  const newTotalBets = fromSequence - 1;
  const updatedAccumulator: AccumulatorEntity = {
    ...accumulator,
    totalBets: newTotalBets,
    updatedAt: now,
  };
  await saveAccumulator(updatedAccumulator);
}

/**
 * Replace all bets with new ones
 */
async function replaceBets(
  accumulator: AccumulatorEntity,
  existingBets: BetEntity[],
  newBets: CreateBetInput[]
): Promise<void> {
  const now = new Date().toISOString();

  // Delete all existing bets
  for (const bet of existingBets) {
    await deleteBet(accumulator.accumulatorId, bet.sequence);
  }

  // Create new bets
  let currentStake = parseFloat(accumulator.initialStake);

  for (let i = 0; i < newBets.length; i++) {
    const betInput = newBets[i];
    const sequence = i + 1;
    const betId = randomUUID();

    const betKeys = keys.bet(accumulator.accumulatorId, sequence);
    const betGsi1 = gsiKeys.betByStatus(sequence === 1 ? 'READY' : 'QUEUED', now);
    const betGsi2 = gsiKeys.betByCondition(betInput.conditionId, betId);

    const price = parseFloat(betInput.targetPrice);
    const potentialPayout = (currentStake / price).toFixed(2);

    const bet: BetEntity = {
      ...betKeys,
      ...betGsi1,
      ...betGsi2,
      entityType: 'BET',
      betId,
      accumulatorId: accumulator.accumulatorId,
      walletAddress: accumulator.walletAddress,
      sequence,
      conditionId: betInput.conditionId,
      tokenId: betInput.tokenId,
      marketQuestion: betInput.marketQuestion,
      side: betInput.side,
      targetPrice: betInput.targetPrice,
      stake: currentStake.toFixed(2),
      potentialPayout,
      status: sequence === 1 ? 'READY' : 'QUEUED',
      createdAt: now,
      updatedAt: now,
    };

    await saveBet(bet);
    currentStake = parseFloat(potentialPayout);
  }

  // Update accumulator
  const updatedAccumulator: AccumulatorEntity = {
    ...accumulator,
    totalBets: newBets.length,
    currentBetSequence: 1,
    updatedAt: now,
  };
  await saveAccumulator(updatedAccumulator);
}

/**
 * PATCH /accumulators/{id} - Modify accumulator chain
 */
export async function patchAccumulator(
  walletAddress: string,
  accumulatorId: string,
  body: string | null
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return errorResponse(400, 'Request body required');
  }

  let operation: PatchOperation;
  try {
    operation = JSON.parse(body);
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  if (!operation.operation) {
    return errorResponse(400, 'Operation type required (add, remove, or replace)');
  }

  // Get accumulator
  const accumulator = await getAccumulator(walletAddress, accumulatorId);
  if (!accumulator) {
    return errorResponse(404, 'Accumulator not found');
  }

  // Can only modify PENDING accumulators
  if (accumulator.status !== 'PENDING') {
    return errorResponse(400, 'Can only modify pending accumulators');
  }

  const existingBets = await getAccumulatorBets(accumulatorId);

  switch (operation.operation) {
    case 'add': {
      if (!operation.bet) {
        return errorResponse(400, 'Bet data required for add operation');
      }

      if (accumulator.totalBets >= 10) {
        return errorResponse(400, 'Maximum 10 bets per accumulator');
      }

      const validationError = validateBetInput(operation.bet);
      if (validationError) {
        return errorResponse(400, validationError);
      }

      await addBet(accumulator, existingBets, operation.bet);
      break;
    }

    case 'remove': {
      if (!operation.sequence || operation.sequence < 1) {
        return errorResponse(400, 'Valid sequence number required for remove operation');
      }

      if (operation.sequence > accumulator.totalBets) {
        return errorResponse(400, 'Sequence number exceeds total bets');
      }

      // Cannot remove if it would leave 0 bets
      if (operation.sequence === 1) {
        return errorResponse(400, 'Cannot remove all bets. Use DELETE to cancel the accumulator.');
      }

      await removeBetsFrom(accumulator, existingBets, operation.sequence);
      break;
    }

    case 'replace': {
      if (!operation.bets || operation.bets.length === 0) {
        return errorResponse(400, 'At least one bet required for replace operation');
      }

      if (operation.bets.length > 10) {
        return errorResponse(400, 'Maximum 10 bets per accumulator');
      }

      for (const bet of operation.bets) {
        const validationError = validateBetInput(bet);
        if (validationError) {
          return errorResponse(400, validationError);
        }
      }

      await replaceBets(accumulator, existingBets, operation.bets);
      break;
    }

    default:
      return errorResponse(400, 'Invalid operation. Use add, remove, or replace.');
  }

  // Return updated accumulator
  const detail = await getAccumulatorDetail(walletAddress, accumulatorId);
  return successResponse(detail);
}
