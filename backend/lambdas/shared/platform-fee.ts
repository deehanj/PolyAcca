/**
 * Platform Fee Collection
 *
 * Transfers a percentage of profits from winning accumulator positions
 * to the commission wallet as a fee.
 *
 * Uses EIP-2612 permit so the platform wallet pays gas fees,
 * not the user's embedded wallet.
 */

import { createLogger } from './logger';
import { optionalEnvVar } from '../utils/envVars';
import { toMicroUsdc, fromMicroUsdc, calculatePercentage, subtractMicro, isPositive } from './usdc-math';
import { transferUsdcWithPlatformGas } from './usdc-permit';

const logger = createLogger('platform-fee');

// Platform fee: 2% of profit
const PLATFORM_FEE_PERCENT_NUMERATOR = 2n;
const PLATFORM_FEE_PERCENT_DENOMINATOR = 100n;

// Minimum fee amount to bother collecting (avoid dust transactions)
// 0.01 USDC = 10000 micro-USDC
const MIN_FEE_MICRO = 10000n;

export interface PlatformFeeResult {
  success: boolean;
  txHash?: string;
  feeAmount: string;
  error?: string;
}

/**
 * Get the commission wallet address from environment
 */
function getCommissionWalletAddress(): string | null {
  return optionalEnvVar('COMMISSION_WALLET_ADDRESS') || null;
}

/**
 * Calculate the platform fee from a winning position
 * Uses integer arithmetic (via usdc-math) to avoid floating point precision issues
 *
 * @param payout - The total payout amount (as string, e.g., "150.00")
 * @param originalStake - The original stake amount (as string, e.g., "10.00")
 * @returns The fee amount as a string, or null if no fee applicable
 */
export function calculatePlatformFee(payout: string, originalStake: string): string | null {
  // Convert to micro-USDC for precise integer arithmetic
  const payoutMicro = toMicroUsdc(payout);
  const stakeMicro = toMicroUsdc(originalStake);

  // Calculate profit in micro-USDC
  const profitMicro = subtractMicro(payoutMicro, stakeMicro);

  // No fee if no profit (shouldn't happen for a win, but be safe)
  if (!isPositive(profitMicro)) {
    return null;
  }

  // Calculate fee: 2% of profit
  const feeMicro = calculatePercentage(profitMicro, PLATFORM_FEE_PERCENT_NUMERATOR, PLATFORM_FEE_PERCENT_DENOMINATOR);

  // Skip if fee is too small
  if (feeMicro < MIN_FEE_MICRO) {
    logger.debug('Fee too small, skipping collection', {
      feeMicro: feeMicro.toString(),
      minFeeMicro: MIN_FEE_MICRO.toString(),
    });
    return null;
  }

  return fromMicroUsdc(feeMicro);
}

/**
 * Transfer platform fee from user's embedded wallet to commission wallet
 *
 * Uses EIP-2612 permit so the platform wallet pays gas fees.
 * Three wallets involved:
 * 1. Embedded user wallet - signs permit, source of USDC
 * 2. Platform wallet - submits tx, pays gas in POL
 * 3. Commission wallet - receives the fee
 *
 * @param embeddedWalletAddress - The user's embedded wallet address (source)
 * @param feeAmount - The fee amount to transfer (as string, e.g., "3.00")
 * @returns Result with success status and tx hash if successful
 */
export async function transferPlatformFee(
  embeddedWalletAddress: string,
  feeAmount: string
): Promise<PlatformFeeResult> {
  const commissionWalletAddress = getCommissionWalletAddress();

  if (!commissionWalletAddress) {
    logger.warn('COMMISSION_WALLET_ADDRESS not configured, skipping fee collection');
    return {
      success: false,
      feeAmount,
      error: 'Commission wallet not configured',
    };
  }

  logger.info('Collecting platform fee with permit', {
    embeddedWalletAddress,
    commissionWalletAddress,
    feeAmount,
  });

  // Use permit-based transfer (platform wallet pays gas)
  const result = await transferUsdcWithPlatformGas(
    embeddedWalletAddress,
    commissionWalletAddress,
    feeAmount
  );

  if (result.success) {
    logger.info('Platform fee collected successfully', {
      txHash: result.txHash,
      embeddedWalletAddress,
      commissionWalletAddress,
      feeAmount,
    });

    return {
      success: true,
      txHash: result.txHash,
      feeAmount,
    };
  } else {
    logger.warn('Platform fee collection failed', {
      embeddedWalletAddress,
      feeAmount,
      error: result.error,
    });

    return {
      success: false,
      feeAmount,
      error: result.error,
    };
  }
}

/**
 * Collect platform fee from a winning accumulator
 *
 * Combines fee calculation and transfer into a single operation.
 *
 * @param embeddedWalletAddress - The user's embedded wallet address
 * @param payout - The total payout amount
 * @param originalStake - The original stake amount
 * @returns Result with fee details
 */
export async function collectPlatformFee(
  embeddedWalletAddress: string,
  payout: string,
  originalStake: string
): Promise<PlatformFeeResult> {
  // Calculate the fee
  const feeAmount = calculatePlatformFee(payout, originalStake);

  if (!feeAmount) {
    logger.info('No platform fee to collect', {
      embeddedWalletAddress,
      payout,
      originalStake,
    });
    return {
      success: true,
      feeAmount: '0',
    };
  }

  logger.info('Collecting platform fee from winning acca', {
    embeddedWalletAddress,
    payout,
    originalStake,
    feeAmount,
    feePercentage: '2%',
  });

  // Transfer the fee using permit (platform pays gas)
  return transferPlatformFee(embeddedWalletAddress, feeAmount);
}
