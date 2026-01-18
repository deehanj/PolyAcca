/**
 * Bet Notification Handler
 *
 * Triggered by DynamoDB Stream when a BET status changes.
 * Broadcasts notifications to all connected WebSocket clients:
 * - BET_SUCCESS: When bet is successfully filled
 * - BET_FAILED: When bet execution fails (tells user to try again)
 */

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { getAllConnections, deleteConnection, getChain } from '../../shared/dynamo-client';
import { broadcastToConnections } from '../../shared/websocket-broadcast';
import type { BetEntity, BetStatus } from '../../shared/types';
import { requireEnvVar } from '../../utils/envVars';

const WEBSOCKET_ENDPOINT = requireEnvVar('WEBSOCKET_ENDPOINT');

/** Failure statuses that should trigger a failure notification */
const FAILURE_STATUSES: BetStatus[] = [
  'UNKNOWN_FAILURE',
  'NO_CREDENTIALS',
  'INSUFFICIENT_LIQUIDITY',
  'MARKET_CLOSED',
  'ORDER_REJECTED',
  'EXECUTION_ERROR',
];

/** Truncate wallet address for display (0x1234...5678) */
function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Get human-readable failure reason */
function getFailureReason(status: BetStatus): string {
  switch (status) {
    case 'NO_CREDENTIALS':
      return 'Wallet signing failed. Please disconnect and reconnect your wallet.';
    case 'INSUFFICIENT_LIQUIDITY':
      return 'Insufficient funds or market liquidity. Check your balance.';
    case 'MARKET_CLOSED':
      return 'Market is closed or suspended.';
    case 'ORDER_REJECTED':
      return 'Order was rejected by the exchange. Try again.';
    case 'EXECUTION_ERROR':
      return 'Network error. Please try again.';
    default:
      return 'Bet execution failed. Please try again.';
  }
}

/** Process a BET status change to FILLED (success) */
async function processBetSuccess(bet: BetEntity): Promise<void> {
  console.log('Processing bet success:', {
    betId: bet.betId,
    wallet: bet.walletAddress,
    chainId: bet.chainId,
  });

  const chain = await getChain(bet.chainId);
  const legQuestion = bet.marketQuestion || chain?.legs[bet.sequence - 1]?.marketQuestion;

  const message = {
    type: 'BET_SUCCESS',
    data: {
      wallet: truncateAddress(bet.walletAddress),
      stake: bet.stake,
      side: bet.side,
      question: legQuestion,
      chainId: bet.chainId,
      betId: bet.betId,
      timestamp: new Date().toISOString(),
    },
  };

  console.log('Broadcasting success notification:', message);

  const connections = await getAllConnections();
  await broadcastToConnections({
    endpoint: WEBSOCKET_ENDPOINT,
    connections,
    message,
    onStaleConnection: deleteConnection,
  });
}

/** Process a BET status change to a failure status */
async function processBetFailure(bet: BetEntity): Promise<void> {
  console.log('Processing bet failure:', {
    betId: bet.betId,
    wallet: bet.walletAddress,
    chainId: bet.chainId,
    status: bet.status,
  });

  const chain = await getChain(bet.chainId);
  const legQuestion = bet.marketQuestion || chain?.legs[bet.sequence - 1]?.marketQuestion;

  const message = {
    type: 'BET_FAILED',
    data: {
      wallet: truncateAddress(bet.walletAddress),
      stake: bet.stake,
      side: bet.side,
      question: legQuestion,
      chainId: bet.chainId,
      betId: bet.betId,
      reason: getFailureReason(bet.status),
      status: bet.status,
      timestamp: new Date().toISOString(),
    },
  };

  console.log('Broadcasting failure notification:', message);

  const connections = await getAllConnections();
  await broadcastToConnections({
    endpoint: WEBSOCKET_ENDPOINT,
    connections,
    message,
    onStaleConnection: deleteConnection,
  });
}

/** Process a BET MODIFY event */
async function processBetStatusChange(record: DynamoDBRecord): Promise<void> {
  if (!record.dynamodb?.NewImage || !record.dynamodb?.OldImage) {
    return;
  }

  const newBet = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  ) as BetEntity;

  const oldBet = unmarshall(
    record.dynamodb.OldImage as Record<string, AttributeValue>
  ) as BetEntity;

  // Only process BET entities
  if (newBet.entityType !== 'BET') {
    return;
  }

  // Only process if status actually changed
  if (newBet.status === oldBet.status) {
    return;
  }

  console.log('Bet status changed:', {
    betId: newBet.betId,
    oldStatus: oldBet.status,
    newStatus: newBet.status,
  });

  // Check for success (FILLED)
  if (newBet.status === 'FILLED' && oldBet.status !== 'FILLED') {
    await processBetSuccess(newBet);
    return;
  }

  // Check for failure
  if (FAILURE_STATUSES.includes(newBet.status) && !FAILURE_STATUSES.includes(oldBet.status)) {
    await processBetFailure(newBet);
    return;
  }
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  console.log(`Processing ${event.Records.length} records for bet notifications`);

  for (const record of event.Records) {
    try {
      // Only process MODIFY events (status changes)
      if (record.eventName === 'MODIFY') {
        await processBetStatusChange(record);
      }
    } catch (error) {
      console.error('Error processing record:', error);
    }
  }
}
