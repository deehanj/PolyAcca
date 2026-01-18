/**
 * Gas Funder
 *
 * Sends POL from the platform wallet to new embedded wallets for gas.
 * Uses Turnkey to sign the transaction from the platform wallet.
 */

import { ethers } from 'ethers';
import { createSignerWithProvider } from './turnkey-client';
import { createLogger } from './logger';
import { optionalEnvVar } from '../utils/envVars';

const logger = createLogger('gas-funder');

// Polygon configuration
const POLYGON_RPC_URL = 'https://polygon-rpc.com';
const POLYGON_CHAIN_ID = 137;

// Default amount of POL to send to new wallets (0.1 POL)
// This covers approximately 50-100 simple transactions
const DEFAULT_GAS_FUNDING_AMOUNT = '0.1';

/**
 * Get the gas funding amount from environment or use default
 */
function getGasFundingAmount(): string {
  return optionalEnvVar('GAS_FUNDING_AMOUNT') || DEFAULT_GAS_FUNDING_AMOUNT;
}

/**
 * Fund a new embedded wallet with POL for gas
 *
 * @param platformWalletAddress - The platform wallet address that holds POL
 * @param destinationAddress - The new embedded wallet to fund
 * @returns Transaction hash if successful, null if skipped or failed
 */
export async function fundWalletWithGas(
  platformWalletAddress: string,
  destinationAddress: string
): Promise<string | null> {
  const fundingAmount = getGasFundingAmount();

  logger.info('Funding wallet with gas', {
    platformWalletAddress,
    destinationAddress,
    amount: fundingAmount,
  });

  try {
    // Create provider for Polygon
    const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC_URL, {
      name: 'polygon',
      chainId: POLYGON_CHAIN_ID,
    });

    // Check platform wallet balance first
    const platformBalance = await provider.getBalance(platformWalletAddress);
    const fundingAmountWei = ethers.utils.parseEther(fundingAmount);

    // Need some buffer for gas costs of the transfer itself
    const minRequired = fundingAmountWei.add(ethers.utils.parseEther('0.01'));

    if (platformBalance.lt(minRequired)) {
      logger.warn('Platform wallet has insufficient POL balance', {
        platformWalletAddress,
        balance: ethers.utils.formatEther(platformBalance),
        required: ethers.utils.formatEther(minRequired),
      });
      return null;
    }

    // Check if destination already has some POL (avoid double-funding)
    const destBalance = await provider.getBalance(destinationAddress);
    if (destBalance.gt(ethers.utils.parseEther('0.01'))) {
      logger.info('Destination wallet already has POL, skipping funding', {
        destinationAddress,
        balance: ethers.utils.formatEther(destBalance),
      });
      return null;
    }

    // Create signer for platform wallet
    const signer = await createSignerWithProvider(platformWalletAddress, provider);

    // Send POL to destination
    const tx = await signer.sendTransaction({
      to: destinationAddress,
      value: fundingAmountWei,
    });

    logger.info('Gas funding transaction sent', {
      txHash: tx.hash,
      destinationAddress,
      amount: fundingAmount,
    });

    // Wait for confirmation (1 block)
    const receipt = await tx.wait(1);

    logger.info('Gas funding transaction confirmed', {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });

    return receipt.transactionHash;
  } catch (error) {
    logger.errorWithStack('Failed to fund wallet with gas', error, {
      platformWalletAddress,
      destinationAddress,
    });
    // Don't throw - gas funding failure shouldn't block wallet creation
    return null;
  }
}
