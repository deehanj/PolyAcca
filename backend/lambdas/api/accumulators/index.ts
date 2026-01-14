/**
 * Accumulators Lambda - Router
 *
 * Routes requests to appropriate handlers:
 * - GET /accumulators - List user's accumulators
 * - POST /accumulators - Create new accumulator with bets
 * - GET /accumulators/{id} - Get accumulator details
 * - PATCH /accumulators/{id} - Modify accumulator chain
 * - DELETE /accumulators/{id} - Cancel accumulator
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { ApiResponse } from '../../shared/types';
import { HEADERS, getWalletAddress, errorResponse } from './utils';
import { listAccumulators, getAccumulatorById } from './get';
import { createAccumulator } from './post';
import { patchAccumulator } from './patch';
import { cancelAccumulator } from './delete';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Get wallet address from authorizer
    const walletAddress = getWalletAddress(event);
    if (!walletAddress) {
      return errorResponse(401, 'Unauthorized');
    }

    const method = event.httpMethod;
    const accumulatorId = event.pathParameters?.accumulatorId;

    // Route handling
    if (accumulatorId) {
      // Routes with {accumulatorId}
      switch (method) {
        case 'GET':
          return getAccumulatorById(walletAddress, accumulatorId);
        case 'PATCH':
          return patchAccumulator(walletAddress, accumulatorId, event.body);
        case 'DELETE':
          return cancelAccumulator(walletAddress, accumulatorId);
        default:
          return errorResponse(405, 'Method not allowed');
      }
    } else {
      // Routes without {accumulatorId}
      switch (method) {
        case 'GET':
          return listAccumulators(walletAddress);
        case 'POST':
          return createAccumulator(walletAddress, event.body);
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
