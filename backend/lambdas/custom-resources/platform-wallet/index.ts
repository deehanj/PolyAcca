/**
 * Platform Wallet Custom Resource
 *
 * CloudFormation custom resource that creates a platform wallet via Turnkey.
 * This wallet is used to fund new user embedded wallets with POL for gas.
 *
 * On CREATE: Creates "PolyAcca-Platform" wallet, returns address
 * On UPDATE: Returns existing wallet address (no changes)
 * On DELETE: No-op (wallet persists in Turnkey)
 *
 * Note: When using CDK's cr.Provider, the handler should return data directly
 * rather than sending the response manually - the Provider framework handles that.
 */

import type { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';
import { TurnkeyClient } from '@turnkey/http';
import { ApiKeyStamper } from '@turnkey/api-key-stamper';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

// Environment variables
const TURNKEY_SECRET_ARN = process.env.TURNKEY_SECRET_ARN!;
const TURNKEY_ORGANIZATION_ID = process.env.TURNKEY_ORGANIZATION_ID!;

const TURNKEY_API_BASE_URL = 'https://api.turnkey.com';
const PLATFORM_WALLET_NAME = 'PolyAcca-Platform';

const secretsClient = new SecretsManagerClient({});

interface TurnkeyCredentials {
  apiPublicKey: string;
  apiPrivateKey: string;
}

/**
 * Load Turnkey API credentials from Secrets Manager
 */
async function getTurnkeyCredentials(): Promise<TurnkeyCredentials> {
  const response = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: TURNKEY_SECRET_ARN,
    })
  );

  if (!response.SecretString) {
    throw new Error('Turnkey secret is empty');
  }

  return JSON.parse(response.SecretString) as TurnkeyCredentials;
}

/**
 * Get initialized Turnkey client
 */
async function getTurnkeyClient(): Promise<TurnkeyClient> {
  const creds = await getTurnkeyCredentials();

  const stamper = new ApiKeyStamper({
    apiPublicKey: creds.apiPublicKey,
    apiPrivateKey: creds.apiPrivateKey,
  });

  return new TurnkeyClient({ baseUrl: TURNKEY_API_BASE_URL }, stamper);
}

/**
 * List existing wallets to check if platform wallet already exists
 */
async function findExistingPlatformWallet(
  client: TurnkeyClient
): Promise<string | null> {
  const response = await client.getWallets({
    organizationId: TURNKEY_ORGANIZATION_ID,
  });

  for (const wallet of response.wallets) {
    if (wallet.walletName === PLATFORM_WALLET_NAME) {
      // Get the wallet's address
      const accountsResponse = await client.getWalletAccounts({
        organizationId: TURNKEY_ORGANIZATION_ID,
        walletId: wallet.walletId,
      });

      if (accountsResponse.accounts.length > 0) {
        return accountsResponse.accounts[0].address;
      }
    }
  }

  return null;
}

/**
 * Create the platform wallet
 */
async function createPlatformWallet(client: TurnkeyClient): Promise<string> {
  console.log('Creating platform wallet via Turnkey');

  const response = await client.createWallet({
    organizationId: TURNKEY_ORGANIZATION_ID,
    type: 'ACTIVITY_TYPE_CREATE_WALLET',
    timestampMs: Date.now().toString(),
    parameters: {
      walletName: PLATFORM_WALLET_NAME,
      accounts: [
        {
          curve: 'CURVE_SECP256K1',
          pathFormat: 'PATH_FORMAT_BIP32',
          path: "m/44'/60'/0'/0/0",
          addressFormat: 'ADDRESS_FORMAT_ETHEREUM',
        },
      ],
    },
  });

  const result = response.activity.result.createWalletResult;
  if (!result) {
    throw new Error('Wallet creation failed: no result in response');
  }

  const walletAddress = result.addresses[0];
  console.log('Platform wallet created:', walletAddress);

  return walletAddress;
}

/**
 * Custom resource handler for CDK cr.Provider
 *
 * Returns data directly - the Provider framework handles the CloudFormation response.
 */
export async function handler(
  event: CdkCustomResourceEvent
): Promise<CdkCustomResourceResponse> {
  console.log('Platform wallet custom resource event:', JSON.stringify(event));

  const client = await getTurnkeyClient();

  if (event.RequestType === 'Delete') {
    // Don't delete the wallet - it persists in Turnkey
    // Return the existing physical resource ID
    return {
      PhysicalResourceId: event.PhysicalResourceId,
      Data: {
        WalletAddress: event.PhysicalResourceId,
      },
    };
  }

  // For Create and Update, check if wallet exists
  let walletAddress = await findExistingPlatformWallet(client);

  if (!walletAddress) {
    // Create new wallet
    walletAddress = await createPlatformWallet(client);
  } else {
    console.log('Platform wallet already exists:', walletAddress);
  }

  return {
    PhysicalResourceId: walletAddress,
    Data: {
      WalletAddress: walletAddress,
    },
  };
}
