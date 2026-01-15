import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { saveConnection } from '../../shared/dynamo-client';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;

  if (!connectionId) {
    return { statusCode: 400, body: 'Missing connectionId' };
  }

  try {
    await saveConnection(connectionId);
    console.log(`Connection established: ${connectionId}`);
    return { statusCode: 200, body: 'Connected' };
  } catch (error) {
    console.error('Failed to save connection:', error);
    return { statusCode: 500, body: 'Failed to connect' };
  }
};
