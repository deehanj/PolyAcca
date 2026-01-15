import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const { domainName, stage } = event.requestContext;

  if (!connectionId) {
    return { statusCode: 400, body: 'Missing connectionId' };
  }

  // Parse incoming message
  let message: { type?: string } = {};
  try {
    message = JSON.parse(event.body || '{}');
  } catch {
    // Ignore invalid JSON
    return { statusCode: 200, body: 'OK' };
  }

  // Respond to ping with pong
  if (message.type === 'ping') {
    const client = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}/${stage}`,
    });

    try {
      await client.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify({ type: 'pong' })),
        })
      );
    } catch (error) {
      console.error('Failed to send pong:', error);
    }
  }

  return { statusCode: 200, body: 'OK' };
};
