/**
 * Bet Notification Handler
 *
 * Triggered by DynamoDB Stream when a UserChainEntity is inserted.
 * Broadcasts the new bet notification to all connected WebSocket clients.
 */

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {
  getAllConnections,
  deleteConnection,
  getChain,
} from '../../shared/dynamo-client';
import type { UserChainEntity } from '../../shared/types';
import { requireEnvVar } from '../../utils/envVars';

// Environment variables - validated at module load time
const WEBSOCKET_ENDPOINT = requireEnvVar('WEBSOCKET_ENDPOINT');

/**
 * Truncate wallet address for display (0x1234...5678)
 */
function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Broadcast a message to all connected WebSocket clients
 */
async function broadcastToAllConnections(message: object): Promise<void> {
  const connections = await getAllConnections();

  if (connections.length === 0) {
    console.log('No active connections to broadcast to');
    return;
  }

  console.log(`Broadcasting to ${connections.length} connections`);

  const apiClient = new ApiGatewayManagementApiClient({
    endpoint: WEBSOCKET_ENDPOINT,
  });

  const payload = JSON.stringify(message);

  const results = await Promise.allSettled(
    connections.map(async (conn) => {
      try {
        await apiClient.send(
          new PostToConnectionCommand({
            ConnectionId: conn.connectionId,
            Data: Buffer.from(payload),
          })
        );
        return { connectionId: conn.connectionId, success: true };
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 410) {
          // Connection is stale, delete it
          console.log('Stale connection, deleting:', conn.connectionId);
          await deleteConnection(conn.connectionId);
        } else {
          console.error('Error sending to connection:', conn.connectionId, error);
        }
        return { connectionId: conn.connectionId, success: false, error };
      }
    })
  );

  const successful = results.filter(
    (r) => r.status === 'fulfilled' && r.value.success
  ).length;
  console.log(`Broadcast complete: ${successful}/${connections.length} successful`);
}

/**
 * Process a single UserChain INSERT event
 */
async function processNewBet(record: DynamoDBRecord): Promise<void> {
  if (!record.dynamodb?.NewImage) {
    console.warn('No NewImage in record');
    return;
  }

  // Unmarshall the DynamoDB record
  const userChain = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  ) as UserChainEntity;

  // Verify this is a USER_CHAIN entity
  if (userChain.entityType !== 'USER_CHAIN') {
    console.log('Not a USER_CHAIN entity, skipping');
    return;
  }

  console.log('Processing new bet:', {
    wallet: userChain.walletAddress,
    chainId: userChain.chainId,
    stake: userChain.initialStake,
  });

  // Get the chain definition to get the legs
  const chain = await getChain(userChain.chainId);
  const legs = chain?.legs.map((leg) => leg.marketQuestion) || [];

  // Build notification message
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

  // Broadcast to all connected clients
  await broadcastToAllConnections(message);
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  console.log(`Processing ${event.Records.length} records`);

  for (const record of event.Records) {
    try {
      // Only process INSERT events (new user chain associations)
      if (record.eventName === 'INSERT') {
        await processNewBet(record);
      }
    } catch (error) {
      console.error('Error processing record:', error);
      // Continue with other records, don't fail the entire batch
    }
  }
}
