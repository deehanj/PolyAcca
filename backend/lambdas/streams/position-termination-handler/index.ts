/**
 * Position Termination Handler
 *
 * Triggered when a UserChain status changes to LOST, CANCELLED, or FAILED.
 * Handles cleanup:
 * - Voids all remaining QUEUED bets
 * - Cancels any PLACED/EXECUTING orders on Polymarket
 * - Decrements chain totalValue (for CANCELLED/FAILED only)
 */

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import {
  getChain,
  getUserCreds,
  getChainBets,
  updateBetStatus,
  decrementChainTotalValue,
} from '../../shared/dynamo-client';
import { decryptCredentials, cancelOrder } from '../../shared/polymarket-client';
import { createLogger } from '../../shared/logger';
import type { UserChainEntity, BetEntity, UserChainStatus } from '../../shared/types';

const log = createLogger('position-termination-handler');

// Statuses that trigger position termination
const TERMINAL_STATUSES: UserChainStatus[] = ['LOST', 'CANCELLED', 'FAILED'];

// Statuses that should decrement totalValue (user didn't complete participation)
const DECREMENT_STATUSES: UserChainStatus[] = ['CANCELLED', 'FAILED'];

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

  const newUserChain = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  ) as UserChainEntity;

  const oldUserChain = unmarshall(
    record.dynamodb.OldImage as Record<string, AttributeValue>
  ) as UserChainEntity;

  // Only process USER_CHAIN entities
  if (newUserChain.entityType !== 'USER_CHAIN') {
    return;
  }

  // Only process if status changed TO a terminal status
  if (!TERMINAL_STATUSES.includes(newUserChain.status)) {
    return;
  }

  // Don't re-process if already in a terminal status
  if (TERMINAL_STATUSES.includes(oldUserChain.status)) {
    return;
  }

  const { chainId, walletAddress, status } = newUserChain;

  log.info('Processing position termination', {
    chainId,
    walletAddress,
    status,
    previousStatus: oldUserChain.status,
  });

  // Get all bets for this position
  const bets = await getChainBets(chainId, walletAddress);

  // Void all QUEUED bets
  const queuedBets = bets.filter((bet) => bet.status === 'QUEUED');
  log.info('Voiding queued bets', { count: queuedBets.length });

  for (const bet of queuedBets) {
    await updateBetStatus(chainId, walletAddress, bet.sequence, 'VOIDED');
  }

  // Cancel any PLACED/EXECUTING orders on Polymarket
  const activeBets = bets.filter((bet) => ['PLACED', 'EXECUTING'].includes(bet.status));
  log.info('Cancelling active Polymarket orders', { count: activeBets.length });

  for (const bet of activeBets) {
    await cancelPolymarketOrder(bet, walletAddress);
    // Mark the bet as CANCELLED since we're cancelling the order
    await updateBetStatus(chainId, walletAddress, bet.sequence, 'CANCELLED');
  }

  // Decrement chain totalValue for CANCELLED/FAILED (not LOST)
  if (DECREMENT_STATUSES.includes(status)) {
    const chain = await getChain(chainId);

    if (chain) {
      const stakeToRemove = parseFloat(newUserChain.initialStake);
      await decrementChainTotalValue(chainId, stakeToRemove);

      log.info('Decremented chain totalValue', { chainId, stakeToRemove });
    }
  }

  log.info('Position termination complete', { chainId, walletAddress, status });
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
