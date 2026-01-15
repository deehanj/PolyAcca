/**
 * Markets Lambda - Public market listing
 *
 * Routes:
 * - GET /markets - List markets from Gamma API
 * - GET /markets/{marketId} - Get single market
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { HEADERS, errorResponse } from '../../shared/api-utils';
import { listMarkets, getMarketById } from './get';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const method = event.httpMethod;
    const marketId = event.pathParameters?.marketId;

    if (method !== 'GET') {
      return errorResponse(405, 'Method not allowed');
    }

    if (marketId) {
      return getMarketById(marketId);
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};

    return listMarkets({
      limit: queryParams.limit ? parseInt(queryParams.limit, 10) : undefined,
      offset: queryParams.offset ? parseInt(queryParams.offset, 10) : undefined,
      active: queryParams.active ? queryParams.active === 'true' : undefined,
      closed: queryParams.closed ? queryParams.closed === 'true' : undefined,
      category: queryParams.category,
      order: queryParams.order as 'volume' | 'liquidity' | 'endDate' | undefined,
      ascending: queryParams.ascending === 'true',
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
