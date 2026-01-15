/**
 * Position Termination Handler
 *
 * Triggered when a UserAcca status changes to LOST, CANCELLED, or FAILED.
 * Handles cleanup:
 * - Voids all remaining QUEUED bets
 * - Cancels any PLACED/EXECUTING orders on Polymarket
 * - Decrements accumulator totalValue (for CANCELLED/FAILED only)
 */

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import {
  getAccumulator,
  getUserCreds,
  getPositionBets,
  updateBetStatus,
  decrementAccumulatorTotalValue,
} from '../../shared/dynamo-client';
import { decryptCredentials, cancelOrder } from '../../shared/polymarket-client';
import { createLogger } from '../../shared/logger';
import type { UserAccaEntity, BetEntity, UserAccaStatus } from '../../shared/types';

const log = createLogger('position-termination-handler');

// Statuses that trigger position termination
const TERMINAL_STATUSES: UserAccaStatus[] = ['LOST', 'CANCELLED', 'FAILED'];

// Statuses that should decrement totalValue (user didn't complete participation)
const DECREMENT_STATUSES: UserAccaStatus[] = ['CANCELLED', 'FAILED'];

/**
 * Cancel a bet's order on Polymarket if it has been placed
 */
async function cancelPolymarketOrder(bet: BetEntity, walletAddress: string): Promise<void> {
  if (!bet.orderId) {
    log.debug('No orderId on bet, skipping Polymarket cancellation', { betId: bet.betId });
    return;
  }

  const cancellableStatuses = ['PLACED', 'EXECUTING'];
  if (!cancellableStatuses.includes(bet.status)) {
    return;
  }

  try {
    const creds = await getUserCreds(walletAddress);

    if (!creds) {
      log.error('User credentials not found for order cancellation', { walletAddress });
      return;
    }

    const decrypted = await decryptCredentials(creds);
    const cancelled = await cancelOrder(decrypted, bet.orderId);

    log.info('Polymarket order cancelled', {
      betId: bet.betId,
      orderId: bet.orderId,
      cancelled,
    });
  } catch (error) {
    log.errorWithStack('Failed to cancel order on Polymarket', error, {
      betId: bet.betId,
      orderId: bet.orderId,
    });
  }
}

/**
 * Process position termination - void remaining bets and cleanup
 */
async function processPositionTermination(record: DynamoDBRecord): Promise<void> {
  if (!record.dynamodb?.NewImage || !record.dynamodb?.OldImage) {
    log.warn('Missing NewImage or OldImage in record');
    return;
  }

  const newUserAcca = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  ) as UserAccaEntity;

  const oldUserAcca = unmarshall(
    record.dynamodb.OldImage as Record<string, AttributeValue>
  ) as UserAccaEntity;

  // Only process USER_ACCA entities
  if (newUserAcca.entityType !== 'USER_ACCA') {
    return;
  }

  // Only process if status changed TO a terminal status
  if (!TERMINAL_STATUSES.includes(newUserAcca.status)) {
    return;
  }

  // Don't re-process if already in a terminal status
  if (TERMINAL_STATUSES.includes(oldUserAcca.status)) {
    return;
  }

  const { accumulatorId, walletAddress, status } = newUserAcca;

  log.info('Processing position termination', {
    accumulatorId,
    walletAddress,
    status,
    previousStatus: oldUserAcca.status,
  });

  // Get all bets for this position
  const bets = await getPositionBets(accumulatorId, walletAddress);

  // Void all QUEUED bets
  const queuedBets = bets.filter((bet) => bet.status === 'QUEUED');
  log.info('Voiding queued bets', { count: queuedBets.length });

  for (const bet of queuedBets) {
    await updateBetStatus(accumulatorId, walletAddress, bet.sequence, 'VOIDED');
  }

  // Cancel any PLACED/EXECUTING orders on Polymarket
  const activeBets = bets.filter((bet) => ['PLACED', 'EXECUTING'].includes(bet.status));
  log.info('Cancelling active Polymarket orders', { count: activeBets.length });

  for (const bet of activeBets) {
    await cancelPolymarketOrder(bet, walletAddress);
    // Mark the bet as CANCELLED since we're cancelling the order
    await updateBetStatus(accumulatorId, walletAddress, bet.sequence, 'CANCELLED');
  }

  // Decrement accumulator totalValue for CANCELLED/FAILED (not LOST)
  if (DECREMENT_STATUSES.includes(status)) {
    const accumulator = await getAccumulator(accumulatorId);

    if (accumulator) {
      const stakeToRemove = parseFloat(newUserAcca.initialStake);
      await decrementAccumulatorTotalValue(accumulatorId, stakeToRemove);

      log.info('Decremented accumulator totalValue', { accumulatorId, stakeToRemove });
    }
  }

  log.info('Position termination complete', { accumulatorId, walletAddress, status });
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  log.info('Processing position termination records', { count: event.Records.length });

  for (const record of event.Records) {
    try {
      if (record.eventName === 'MODIFY') {
        await processPositionTermination(record);
      }
    } catch (error) {
      log.errorWithStack('Error processing position termination record', error);
      throw error; // Re-throw to trigger DLQ/retry
    }
  }
}
