/**
 * Wallet Lambda - Embedded wallet operations
 *
 * Endpoints:
 * - POST /wallet/withdraw - Withdraw USDC to connected wallet (requires fresh signature)
 *
 * Security: Uses signature-based auth (not JWT) for sensitive operations.
 * User must sign a message containing the exact withdraw amount and a fresh nonce.
 *
 * Gas: Uses EIP-2612 permit so the platform wallet pays gas fees,
 * not the user's embedded wallet.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ethers } from 'ethers';

// ethers v5 helpers
const { verifyMessage } = ethers.utils;
import { getNonce, deleteNonce, getUser } from '../../shared/dynamo-client';
import { buildWithdrawMessage, isValidAddress } from '../../shared/auth-utils';
import { errorResponse, successResponse } from '../../shared/api-utils';
import { createLogger } from '../../shared/logger';
import { transferUsdcWithPlatformGas } from '../../shared/usdc-permit';
import type { WithdrawRequest, WithdrawResponse } from '../../shared/types';

const logger = createLogger('wallet');

/**
 * POST /wallet/withdraw - Withdraw USDC to connected wallet
 *
 * Uses EIP-2612 permit for gasless withdrawals:
 * 1. Frontend calls /auth/nonce to get a fresh nonce
 * 2. User signs message: "Withdraw {amount} USDC from PolyAcca\n\nNonce: {nonce}"
 * 3. Frontend calls this endpoint with amount, walletAddress, and signature
 * 4. Backend verifies signature
 * 5. Embedded wallet signs permit (off-chain via Turnkey)
 * 6. Platform wallet submits permit + transferFrom (pays gas)
 * 7. USDC transferred from embedded wallet to user's connected wallet
 */
async function handleWithdraw(
  body: string | null
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return errorResponse(400, 'Request body required');
  }

  let request: WithdrawRequest;
  try {
    request = JSON.parse(body);
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  const { walletAddress, amount, signature } = request;

  // Validate inputs
  if (!walletAddress || !isValidAddress(walletAddress)) {
    return errorResponse(400, 'Invalid wallet address');
  }

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return errorResponse(400, 'Invalid amount');
  }

  if (!signature) {
    return errorResponse(400, 'Signature required');
  }

  // Get stored nonce for this wallet
  const nonceEntity = await getNonce(walletAddress);
  if (!nonceEntity) {
    return errorResponse(400, 'Nonce not found or expired. Please request a new nonce.');
  }

  // Reconstruct the withdraw message
  const message = buildWithdrawMessage(amount, nonceEntity.nonce);

  // Verify signature
  let recoveredAddress: string;
  try {
    recoveredAddress = verifyMessage(message, signature);
  } catch {
    return errorResponse(401, 'Invalid signature');
  }

  if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    return errorResponse(401, 'Signature does not match wallet address');
  }

  // Delete the used nonce (one-time use)
  await deleteNonce(walletAddress);

  // Get user profile to find embedded wallet
  const user = await getUser(walletAddress);
  if (!user) {
    return errorResponse(404, 'User not found');
  }

  if (!user.embeddedWalletAddress) {
    return errorResponse(400, 'No embedded wallet found. Please re-authenticate.');
  }

  logger.info('Processing withdraw with permit', {
    walletAddress,
    embeddedWalletAddress: user.embeddedWalletAddress,
    amount,
    destination: walletAddress,
  });

  // Execute transfer using permit (platform wallet pays gas)
  const result = await transferUsdcWithPlatformGas(
    user.embeddedWalletAddress,
    walletAddress, // Destination is user's connected wallet
    amount
  );

  if (!result.success) {
    logger.error('Withdraw failed', {
      walletAddress,
      embeddedWalletAddress: user.embeddedWalletAddress,
      amount,
      error: result.error,
    });

    // Return user-friendly error messages
    if (result.error?.includes('Insufficient balance')) {
      return errorResponse(400, result.error);
    }

    return errorResponse(500, 'Withdraw failed. Please try again.');
  }

  logger.info('Withdraw completed', {
    txHash: result.txHash,
    walletAddress,
    amount,
  });

  const response: WithdrawResponse = {
    txHash: result.txHash ?? '',
    amount,
    destination: walletAddress,
  };

  return successResponse(response);
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const method = event.httpMethod;
    const path = event.path;

    // POST /wallet/withdraw
    if (method === 'POST' && path.endsWith('/withdraw')) {
      return handleWithdraw(event.body);
    }

    return errorResponse(404, 'Not found');
  } catch (error) {
    logger.errorWithStack('Wallet handler error', error);
    return errorResponse(500, 'Internal server error');
  }
}
