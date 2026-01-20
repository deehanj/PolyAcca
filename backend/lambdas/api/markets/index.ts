/**
 * Markets Lambda - Public market listing
 *
 * Routes:
 * - GET /markets - List markets from Gamma API
 * - GET /markets/{marketId} - Get single market
 * - GET /markets/{conditionId}/orderbook - Get orderbook for a market
 * - GET /markets/{tokenId}/status - Check if market is accepting orders (CLOB)
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { HEADERS, errorResponse } from '../../shared/api-utils';
import { listMarkets, getMarketById, getMarketStatus } from './get';
import { getOrderbook } from './orderbook';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const method = event.httpMethod;
    const path = event.path;
    const pathParts = path.split('/').filter(Boolean);

    if (method !== 'GET') {
      return errorResponse(405, 'Method not allowed');
    }

    // GET /markets/{conditionId}/orderbook
    if (path.match(/^\/markets\/[^/]+\/orderbook$/)) {
      const conditionId = pathParts[1];
      const tokenId = event.queryStringParameters?.tokenId || '';
      return getOrderbook(conditionId, tokenId);
    }

    // GET /markets/{tokenId}/status - Check if market is accepting orders
    if (path.match(/^\/markets\/[^/]+\/status$/)) {
      const tokenId = pathParts[1];
      return getMarketStatus(tokenId);
    }

    // GET /markets/{marketId}
    const marketId = event.pathParameters?.marketId;
    if (marketId) {
      return getMarketById(marketId);
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};

    return listMarkets({
      // Pagination
      limit: queryParams.limit ? parseInt(queryParams.limit, 10) : undefined,
      offset: queryParams.offset ? parseInt(queryParams.offset, 10) : undefined,
      // Status filters
      active: queryParams.active ? queryParams.active === 'true' : undefined,
      closed: queryParams.closed ? queryParams.closed === 'true' : undefined,
      // Range filters
      liquidityMin: queryParams.liquidityMin ? parseFloat(queryParams.liquidityMin) : undefined,
      liquidityMax: queryParams.liquidityMax ? parseFloat(queryParams.liquidityMax) : undefined,
      volumeMin: queryParams.volumeMin ? parseFloat(queryParams.volumeMin) : undefined,
      volumeMax: queryParams.volumeMax ? parseFloat(queryParams.volumeMax) : undefined,
      // Date filters
      endDateMin: queryParams.endDateMin,
      endDateMax: queryParams.endDateMax,
      // Sorting
      order: queryParams.order as 'volume' | 'liquidity' | 'endDate' | 'startDate' | 'volume24hr' | undefined,
      ascending: queryParams.ascending === 'true',
      // Tag filter
      tagId: queryParams.tagId ? parseInt(queryParams.tagId, 10) : undefined,
    });
  } catch (error) {
    console.error('Markets handler error:', error);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ success: false, error: 'Internal server error' }),
    };
  }
}
