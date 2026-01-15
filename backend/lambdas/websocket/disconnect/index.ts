import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { deleteConnection } from '../../shared/dynamo-client';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;

  if (!connectionId) {
    return { statusCode: 400, body: 'Missing connectionId' };
  }

  try {
    await deleteConnection(connectionId);
    console.log(`Connection closed: ${connectionId}`);
    return { statusCode: 200, body: 'Disconnected' };
  } catch (error) {
    console.error('Failed to delete connection:', error);
    // Return success anyway - connection is gone
    return { statusCode: 200, body: 'Disconnected' };
  }
};
