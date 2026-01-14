/**
 * Verify Lambda - Verifies wallet signature and issues JWT
 *
 * POST /auth/verify
 * Body: { walletAddress: string, signature: string }
 * Response: { token: string, walletAddress: string, expiresAt: string }
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ethers } from 'ethers';
import { getNonce, deleteNonce, getOrCreateUser } from '../../shared/dynamo-client';
import { createToken } from '../../shared/jwt';
import type { VerifyRequest, VerifyResponse, ApiResponse } from '../../shared/types';

const NONCE_MESSAGE_PREFIX = 'Sign this message to authenticate with PolyAcca:\n\nNonce: ';

/**
 * Validate Ethereum address format
 */
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
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

    const request: VerifyRequest = JSON.parse(event.body);

    // Validate inputs
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

    if (!request.signature) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Signature is required',
        } as ApiResponse),
      };
    }

    // Retrieve stored nonce
    const nonceEntity = await getNonce(request.walletAddress);

    if (!nonceEntity) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Nonce not found or expired. Please request a new nonce.',
        } as ApiResponse),
      };
    }

    // Reconstruct the signed message
    const message = `${NONCE_MESSAGE_PREFIX}${nonceEntity.nonce}`;

    // Verify the signature
    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.utils.verifyMessage(message, request.signature);
    } catch {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid signature',
        } as ApiResponse),
      };
    }

    // Check if recovered address matches claimed address
    if (recoveredAddress.toLowerCase() !== request.walletAddress.toLowerCase()) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Signature does not match wallet address',
        } as ApiResponse),
      };
    }

    // Delete the used nonce (one-time use)
    await deleteNonce(request.walletAddress);

    // Create or get user record
    await getOrCreateUser(request.walletAddress);

    // Generate JWT token
    const token = await createToken(request.walletAddress);

    // Calculate expiry
    const expiryHours = parseInt(process.env.TOKEN_EXPIRY_HOURS || '24', 10);
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

    const response: ApiResponse<VerifyResponse> = {
      success: true,
      data: {
        token,
        walletAddress: request.walletAddress.toLowerCase(),
        expiresAt,
      },
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Verification error:', error);

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
