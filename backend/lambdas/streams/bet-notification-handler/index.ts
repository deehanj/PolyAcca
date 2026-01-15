/**
 * Bet Notification Handler
 *
 * Triggered by DynamoDB Stream when a UserChainEntity is inserted.
 * Broadcasts the new bet notification to all connected WebSocket clients.
 */

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { getAllConnections, deleteConnection, getChain } from '../../shared/dynamo-client';
import { broadcastToConnections } from '../../shared/websocket-broadcast';
import type { UserChainEntity } from '../../shared/types';
import { requireEnvVar } from '../../utils/envVars';

const WEBSOCKET_ENDPOINT = requireEnvVar('WEBSOCKET_ENDPOINT');

/** Truncate wallet address for display (0x1234...5678) */
function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/** Process a single UserChain INSERT event */
async function processNewBet(record: DynamoDBRecord): Promise<void> {
  if (!record.dynamodb?.NewImage) {
    console.warn('No NewImage in record');
    return;
  }

  const userChain = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  ) as UserChainEntity;

  if (userChain.entityType !== 'USER_CHAIN') {
    console.log('Not a USER_CHAIN entity, skipping');
    return;
  }

  console.log('Processing new bet:', {
    wallet: userChain.walletAddress,
    chainId: userChain.chainId,
    stake: userChain.initialStake,
  });

  const chain = await getChain(userChain.chainId);
  const legs = chain?.legs.map((leg) => leg.marketQuestion) || [];

  const message = {
    type: 'NEW_BET',
    data: {
      wallet: truncateAddress(userChain.walletAddress),
      stake: userChain.initialStake,
      legs,
      chainId: userChain.chainId,
      timestamp: userChain.createdAt,
    },
  };

  console.log('Broadcasting notification:', message);

  const connections = await getAllConnections();
  await broadcastToConnections({
    endpoint: WEBSOCKET_ENDPOINT,
    connections,
    message,
    onStaleConnection: deleteConnection,
  });
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  console.log(`Processing ${event.Records.length} records`);

  for (const record of event.Records) {
    try {
      if (record.eventName === 'INSERT') {
        await processNewBet(record);
      }
    } catch (error) {
      console.error('Error processing record:', error);
    }
  }
}
