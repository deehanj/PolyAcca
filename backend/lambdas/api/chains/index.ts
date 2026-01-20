/**
 * Chains Lambda - Router
 *
 * Routes requests to appropriate handlers:
 * - GET /chains - List user's chains (authenticated)
 * - POST /chains - Create user chain (authenticated)
 * - POST /chains/estimate - Calculate price impact estimates (public)
 * - GET /chains/trending - List trending chains (public)
 * - GET /chains/{id} - Get chain details (public, for shared links)
 * - PUT /chains/{id} - Update chain customization (authenticated)
 * - DELETE /chains/{id} - Cancel user chain (authenticated)
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { ApiResponse } from '../../shared/types';
import { HEADERS, getWalletAddress, errorResponse } from './utils';
import { listUserChains, getChainById, listTrendingChains } from './get';
import { createUserChain } from './post';
import { updateChain } from './put';
import { cancelUserChain } from './delete';
import { estimateChain } from './estimate';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const method = event.httpMethod;
    const chainId = event.pathParameters?.chainId;
    const isTrendingRoute = event.path.endsWith('/trending');
    const isEstimateRoute = event.path.endsWith('/estimate');

    // Public endpoint: GET /chains/trending (no auth required)
    if (isTrendingRoute && method === 'GET') {
      const limit = parseInt(event.queryStringParameters?.limit || '10', 10);
      return listTrendingChains(Math.min(limit, 50)); // Cap at 50
    }

    // Public endpoint: GET /chains/{id} (for shared acca links - no auth required)
    if (chainId && method === 'GET') {
      return getChainById(chainId);
    }

    // POST /chains/estimate - Calculate price impact estimates (public)
    if (isEstimateRoute && method === 'POST') {
      return estimateChain(event.body);
    }

    // All other routes require authentication
    const walletAddress = getWalletAddress(event);
    if (!walletAddress) {
      return errorResponse(401, 'Unauthorized');
    }

    // Route handling
    if (chainId) {
      // Routes with {chainId} (authenticated)
      switch (method) {
        case 'PUT':
          return updateChain(chainId, event.body);
        case 'DELETE':
          return cancelUserChain(walletAddress, chainId);
        default:
          return errorResponse(405, 'Method not allowed');
      }
    } else {
      // Routes without {chainId} (authenticated)
      switch (method) {
        case 'GET':
          return listUserChains(walletAddress);
        case 'POST':
          return createUserChain(walletAddress, event.body);
        default:
          return errorResponse(405, 'Method not allowed');
      }
    }
  } catch (error) {
    console.error('Chains handler error:', error);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ success: false, error: 'Internal server error' } as ApiResponse),
    };
  }
}
