/**
 * Safe Wallet Client for Polymarket Builder Program
 *
 * Handles deployment and management of Safe wallets via Polymarket's gasless Builder Program.
 * Each user gets a Safe wallet that can execute trades without paying gas fees.
 */

import { RelayClient } from '@polymarket/builder-relayer-client';
import { createWalletClient, http, type WalletClient } from 'viem';
import { polygon } from 'viem/chains';
import { createLogger } from './logger';
import { requireEnvVar } from '../utils/envVars';
import type { Signer } from 'ethers';

const logger = createLogger('safe-wallet-client');

// Environment variables
const BUILDER_API_KEY = requireEnvVar('BUILDER_API_KEY');
const BUILDER_API_SECRET = requireEnvVar('BUILDER_API_SECRET');
const BUILDER_API_PASSPHRASE = requireEnvVar('BUILDER_API_PASSPHRASE');

// Polymarket Builder endpoints
const BUILDER_RELAYER_URL = 'https://relayer-v2.polymarket.com';

// Safe deployment configuration
const SAFE_CONFIG = {
  threshold: 1, // Single signature required (from EOA)
  saltNonce: undefined as string | undefined, // Will be generated per user
};

/**
 * Result from Safe wallet deployment
 */
export interface DeploySafeResult {
  safeAddress: string;
  deployed: boolean; // false if already existed
  transactionHash?: string;
}

/**
 * Generate deterministic salt for Safe deployment
 * This ensures same user always gets same Safe address
 */
function generateSafeNonce(walletAddress: string): string {
  // Use wallet address hash as deterministic salt
  // This ensures idempotent Safe addresses per user
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256')
    .update(`polyacca-safe-${walletAddress.toLowerCase()}`)
    .digest('hex');

  // Use first 16 chars of hash as salt (8 bytes hex)
  return '0x' + hash.substring(0, 16);
}

/**
 * Convert ethers Signer to viem WalletClient
 */
async function signerToWalletClient(signer: Signer): Promise<WalletClient> {
  const address = await signer.getAddress();

  // Create a basic viem wallet client that delegates signing to ethers signer
  const walletClient = createWalletClient({
    account: {
      address: address as `0x${string}`,
      async signMessage({ message }: { message: string | { raw: Uint8Array | `0x${string}` } }) {
        if (typeof message === 'string') {
          return await signer.signMessage(message) as `0x${string}`;
        }
        // Handle raw message
        const raw = message.raw;
        const messageBytes = typeof raw === 'string'
          ? raw
          : '0x' + Buffer.from(raw).toString('hex');
        return await signer.signMessage(messageBytes) as `0x${string}`;
      },
      async signTypedData(typedData: any) {
        const { domain, types, primaryType, message } = typedData;
        // Remove EIP712Domain from types as ethers handles it internally
        const { EIP712Domain, ...typesWithoutDomain } = types;
        return await signer._signTypedData(domain, typesWithoutDomain, message) as `0x${string}`;
      },
      async signTransaction() {
        throw new Error('Transaction signing not supported for Safe deployment');
      },
    } as any,
    chain: polygon,
    transport: http('https://polygon-rpc.com'),
  });

  return walletClient;
}

/**
 * Create HMAC signature for Builder API authentication
 */
function buildHmacSignature(
  secret: string,
  timestamp: number,
  method: string,
  requestPath: string,
  body: string = ''
): string {
  const crypto = require('crypto');
  const message = `${timestamp}${method}${requestPath}${body}`;
  const base64Secret = Buffer.from(secret, 'base64');

  return crypto
    .createHmac('sha256', base64Secret)
    .update(message)
    .digest('base64');
}

/**
 * Deploy a Safe wallet for a user via Polymarket Builder Program
 *
 * @param userWalletAddress - User's MetaMask wallet address (for deterministic salt)
 * @param eoaSigner - Signer for the embedded wallet (EOA that will control the Safe)
 * @returns Safe address and deployment status
 */
export async function deploySafeWallet(
  userWalletAddress: string,
  eoaSigner: Signer
): Promise<DeploySafeResult> {
  logger.info('Deploying Safe wallet for user', { userWalletAddress });

  try {
    // Convert ethers signer to viem wallet client
    const walletClient = await signerToWalletClient(eoaSigner);
    const eoaAddress = await eoaSigner.getAddress();

    // Initialize Polymarket Relay Client
    const relayClient = new RelayClient(
      BUILDER_RELAYER_URL,
      137, // Polygon chain ID
      walletClient,
      {
        getAuthHeaders: (method: string, path: string, body?: string) => {
          const timestamp = Math.floor(Date.now() / 1000);
          const signature = buildHmacSignature(
            BUILDER_API_SECRET,
            timestamp,
            method,
            path,
            body
          );

          return {
            'POLY-BUILDER-API-KEY': BUILDER_API_KEY,
            'POLY-BUILDER-SIGNATURE': signature,
            'POLY-BUILDER-TIMESTAMP': timestamp.toString(),
            'POLY-BUILDER-PASSPHRASE': BUILDER_API_PASSPHRASE,
          };
        },
      }
    );

    // Generate deterministic salt based on user's wallet
    const salt = generateSafeNonce(userWalletAddress);

    // Check if Safe already exists (predict address)
    const predictedAddress = await relayClient.predictSafeAddress(
      [eoaAddress], // owners
      SAFE_CONFIG.threshold,
      salt
    );

    logger.debug('Predicted Safe address', {
      userWalletAddress,
      predictedAddress,
      eoaOwner: eoaAddress,
      salt
    });

    // Check if Safe is already deployed
    const isDeployed = await relayClient.isSafeDeployed(predictedAddress);

    if (isDeployed) {
      logger.info('Safe wallet already deployed', {
        userWalletAddress,
        safeAddress: predictedAddress
      });

      return {
        safeAddress: predictedAddress,
        deployed: false, // Indicates it was already deployed
      };
    }

    // Deploy the Safe
    logger.info('Deploying new Safe wallet', {
      userWalletAddress,
      predictedAddress
    });

    const deploymentResult = await relayClient.createSafe(
      [eoaAddress], // owners
      SAFE_CONFIG.threshold,
      salt
    );

    // The RelayClient should return the transaction hash
    const transactionHash = deploymentResult.transactionHash || deploymentResult.txHash;

    logger.info('Safe wallet deployed successfully', {
      userWalletAddress,
      safeAddress: predictedAddress,
      transactionHash,
    });

    return {
      safeAddress: predictedAddress,
      deployed: true,
      transactionHash,
    };

  } catch (error) {
    logger.errorWithStack('Failed to deploy Safe wallet', error, { userWalletAddress });
    throw error;
  }
}

/**
 * Verify Safe wallet exists and is accessible
 *
 * @param safeAddress - Address of the Safe wallet
 * @param eoaSigner - Signer that should be owner of the Safe
 */
export async function verifySafeAccess(
  safeAddress: string,
  eoaSigner: Signer
): Promise<boolean> {
  try {
    const walletClient = await signerToWalletClient(eoaSigner);

    const relayClient = new RelayClient(
      BUILDER_RELAYER_URL,
      137,
      walletClient
    );

    // Check if Safe exists
    const isDeployed = await relayClient.isSafeDeployed(safeAddress);

    if (!isDeployed) {
      logger.warn('Safe not deployed', { safeAddress });
      return false;
    }

    // Verify EOA is owner
    const eoaAddress = await eoaSigner.getAddress();
    const isOwner = await relayClient.isSafeOwner(safeAddress, eoaAddress);

    if (!isOwner) {
      logger.warn('EOA is not Safe owner', { safeAddress, eoaAddress });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('Safe access verification failed', { safeAddress, error });
    return false;
  }
}

/**
 * Get Safe wallet info
 */
export async function getSafeInfo(safeAddress: string): Promise<{
  owners: string[];
  threshold: number;
  nonce: number;
} | null> {
  try {
    // This would require additional Safe SDK integration
    // For now, return null as placeholder
    logger.debug('Getting Safe info', { safeAddress });

    // TODO: Implement using Safe SDK if needed
    return null;
  } catch (error) {
    logger.warn('Failed to get Safe info', { safeAddress, error });
    return null;
  }
}