/**
 * Nonce Lambda - Generates a nonce for wallet-based authentication
 *
 * POST /auth/nonce
 * Body: { walletAddress: string }
 * Response: { nonce: string, message: string }
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { randomBytes } from 'crypto';
import { saveNonce } from '../../shared/dynamo-client';
import type { NonceRequest, NonceResponse } from '../../shared/types';
import { NONCE_MESSAGE_PREFIX, isValidAddress } from '../../shared/auth-utils';
import { HEADERS, errorResponse, successResponse } from '../../shared/api-utils';

/**
 * Generate a cryptographically secure nonce
 */
function generateNonce(): string {
  return randomBytes(32).toString('hex');
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    if (!event.body) {
      return errorResponse(400, 'Request body is required');
    }

    const request: NonceRequest = JSON.parse(event.body);

    // Validate wallet address
    if (!request.walletAddress || !isValidAddress(request.walletAddress)) {
      return errorResponse(400, 'Invalid wallet address format');
    }

    // Generate nonce
    const nonce = generateNonce();
    const message = `${NONCE_MESSAGE_PREFIX}${nonce}`;

    // Store nonce in DynamoDB (with TTL)
    await saveNonce(request.walletAddress, nonce);

    return successResponse<NonceResponse>({ nonce, message });
  } catch (error) {
    console.error('Nonce generation error:', error);
    return errorResponse(500, 'Internal server error');
  }
}
