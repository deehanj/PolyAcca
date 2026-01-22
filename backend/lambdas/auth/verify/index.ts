/**
 * Verify Lambda - Verifies wallet signature and issues JWT
 *
 * POST /auth/verify
 * Body: { walletAddress: string, signature: string }
 * Response: { token: string, walletAddress: string, expiresAt: string }
 *
 * On first authentication:
 * 1. Creates an embedded wallet via Turnkey for trading
 * 2. Registers with Polymarket by deriving API credentials
 * 3. Caches credentials for future bet execution
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifyMessage } from 'ethers';
import { getNonce, deleteNonce, getOrCreateUser, updateUserEmbeddedWallet, updateUserHasCredentials, updateUserPolymarketSafe } from '../../shared/dynamo-client';
import { createToken } from '../../shared/jwt';
import { createWallet, createSigner } from '../../shared/turnkey-client';
import { deploySafeWallet } from '../../shared/safe-wallet-client';
import { ensureSafeApprovals } from '../../shared/safe-approvals-client';
import {
  deriveApiCredentials,
  encryptEmbeddedWalletCredentials,
} from '../../shared/polymarket-client';
import {
  cacheEmbeddedWalletCredentials,
  type EmbeddedWalletCredentialsInput,
} from '../../shared/embedded-wallet-credentials';
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

    // Verify the signature
    let recoveredAddress: string;
    try {
      recoveredAddress = verifyMessage(message, request.signature);
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
    let embeddedWalletAddress = user.embeddedWalletAddress;

    // Step 1: Create embedded wallet if user doesn't have one
    if (!embeddedWalletAddress) {
      logger.info('Creating embedded wallet for new user', {
        walletAddress: request.walletAddress,
      });

      try {
        const embeddedWallet = await createWallet(request.walletAddress);
        await updateUserEmbeddedWallet(request.walletAddress, {
          turnkeyWalletId: embeddedWallet.walletId,
          embeddedWalletAddress: embeddedWallet.walletAddress,
        });
        embeddedWalletAddress = embeddedWallet.walletAddress;

        logger.info('Embedded wallet created', {
          walletAddress: request.walletAddress,
          embeddedWalletAddress,
        });
      } catch (error) {
        logger.errorWithStack('Failed to create embedded wallet', error, {
          walletAddress: request.walletAddress,
        });
      }
    }

    // Step 2: Deploy Safe wallet if user doesn't have one
    let polymarketSafeAddress = user.polymarketSafeAddress;
    if (embeddedWalletAddress && !polymarketSafeAddress) {
      logger.info('Deploying Safe wallet for user', {
        walletAddress: request.walletAddress,
        embeddedWalletAddress,
      });

      try {
        // Create signer for the embedded wallet
        const embeddedSigner = await createSigner(embeddedWalletAddress);

        // Deploy Safe via Polymarket Builder Program
        const safeResult = await deploySafeWallet(
          request.walletAddress, // User's MetaMask wallet for deterministic salt
          embeddedSigner // EOA signer that will control the Safe
        );

        polymarketSafeAddress = safeResult.safeAddress;

        // Update user with Safe address
        await updateUserPolymarketSafe(request.walletAddress, polymarketSafeAddress);

        logger.info('Safe wallet deployed', {
          walletAddress: request.walletAddress,
          embeddedWalletAddress,
          polymarketSafeAddress,
          wasNewDeployment: safeResult.deployed,
        });
      } catch (error) {
        logger.errorWithStack('Failed to deploy Safe wallet', error, {
          walletAddress: request.walletAddress,
          embeddedWalletAddress,
        });
        // Don't fail authentication if Safe deployment fails
        // User can retry later or use EOA flow
      }
    }

    // Step 3: Ensure Safe has all required approvals
    if (embeddedWalletAddress && polymarketSafeAddress) {
      logger.info('Checking Safe approvals', {
        walletAddress: request.walletAddress,
        polymarketSafeAddress,
      });

      try {
        // Create signer for the embedded wallet (EOA that controls the Safe)
        const embeddedSigner = await createSigner(embeddedWalletAddress);

        // Check and set approvals if needed (gaslessly via Builder Program)
        const approvalsSet = await ensureSafeApprovals(
          polymarketSafeAddress,
          embeddedSigner
        );

        if (approvalsSet) {
          logger.info('Safe has all required approvals', {
            walletAddress: request.walletAddress,
            polymarketSafeAddress,
          });
        } else {
          logger.warn('Failed to set all Safe approvals', {
            walletAddress: request.walletAddress,
            polymarketSafeAddress,
          });
          // Don't fail authentication - user can retry approvals later
        }
      } catch (error) {
        logger.errorWithStack('Failed to ensure Safe approvals', error, {
          walletAddress: request.walletAddress,
          polymarketSafeAddress,
        });
        // Don't fail authentication if approval check/setting fails
      }
    }

    // Step 4: Register with Polymarket if user doesn't have credentials yet
    if (embeddedWalletAddress && polymarketSafeAddress && !user.hasCredentials) {
      logger.info('Registering with Polymarket using Safe', {
        walletAddress: request.walletAddress,
        embeddedWalletAddress,
        polymarketSafeAddress,
      });

      try {
        const signer = await createSigner(embeddedWalletAddress);

        // Derive API credentials with Safe as funder
        const credentials = await deriveApiCredentials(
          signer,
          polymarketSafeAddress // Pass Safe as the funder address
        );

        const encrypted = await encryptEmbeddedWalletCredentials({
          ...credentials,
          signatureType: 'POLY_GNOSIS_SAFE', // Use the correct Safe signature type
        });
        const now = new Date().toISOString();
        const credsInput: EmbeddedWalletCredentialsInput = {
          entityType: 'EMBEDDED_WALLET_CREDS',
          walletAddress: request.walletAddress.toLowerCase(),
          ...encrypted,
          signatureType: 'POLY_GNOSIS_SAFE',
          createdAt: now,
          updatedAt: now,
        };
        await cacheEmbeddedWalletCredentials(credsInput);

        // Mark user as having credentials (this also marks Safe address in DB)
        // updateUserPolymarketSafe already called above, so just mark has credentials
        await updateUserHasCredentials(request.walletAddress);

        logger.info('Polymarket registration complete with Safe', {
          walletAddress: request.walletAddress,
          embeddedWalletAddress,
          polymarketSafeAddress,
        });
      } catch (error) {
        logger.errorWithStack('Failed to register with Polymarket', error, {
          walletAddress: request.walletAddress,
          polymarketSafeAddress,
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
