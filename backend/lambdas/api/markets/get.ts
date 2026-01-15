/**
 * Markets GET handlers
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { fetchMarkets, fetchMarketById } from '../../shared/gamma-client';
import { errorResponse, successResponse } from '../../shared/api-utils';
import type { MarketsQueryParams, MarketsListResponse } from '../../shared/types';

/**
 * GET /markets - List markets
 */
export async function listMarkets(
  params: MarketsQueryParams
): Promise<APIGatewayProxyResult> {
  try {
    const { markets, rawCount } = await fetchMarkets(params);

    const response: MarketsListResponse = {
      markets,
      limit: params.limit ?? 20,
      offset: params.offset ?? 0,
      total: rawCount,
    };

    return successResponse(response);
  } catch (error) {
    console.error('Failed to list markets:', error);
    return errorResponse(502, 'Failed to fetch markets from external API');
  }
}

/**
 * GET /markets/{marketId} - Get single market
 */
export async function getMarketById(marketId: string): Promise<APIGatewayProxyResult> {
  try {
    const market = await fetchMarketById(marketId);

    if (!market) {
      return errorResponse(404, 'Market not found');
    }

    return successResponse(market);
  } catch (error) {
    console.error('Failed to get market:', error);
    return errorResponse(502, 'Failed to fetch market from external API');
  }
}
