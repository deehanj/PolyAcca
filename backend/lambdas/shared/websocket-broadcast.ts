/**
 * Shared WebSocket broadcast utilities
 */

import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

interface Connection {
  connectionId: string;
}

interface BroadcastOptions {
  endpoint: string;
  connections: Connection[];
  message: object;
  onStaleConnection?: (connectionId: string) => Promise<void>;
}

/**
 * Broadcast a message to multiple WebSocket connections
 * Handles stale connections (HTTP 410) by calling the cleanup callback
 */
export async function broadcastToConnections(options: BroadcastOptions): Promise<{
  total: number;
  successful: number;
}> {
  const { endpoint, connections, message, onStaleConnection } = options;

  if (connections.length === 0) {
    console.log('No active connections to broadcast to');
    return { total: 0, successful: 0 };
  }

  console.log(`Broadcasting to ${connections.length} connections`);

  const apiClient = new ApiGatewayManagementApiClient({ endpoint });
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
        if (statusCode === 410 && onStaleConnection) {
          console.log('Stale connection, cleaning up:', conn.connectionId);
          await onStaleConnection(conn.connectionId);
        } else if (statusCode !== 410) {
          console.error('Error sending to connection:', conn.connectionId, error);
        }
        return { connectionId: conn.connectionId, success: false };
      }
    })
  );

  const successful = results.filter(
    (r) => r.status === 'fulfilled' && r.value.success
  ).length;

  console.log(`Broadcast complete: ${successful}/${connections.length} successful`);
  return { total: connections.length, successful };
}
