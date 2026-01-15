/**
 * Admin WebSocket $disconnect handler
 *
 * Removes admin connection from DynamoDB
 */

import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { deleteAdminConnection } from '../../shared/dynamo-client';

export async function handler(event: APIGatewayProxyWebsocketEventV2) {
  const connectionId = event.requestContext.connectionId;
  console.log('Admin WebSocket disconnect:', connectionId);

  try {
    await deleteAdminConnection(connectionId);
    console.log('Admin connection removed:', connectionId);

    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    console.error('Admin disconnect error:', error);
    return { statusCode: 500, body: 'Internal server error' };
  }
}
