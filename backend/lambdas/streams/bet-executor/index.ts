/**
 * Bet Executor
 *
 * Triggered via DynamoDB Stream when a bet has status=READY:
 * - INSERT: First bet in accumulator (created with status=READY)
 * - MODIFY: Subsequent bets (status changed to READY after previous bet won)
 *
 * Places orders on Polymarket CLOB.
 */

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import {
  updateBetStatus,
  getUserCreds,
} from '../../shared/dynamo-client';
import { decryptCredentials, placeOrder } from '../../shared/polymarket-client';
import type { BetEntity } from '../../shared/types';

/**
 * Execute a bet - place order on Polymarket
 */
async function executeBet(bet: BetEntity): Promise<void> {
  console.log('Executing bet:', {
    betId: bet.betId,
    tokenId: bet.tokenId,
    side: bet.side,
    targetPrice: bet.targetPrice,
    stake: bet.stake,
  });

  try {
    // Mark bet as EXECUTING
    await updateBetStatus(bet.accumulatorId, bet.sequence, 'EXECUTING');

    // Get user's Polymarket credentials
    const creds = await getUserCreds(bet.walletAddress);

    if (!creds) {
      console.error('User credentials not found:', bet.walletAddress);
      await updateBetStatus(bet.accumulatorId, bet.sequence, 'CANCELLED');
      return;
    }

    // Decrypt credentials
    const decrypted = await decryptCredentials(creds);

    // Place order on Polymarket
    const orderId = await placeOrder(decrypted, {
      tokenId: bet.tokenId,
      side: 'BUY', // Always buying the outcome token
      price: parseFloat(bet.targetPrice),
      size: parseFloat(bet.stake) / parseFloat(bet.targetPrice), // Shares = stake / price
    });

    console.log('Order placed:', { betId: bet.betId, orderId });

    // Update bet status to PLACED with order ID
    const now = new Date().toISOString();
    await updateBetStatus(bet.accumulatorId, bet.sequence, 'PLACED', {
      orderId,
      executedAt: now,
    });

    // For now, assume order fills immediately and update to FILLED
    // In production, you'd monitor order status via Polymarket API or webhooks
    await updateBetStatus(bet.accumulatorId, bet.sequence, 'FILLED');

    console.log('Bet execution complete:', bet.betId);
  } catch (error) {
    console.error('Bet execution failed:', { betId: bet.betId, error });

    // Mark bet as failed - back to READY for retry
    // In production, implement proper retry logic with backoff
    await updateBetStatus(bet.accumulatorId, bet.sequence, 'READY');

    throw error;
  }
}

/**
 * Process a bet ready stream event
 */
async function processBetReady(record: DynamoDBRecord): Promise<void> {
  if (!record.dynamodb?.NewImage) {
    console.warn('No NewImage in record');
    return;
  }

  // Check if this is actually a transition to READY
  const oldImage = record.dynamodb.OldImage
    ? (unmarshall(record.dynamodb.OldImage as Record<string, AttributeValue>) as BetEntity)
    : null;

  const newImage = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  ) as BetEntity;

  // Only process if status actually changed to READY (not already READY)
  if (oldImage?.status === 'READY') {
    console.log('Bet already was READY, skipping:', newImage.betId);
    return;
  }

  await executeBet(newImage);
}

/**
 * Handler - processes DynamoDB Stream events for bets with status=READY
 */
export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  console.log(`Processing ${event.Records.length} bet records`);

  for (const record of event.Records) {
    try {
      // Handle both INSERT (first bet) and MODIFY (subsequent bets)
      if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
        await processBetReady(record);
      }
    } catch (error) {
      console.error('Error processing bet record:', error);
      throw error; // Re-throw to trigger DLQ/retry
    }
  }
}
