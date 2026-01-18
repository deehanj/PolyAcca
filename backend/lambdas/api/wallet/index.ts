/**
 * Wallet Lambda - Embedded wallet operations
 *
 * Endpoints:
 * - POST /wallet/withdraw - Withdraw USDC to connected wallet (requires fresh signature)
 *
 * Security: Uses signature-based auth (not JWT) for sensitive operations.
 * User must sign a message containing the exact withdraw amount and a fresh nonce.
 *
 * Gas Funding: Before executing a withdrawal, checks if the embedded wallet has
 * sufficient POL for gas. If not, funds it from the platform wallet.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ethers } from 'ethers';
import { getNonce, deleteNonce, getUser } from '../../shared/dynamo-client';
import { createSignerWithProvider } from '../../shared/turnkey-client';
import { buildWithdrawMessage, isValidAddress } from '../../shared/auth-utils';
import { errorResponse, successResponse } from '../../shared/api-utils';
import { createLogger } from '../../shared/logger';
import { fundWalletWithGas } from '../../shared/gas-funder';
import { requireEnvVar } from '../../utils/envVars';
import type { WithdrawRequest, WithdrawResponse } from '../../shared/types';

const logger = createLogger('wallet');

// Polygon configuration
const POLYGON_RPC_URL = 'https://polygon-rpc.com';
const POLYGON_CHAIN_ID = 137;
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e on Polygon
const USDC_DECIMALS = 6;

// ERC20 ABI (only transfer function)
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

/**
 * POST /wallet/withdraw - Withdraw USDC to connected wallet
 *
 * Requires signature-based auth:
 * 1. Frontend calls /auth/nonce to get a fresh nonce
 * 2. User signs message: "Withdraw {amount} USDC from PolyAcca\n\nNonce: {nonce}"
 * 3. Frontend calls this endpoint with amount, walletAddress, and signature
 * 4. Backend verifies signature and executes transfer
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
    recoveredAddress = ethers.verifyMessage(message, signature);
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

  logger.info('Processing withdraw', {
    walletAddress,
    embeddedWalletAddress: user.embeddedWalletAddress,
    amount,
    destination: walletAddress,
  });

  try {
    // Create provider for Polygon
    const provider = new ethers.JsonRpcProvider(POLYGON_RPC_URL, POLYGON_CHAIN_ID);

    // Check if embedded wallet needs gas funding
    const embeddedBalance = await provider.getBalance(user.embeddedWalletAddress);
    const minGasBalance = ethers.parseEther('0.01'); // Need at least 0.01 POL for gas

    if (embeddedBalance < minGasBalance) {
      logger.info('Embedded wallet needs gas funding', {
        embeddedWalletAddress: user.embeddedWalletAddress,
        currentBalance: ethers.formatEther(embeddedBalance),
      });

      const platformWalletAddress = requireEnvVar('PLATFORM_WALLET_ADDRESS');
      const gasTxHash = await fundWalletWithGas(platformWalletAddress, user.embeddedWalletAddress);

      if (gasTxHash) {
        logger.info('Funded embedded wallet with gas', {
          embeddedWalletAddress: user.embeddedWalletAddress,
          gasTxHash,
        });
      } else {
        logger.warn('Gas funding failed or was skipped', {
          embeddedWalletAddress: user.embeddedWalletAddress,
        });
        return errorResponse(500, 'Failed to fund wallet for gas. Please try again.');
      }
    }

    // Create signer for embedded wallet
    const signer = await createSignerWithProvider(user.embeddedWalletAddress, provider);

    // Create USDC contract instance
    const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, signer);

    // Check balance
    const balance = await usdcContract.balanceOf(user.embeddedWalletAddress);
    const amountWei = ethers.parseUnits(amount, USDC_DECIMALS);

    if (balance < amountWei) {
      const balanceFormatted = ethers.formatUnits(balance, USDC_DECIMALS);
      return errorResponse(400, `Insufficient balance. Available: ${balanceFormatted} USDC`);
    }

    // Execute transfer to connected wallet
    const tx = await usdcContract.transfer(walletAddress, amountWei);

    logger.info('Withdraw transaction sent', {
      txHash: tx.hash,
      walletAddress,
      amount,
    });

    // Wait for confirmation
    const receipt = await tx.wait(1);

    logger.info('Withdraw transaction confirmed', {
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber,
      gasUsed: receipt?.gasUsed.toString(),
    });

    const response: WithdrawResponse = {
      txHash: receipt?.hash ?? '',
      amount,
      destination: walletAddress,
    };

    return successResponse(response);
  } catch (error) {
    logger.errorWithStack('Withdraw failed', error, {
      walletAddress,
      embeddedWalletAddress: user.embeddedWalletAddress,
      amount,
    });

    // Check for specific error types
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('insufficient funds for gas')) {
      return errorResponse(400, 'Embedded wallet has insufficient POL for gas fees');
    }

    return errorResponse(500, 'Withdraw failed. Please try again.');
  }
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
