/**
 * Safe Wallet Client for Polymarket Builder Program
 *
 * Handles deployment and management of Safe wallets via Polymarket's gasless Builder Program.
 * Each user gets a Safe wallet that can execute trades without paying gas fees.
 */

import { RelayClient } from '@polymarket/builder-relayer-client';
// Use BuilderConfig from builder-relayer-client's dependency to avoid version mismatch
import { BuilderConfig } from '@polymarket/builder-relayer-client/node_modules/@polymarket/builder-signing-sdk';
// @ts-ignore - deriveSafe exists in JS but not in TS definitions
import { deriveSafe } from '@polymarket/builder-relayer-client/dist/builder/derive';
// @ts-ignore - getContractConfig exists in JS but not in TS definitions
import { getContractConfig } from '@polymarket/builder-relayer-client/dist/config';
import { createWalletClient, http, type WalletClient } from 'viem';
import { polygon } from 'viem/chains';
import { createLogger } from './logger';
import { requireEnvVar } from '../utils/envVars';
import type { Signer } from 'ethers';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const logger = createLogger('safe-wallet-client');

// Environment variables
const BUILDER_SECRET_ARN = requireEnvVar('BUILDER_SECRET_ARN');

// Polymarket Builder endpoints
const BUILDER_RELAYER_URL = 'https://relayer-v2.polymarket.com';

// Secrets Manager client
const secretsClient = new SecretsManagerClient({});
let cachedBuilderCredentials: {
  key: string;
  secret: string;
  passphrase: string;
} | null = null;

/**
 * Get Builder credentials from Secrets Manager
 */
async function getBuilderCredentials() {
  if (cachedBuilderCredentials) {
    return cachedBuilderCredentials;
  }

  logger.debug('Fetching Builder credentials from Secrets Manager');

  const response = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: BUILDER_SECRET_ARN,
    })
  );

  if (!response.SecretString) {
    throw new Error('Builder credentials not found in Secrets Manager');
  }

  const credentials = JSON.parse(response.SecretString);

  cachedBuilderCredentials = {
    key: credentials.BUILDER_API_KEY || credentials.key,
    secret: credentials.BUILDER_API_SECRET || credentials.secret,
    passphrase: credentials.BUILDER_API_PASSPHRASE || credentials.passphrase,
  };

  logger.debug('Builder credentials loaded from Secrets Manager');

  return cachedBuilderCredentials;
}

/**
 * Result from Safe wallet deployment
 */
export interface DeploySafeResult {
  safeAddress: string;
  deployed: boolean; // false if already existed
  transactionHash?: string;
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
        return await signer.signTypedData(domain, typesWithoutDomain, message) as `0x${string}`;
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

// buildHmacSignature function removed - now using BuilderConfig

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

    // Get Builder credentials from Secrets Manager
    const builderCreds = await getBuilderCredentials();

    // Initialize BuilderConfig with credentials
    const builderConfig = new BuilderConfig({
      localBuilderCreds: builderCreds,
    });

    // Initialize Polymarket Relay Client
    const relayClient = new RelayClient(
      BUILDER_RELAYER_URL,
      137, // Polygon chain ID
      walletClient,
      builderConfig
    ) as any; // Type assertion needed due to incomplete TypeScript definitions

    // Get contract config and derive Safe address
    const config = getContractConfig(137);
    const safeAddress = deriveSafe(eoaAddress, config.SafeContracts.SafeFactory);

    logger.debug('Derived Safe address', {
      userWalletAddress,
      safeAddress,
      eoaOwner: eoaAddress,
    });

    // Check if Safe is already deployed using getDeployed (exists in JS but not in TS types)
    let isDeployed = false;
    try {
      isDeployed = await relayClient.getDeployed(safeAddress);
    } catch (error) {
      // If getDeployed fails, assume not deployed
      logger.debug('getDeployed check failed, assuming not deployed', { error });
    }

    if (isDeployed) {
      logger.info('Safe wallet already deployed', {
        userWalletAddress,
        safeAddress
      });

      return {
        safeAddress,
        deployed: false, // Indicates it was already deployed
      };
    }

    // Deploy the Safe
    logger.info('Deploying new Safe wallet', {
      userWalletAddress,
      safeAddress
    });

    const deploymentResult = await relayClient.deploy();

    // The RelayClient should return the transaction hash
    const transactionHash = deploymentResult.transactionHash || deploymentResult.txHash;

    logger.info('Safe wallet deployed successfully', {
      userWalletAddress,
      safeAddress,
      transactionHash,
    });

    return {
      safeAddress,
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
    const eoaAddress = await eoaSigner.getAddress();

    // Get Builder credentials from Secrets Manager
    const builderCreds = await getBuilderCredentials();

    // Initialize BuilderConfig with credentials
    const builderConfig = new BuilderConfig({
      localBuilderCreds: builderCreds,
    });

    const relayClient = new RelayClient(
      BUILDER_RELAYER_URL,
      137,
      walletClient,
      builderConfig
    ) as any; // Type assertion needed

    // Check if Safe exists using getDeployed
    let isDeployed = false;
    try {
      isDeployed = await relayClient.getDeployed(safeAddress);
    } catch (error) {
      logger.debug('getDeployed check failed', { safeAddress, error });
      return false;
    }

    if (!isDeployed) {
      logger.warn('Safe not deployed', { safeAddress });
      return false;
    }

    // Derive expected Safe address for this EOA
    const config = getContractConfig(137);
    const expectedSafeAddress = deriveSafe(eoaAddress, config.SafeContracts.SafeFactory);

    // Verify this is the correct Safe for this EOA
    if (safeAddress.toLowerCase() !== expectedSafeAddress.toLowerCase()) {
      logger.warn('Safe address does not match expected address for EOA', {
        safeAddress,
        expectedSafeAddress,
        eoaAddress
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('Safe access verification failed', { safeAddress, error });
    return false;
  }
}

/**
 * Get derived Safe address for an EOA
 * This is deterministic - same EOA always gets same Safe address
 */
export async function getSafeAddressForEOA(eoaAddress: string): Promise<string> {
  const config = getContractConfig(137);
  return deriveSafe(eoaAddress, config.SafeContracts.SafeFactory);
}