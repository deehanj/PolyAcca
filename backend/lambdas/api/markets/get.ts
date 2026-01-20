/**
 * Markets GET handlers
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { fetchMarkets, fetchMarketById } from '../../shared/gamma-client';
import { checkMarketAcceptingOrders, isMarketBettable } from '../../shared/clob-client';
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

/**
 * GET /markets/{conditionId}/status - Check if market is accepting orders
 *
 * Queries the CLOB API (source of truth) to determine if a market
 * is currently accepting orders for betting.
 *
 * @param conditionId - The condition ID for the market (from Market.conditionId)
 */
export async function getMarketStatus(conditionId: string): Promise<APIGatewayProxyResult> {
  try {
    const status = await checkMarketAcceptingOrders(conditionId);

    if (!status) {
      // Market not found on CLOB
      return successResponse({
        conditionId,
        acceptingOrders: false,
        canBet: false,
        reason: 'Market not found on order book',
      });
    }

    // Use the convenience function for canBet + reason
    const bettability = await isMarketBettable(conditionId);

    return successResponse({
      conditionId,
      acceptingOrders: status.acceptingOrders,
      closed: status.closed,
      active: status.active,
      enableOrderBook: status.enableOrderBook,
      endDate: status.endDate,
      canBet: bettability.canBet,
      reason: bettability.reason,
    });
  } catch (error) {
    console.error('Failed to get market status:', error);
    return errorResponse(502, 'Failed to check market status');
  }
}
