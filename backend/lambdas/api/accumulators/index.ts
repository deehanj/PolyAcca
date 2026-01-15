/**
 * Accumulators Lambda - Router
 *
 * Routes requests to appropriate handlers:
 * - GET /accumulators - List user's accumulators
 * - POST /accumulators - Create user acca
 * - GET /accumulators/{id} - Get user acca details
 * - GET /accumulators/{id}/users - Get all users on an accumulator
 * - DELETE /accumulators/{id} - Cancel user acca
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { ApiResponse } from '../../shared/types';
import { HEADERS, getWalletAddress, errorResponse } from './utils';
import { listUserAccas, getUserAccaById, getAccumulatorUsers } from './get';
import { createUserAcca } from './post';
import { cancelUserAcca } from './delete';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Get wallet address from authorizer
    const walletAddress = getWalletAddress(event);
    if (!walletAddress) {
      return errorResponse(401, 'Unauthorized');
    }

    const method = event.httpMethod;
    const accumulatorId = event.pathParameters?.accumulatorId;
    const isUsersRoute = event.path.endsWith('/users');

    // Route handling
    if (accumulatorId) {
      // Routes with {accumulatorId}
      if (isUsersRoute && method === 'GET') {
        return getAccumulatorUsers(accumulatorId);
      }

      switch (method) {
        case 'GET':
          return getUserAccaById(walletAddress, accumulatorId);
        case 'DELETE':
          return cancelUserAcca(walletAddress, accumulatorId);
        default:
          return errorResponse(405, 'Method not allowed');
      }
    } else {
      // Routes without {accumulatorId}
      switch (method) {
        case 'GET':
          return listUserAccas(walletAddress);
        case 'POST':
          return createUserAcca(walletAddress, event.body);
        default:
          return errorResponse(405, 'Method not allowed');
      }
    }
  } catch (error) {
    console.error('Accumulators handler error:', error);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ success: false, error: 'Internal server error' } as ApiResponse),
    };
  }
}
