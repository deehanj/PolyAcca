/**
 * Wallet Lambda - Embedded wallet operations
 *
 * Endpoints:
 * - POST /wallet/withdraw - Withdraw USDC to connected wallet (requires fresh signature)
 * - GET /wallet/moonpay-url - Get signed MoonPay widget URL for buying USDC on Polygon
 *
 * Security: Uses signature-based auth (not JWT) for sensitive operations.
 * User must sign a message containing the exact withdraw amount and a fresh nonce.
 *
 * Gas: Uses EIP-2612 permit so the platform wallet pays gas fees,
 * not the user's embedded wallet.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createHmac } from 'crypto';
import { verifyMessage } from 'ethers';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { getNonce, deleteNonce, getUser } from '../../shared/dynamo-client';
import { buildWithdrawMessage, isValidAddress } from '../../shared/auth-utils';
import { errorResponse, successResponse } from '../../shared/api-utils';
import { createLogger } from '../../shared/logger';
import { transferUsdcWithPlatformGas } from '../../shared/usdc-permit';
import type { WithdrawRequest, WithdrawResponse } from '../../shared/types';

const secretsClient = new SecretsManagerClient({});
const MOONPAY_BUY_URL = 'https://buy.moonpay.com';

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

  if (!user.polymarketSafeAddress) {
    return errorResponse(400, 'No Safe wallet found. Please re-authenticate.');
  }

  logger.info('Processing withdraw with permit', {
    walletAddress,
    safeWalletAddress: user.polymarketSafeAddress,
    amount,
    destination: walletAddress,
  });

  // Execute transfer using permit (platform wallet pays gas)
  const result = await transferUsdcWithPlatformGas(
    user.polymarketSafeAddress,
    walletAddress, // Destination is user's connected wallet
    amount
  );

  if (!result.success) {
    logger.error('Withdraw failed', {
      walletAddress,
      safeWalletAddress: user.polymarketSafeAddress,
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

/**
 * GET /wallet/moonpay-url - Get signed MoonPay widget URL
 *
 * Returns a signed MoonPay URL for buying USDC on Polygon.
 * The URL includes the wallet address and is signed with HMAC-SHA256.
 *
 * Query params:
 * - walletAddress: Destination wallet address for purchased USDC
 */
async function handleMoonpayUrl(
  queryParams: Record<string, string | undefined> | null
): Promise<APIGatewayProxyResult> {
  const walletAddress = queryParams?.walletAddress;

  if (!walletAddress || !isValidAddress(walletAddress)) {
    return errorResponse(400, 'Invalid wallet address');
  }

  // Get MoonPay credentials from Secrets Manager
  const moonpaySecretArn = process.env.MOONPAY_SECRET_ARN;
  if (!moonpaySecretArn) {
    logger.error('MOONPAY_SECRET_ARN not configured');
    return errorResponse(500, 'MoonPay not configured');
  }

  let moonpayCredentials: { publishableKey: string; secretKey: string };
  try {
    const secretResponse = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: moonpaySecretArn })
    );
    moonpayCredentials = JSON.parse(secretResponse.SecretString || '{}');
  } catch (err) {
    logger.error('Failed to get MoonPay credentials', { error: err });
    return errorResponse(500, 'Failed to get MoonPay credentials');
  }

  if (!moonpayCredentials.publishableKey || !moonpayCredentials.secretKey) {
    logger.error('MoonPay credentials incomplete');
    return errorResponse(500, 'MoonPay credentials incomplete');
  }

  // Build the query string for MoonPay
  // - currencyCode: usdc_polygon for USDC on Polygon
  // - walletAddress: destination for purchased USDC
  const params = new URLSearchParams({
    apiKey: moonpayCredentials.publishableKey,
    currencyCode: 'usdc_polygon',
    walletAddress,
  });

  const queryString = `?${params.toString()}`;

  // Sign the query string with HMAC-SHA256
  const signature = createHmac('sha256', moonpayCredentials.secretKey)
    .update(queryString)
    .digest('base64');

  // Build the final signed URL
  const signedUrl = `${MOONPAY_BUY_URL}${queryString}&signature=${encodeURIComponent(signature)}`;

  logger.info('Generated MoonPay URL', { walletAddress });

  return successResponse({ url: signedUrl });
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

    // GET /wallet/moonpay-url
    if (method === 'GET' && path.endsWith('/moonpay-url')) {
      return handleMoonpayUrl(event.queryStringParameters);
    }

    return errorResponse(404, 'Not found');
  } catch (error) {
    logger.errorWithStack('Wallet handler error', error);
    return errorResponse(500, 'Internal server error');
  }
}
