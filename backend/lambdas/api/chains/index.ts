/**
 * Chains Lambda - Router
 *
 * Routes requests to appropriate handlers:
 * - GET /chains - List user's chains
 * - POST /chains - Create user chain
 * - POST /chains/estimate - Calculate price impact estimates
 * - GET /chains/{id} - Get user chain details
 * - PUT /chains/{id} - Update chain customization (name, description, image)
 * - GET /chains/{id}/users - Get all users on a chain
 * - DELETE /chains/{id} - Cancel user chain
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { ApiResponse } from '../../shared/types';
import { HEADERS, getWalletAddress, errorResponse } from './utils';
import { listUserChains, getUserChainById, getChainUsers, listTrendingChains } from './get';
import { createUserChain } from './post';
import { updateChain } from './put';
import { cancelUserChain } from './delete';
import { estimateChain } from './estimate';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const method = event.httpMethod;
    const chainId = event.pathParameters?.chainId;
    const isUsersRoute = event.path.endsWith('/users');
    const isTrendingRoute = event.path.endsWith('/trending');
    const isEstimateRoute = event.path.endsWith('/estimate');

    // Public endpoint: GET /chains/trending (no auth required)
    if (isTrendingRoute && method === 'GET') {
      const limit = parseInt(event.queryStringParameters?.limit || '10', 10);
      return listTrendingChains(Math.min(limit, 50)); // Cap at 50
    }

    // POST /chains/estimate - Calculate price impact estimates
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
      // Routes with {chainId}
      if (isUsersRoute && method === 'GET') {
        return getChainUsers(chainId);
      }

      switch (method) {
        case 'GET':
          return getUserChainById(walletAddress, chainId);
        case 'PUT':
          return updateChain(chainId, event.body);
        case 'DELETE':
          return cancelUserChain(walletAddress, chainId);
        default:
          return errorResponse(405, 'Method not allowed');
      }
    } else {
      // Routes without {chainId}
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
