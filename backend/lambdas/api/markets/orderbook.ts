/**
 * GET /markets/:conditionId/orderbook
 *
 * Fetches orderbook depth from Polymarket CLOB
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { fetchOrderbook } from '../../shared/orderbook-client';
import { createLogger } from '../../shared/logger';
import { errorResponse, successResponse } from '../../shared/api-utils';

const logger = createLogger('orderbook-endpoint');

export async function getOrderbook(
  conditionId: string,
  tokenId: string
): Promise<APIGatewayProxyResult> {
  if (!tokenId) {
    return errorResponse(400, 'tokenId query parameter required');
  }

  logger.info('Fetching orderbook', { conditionId, tokenId });

  try {
    const orderbook = await fetchOrderbook(tokenId);
    return successResponse(orderbook);
  } catch (error) {
    logger.errorWithStack('Failed to fetch orderbook', error, { conditionId, tokenId });
    return errorResponse(502, 'Failed to fetch orderbook from CLOB');
  }
}
