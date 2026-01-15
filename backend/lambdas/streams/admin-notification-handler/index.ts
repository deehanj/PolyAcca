/**
 * Admin Notification Handler
 *
 * Triggered by DynamoDB Stream when chain/bet/userChain statuses change.
 * Broadcasts updates to all connected admin WebSocket clients.
 */

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { getAllAdminConnections, deleteAdminConnection } from '../../shared/dynamo-client';
import { broadcastToConnections } from '../../shared/websocket-broadcast';
import type { ChainEntity, BetEntity, UserChainEntity } from '../../shared/types';
import { requireEnvVar } from '../../utils/envVars';

const ADMIN_WEBSOCKET_ENDPOINT = requireEnvVar('ADMIN_WEBSOCKET_ENDPOINT');

type EntityType = 'CHAIN' | 'BET' | 'USER_CHAIN';
const TRACKED_ENTITIES: EntityType[] = ['CHAIN', 'BET', 'USER_CHAIN'];

/** Get entity type from DynamoDB record */
function getEntityType(record: DynamoDBRecord): EntityType | null {
  const image = record.dynamodb?.NewImage || record.dynamodb?.OldImage;
  if (!image) return null;
  const unmarshalled = unmarshall(image as Record<string, AttributeValue>);
  return unmarshalled.entityType as EntityType | null;
}

/** Process a single DynamoDB stream record */
async function processRecord(record: DynamoDBRecord): Promise<void> {
  const eventName = record.eventName as 'INSERT' | 'MODIFY' | 'REMOVE';
  const entityType = getEntityType(record);

  if (!entityType || !TRACKED_ENTITIES.includes(entityType)) return;

  const newImage = record.dynamodb?.NewImage;
  const oldImage = record.dynamodb?.OldImage;

  const entity = newImage
    ? (unmarshall(newImage as Record<string, AttributeValue>) as ChainEntity | BetEntity | UserChainEntity)
    : undefined;
  const oldEntity = oldImage
    ? (unmarshall(oldImage as Record<string, AttributeValue>) as ChainEntity | BetEntity | UserChainEntity)
    : undefined;

  if (!entity && !oldEntity) return;

  // Skip MODIFY if status unchanged (reduces noise)
  if (eventName === 'MODIFY' && oldEntity && entity) {
    const oldStatus = (oldEntity as { status?: string }).status;
    const newStatus = (entity as { status?: string }).status;
    if (oldStatus === newStatus) return;
  }

  console.log('Processing admin update:', { eventName, entityType, PK: entity?.PK });

  const connections = await getAllAdminConnections();
  await broadcastToConnections({
    endpoint: ADMIN_WEBSOCKET_ENDPOINT,
    connections,
    message: {
      type: 'ADMIN_UPDATE',
      data: {
        entityType,
        eventName,
        entity: entity || oldEntity,
        oldEntity: eventName === 'MODIFY' ? oldEntity : undefined,
      },
    },
    onStaleConnection: deleteAdminConnection,
  });
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  console.log(`Processing ${event.Records.length} records for admin notifications`);

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      console.error('Error processing record for admin notification:', error);
    }
  }
}
