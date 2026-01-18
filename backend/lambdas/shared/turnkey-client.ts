/**
 * Turnkey Embedded Wallet Client
 *
 * Manages embedded wallets for users using Turnkey's secure infrastructure.
 * Each user gets a dedicated wallet that PolyAcca can sign transactions with.
 */

import { TurnkeyClient } from '@turnkey/http';
import { ApiKeyStamper } from '@turnkey/api-key-stamper';
import { TurnkeySigner } from '@turnkey/ethers';
import { ethers } from 'ethers';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { createLogger } from './logger';
import { requireEnvVar } from '../utils/envVars';

const logger = createLogger('turnkey-client');

// Environment variables
const TURNKEY_SECRET_ARN = requireEnvVar('TURNKEY_SECRET_ARN');
const TURNKEY_ORGANIZATION_ID = requireEnvVar('TURNKEY_ORGANIZATION_ID');

// Turnkey API configuration
const TURNKEY_API_BASE_URL = 'https://api.turnkey.com';

// Polygon RPC for signing context
const POLYGON_RPC_URL = 'https://polygon-rpc.com';

// =============================================================================
// Types
// =============================================================================

export interface TurnkeyCredentials {
  apiPublicKey: string;
  apiPrivateKey: string;
}

export interface CreateWalletResult {
  walletId: string;
  walletAddress: string;
}

// =============================================================================
// Secrets Management
// =============================================================================

const secretsClient = new SecretsManagerClient({});
let cachedCredentials: TurnkeyCredentials | null = null;

/**
 * Load Turnkey API credentials from Secrets Manager (cached)
 */
async function getTurnkeyCredentials(): Promise<TurnkeyCredentials> {
  if (cachedCredentials) {
    return cachedCredentials;
  }

  logger.debug('Loading Turnkey credentials from Secrets Manager');

  const response = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: TURNKEY_SECRET_ARN,
    })
  );

  if (!response.SecretString) {
    throw new Error('Turnkey secret is empty');
  }

  cachedCredentials = JSON.parse(response.SecretString) as TurnkeyCredentials;
  return cachedCredentials;
}

// =============================================================================
// Turnkey Client
// =============================================================================

let cachedTurnkeyClient: TurnkeyClient | null = null;

/**
 * Get initialized Turnkey client (cached)
 */
async function getTurnkeyClient(): Promise<TurnkeyClient> {
  if (cachedTurnkeyClient) {
    return cachedTurnkeyClient;
  }

  const creds = await getTurnkeyCredentials();

  // Create API key stamper for signing requests
  const stamper = new ApiKeyStamper({
    apiPublicKey: creds.apiPublicKey,
    apiPrivateKey: creds.apiPrivateKey,
  });

  cachedTurnkeyClient = new TurnkeyClient(
    { baseUrl: TURNKEY_API_BASE_URL },
    stamper
  );

  return cachedTurnkeyClient;
}

// =============================================================================
// Wallet Operations
// =============================================================================

/**
 * Create a new embedded wallet for a user
 *
 * @param userIdentifier - Unique identifier for the user (e.g., MetaMask wallet address)
 * @returns The wallet ID and address
 */
export async function createWallet(userIdentifier: string): Promise<CreateWalletResult> {
  const client = await getTurnkeyClient();

  logger.info('Creating embedded wallet', { userIdentifier });

  try {
    // Create a new wallet with a single Ethereum account
    const response = await client.createWallet({
      organizationId: TURNKEY_ORGANIZATION_ID,
      type: 'ACTIVITY_TYPE_CREATE_WALLET',
      timestampMs: Date.now().toString(),
      parameters: {
        walletName: `PolyAcca-${userIdentifier}`,
        accounts: [
          {
            curve: 'CURVE_SECP256K1',
            pathFormat: 'PATH_FORMAT_BIP32',
            path: "m/44'/60'/0'/0/0", // Standard Ethereum derivation path
            addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
          },
        ],
      },
    });

    // Extract wallet info from the activity result
    const result = response.activity.result.createWalletResult;
    if (!result) {
      throw new Error('Wallet creation failed: no result in response');
    }

    const walletId = result.walletId;
    const walletAddress = result.addresses[0];

    logger.info('Embedded wallet created', {
      userIdentifier,
      walletId,
      walletAddress,
    });

    return { walletId, walletAddress };
  } catch (error) {
    logger.errorWithStack('Failed to create embedded wallet', error, { userIdentifier });
    throw error;
  }
}

/**
 * Get wallet addresses for a given wallet ID
 */
export async function getWalletAccounts(walletId: string): Promise<string[]> {
  const client = await getTurnkeyClient();

  const response = await client.getWalletAccounts({
    organizationId: TURNKEY_ORGANIZATION_ID,
    walletId,
  });

  return response.accounts.map((account: { address: string }) => account.address);
}

// =============================================================================
// Signer Creation
// =============================================================================

/**
 * Create an ethers Signer for a Turnkey wallet
 *
 * This signer can be used with the Polymarket CLOB client to sign orders.
 *
 * @param walletAddress - The Ethereum address of the Turnkey wallet
 * @returns An ethers-compatible Signer
 */
export async function createSigner(walletAddress: string): Promise<ethers.Signer> {
  const client = await getTurnkeyClient();

  logger.debug('Creating signer for wallet', { walletAddress });

  // Create a provider for Polygon (required for EIP-712 domain separator)
  const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC_URL);

  // Create the Turnkey signer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signer = new TurnkeySigner(
    {
      client: client as any,
      organizationId: TURNKEY_ORGANIZATION_ID,
      signWith: walletAddress,
    },
    provider
  );

  return signer as unknown as ethers.Signer;
}

/**
 * Create a connected signer with a specific provider
 */
export async function createSignerWithProvider(
  walletAddress: string,
  provider: ethers.providers.Provider
): Promise<ethers.Signer> {
  const client = await getTurnkeyClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signer = new TurnkeySigner(
    {
      client: client as any,
      organizationId: TURNKEY_ORGANIZATION_ID,
      signWith: walletAddress,
    },
    provider
  );

  return signer as unknown as ethers.Signer;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Verify a wallet exists and is accessible
 */
export async function verifyWalletAccess(walletId: string): Promise<boolean> {
  try {
    const accounts = await getWalletAccounts(walletId);
    return accounts.length > 0;
  } catch (error) {
    logger.warn('Wallet access verification failed', { walletId, error });
    return false;
  }
}
