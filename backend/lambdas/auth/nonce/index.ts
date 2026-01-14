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
import type { NonceRequest, NonceResponse, ApiResponse } from '../../shared/types';

const NONCE_MESSAGE_PREFIX = 'Sign this message to authenticate with PolyAcca:\n\nNonce: ';

/**
 * Validate Ethereum address format
 */
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Generate a cryptographically secure nonce
 */
function generateNonce(): string {
  return randomBytes(32).toString('hex');
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Request body is required',
        } as ApiResponse),
      };
    }

    const request: NonceRequest = JSON.parse(event.body);

    // Validate wallet address
    if (!request.walletAddress || !isValidAddress(request.walletAddress)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid wallet address format',
        } as ApiResponse),
      };
    }

    // Generate nonce
    const nonce = generateNonce();
    const message = `${NONCE_MESSAGE_PREFIX}${nonce}`;

    // Store nonce in DynamoDB (with TTL)
    await saveNonce(request.walletAddress, nonce);

    const response: ApiResponse<NonceResponse> = {
      success: true,
      data: {
        nonce,
        message,
      },
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Nonce generation error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Internal server error',
      } as ApiResponse),
    };
  }
}
