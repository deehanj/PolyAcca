/**
 * Verify Lambda - Verifies wallet signature and issues JWT
 *
 * POST /auth/verify
 * Body: { walletAddress: string, signature: string }
 * Response: { token: string, walletAddress: string, expiresAt: string }
 *
 * On first authentication, creates an embedded wallet via Turnkey for trading.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ethers } from 'ethers';
import { getNonce, deleteNonce, getOrCreateUser, getUser, updateUserEmbeddedWallet } from '../../shared/dynamo-client';
import { createToken } from '../../shared/jwt';
import { createWallet } from '../../shared/turnkey-client';
import type { VerifyRequest, VerifyResponse } from '../../shared/types';
import { NONCE_MESSAGE_PREFIX, isValidAddress } from '../../shared/auth-utils';
import { errorResponse, successResponse } from '../../shared/api-utils';
import { optionalEnvVar } from '../../utils/envVars';
import { createLogger } from '../../shared/logger';

const logger = createLogger('auth-verify');

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    if (!event.body) {
      return errorResponse(400, 'Request body is required');
    }

    const request: VerifyRequest = JSON.parse(event.body);

    // Validate inputs
    if (!request.walletAddress || !isValidAddress(request.walletAddress)) {
      return errorResponse(400, 'Invalid wallet address format');
    }

    if (!request.signature) {
      return errorResponse(400, 'Signature is required');
    }

    // Retrieve stored nonce
    const nonceEntity = await getNonce(request.walletAddress);

    if (!nonceEntity) {
      return errorResponse(400, 'Nonce not found or expired. Please request a new nonce.');
    }

    // Reconstruct the signed message
    const message = `${NONCE_MESSAGE_PREFIX}${nonceEntity.nonce}`;

    // Verify the signature (ethers v5 API)
    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.utils.verifyMessage(message, request.signature);
    } catch {
      return errorResponse(401, 'Invalid signature');
    }

    // Check if recovered address matches claimed address
    if (recoveredAddress.toLowerCase() !== request.walletAddress.toLowerCase()) {
      return errorResponse(401, 'Signature does not match wallet address');
    }

    // Delete the used nonce (one-time use)
    await deleteNonce(request.walletAddress);

    // Create or get user record
    const user = await getOrCreateUser(request.walletAddress);

    // Create embedded wallet if user doesn't have one
    if (!user.embeddedWalletAddress) {
      logger.info('Creating embedded wallet for new user', {
        walletAddress: request.walletAddress,
      });

      try {
        const embeddedWallet = await createWallet(request.walletAddress);
        await updateUserEmbeddedWallet(request.walletAddress, {
          turnkeyWalletId: embeddedWallet.walletId,
          embeddedWalletAddress: embeddedWallet.walletAddress,
        });

        logger.info('Embedded wallet created', {
          walletAddress: request.walletAddress,
          embeddedWalletAddress: embeddedWallet.walletAddress,
        });
      } catch (error) {
        // Log but don't fail authentication - wallet can be created later
        logger.errorWithStack('Failed to create embedded wallet', error, {
          walletAddress: request.walletAddress,
        });
      }
    }

    // Generate JWT token
    const token = await createToken(request.walletAddress);

    // Calculate expiry
    const expiryHours = parseInt(optionalEnvVar('TOKEN_EXPIRY_HOURS') || '24', 10);
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

    return successResponse<VerifyResponse>({
      token,
      walletAddress: request.walletAddress.toLowerCase(),
      expiresAt,
    });
  } catch (error) {
    console.error('Verification error:', error);
    return errorResponse(500, 'Internal server error');
  }
}
