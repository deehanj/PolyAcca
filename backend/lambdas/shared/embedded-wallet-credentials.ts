/**
 * Embedded Wallet Credentials
 *
 * Manages cached Polymarket API credentials derived from Turnkey embedded wallets.
 * Credentials are derived once on first bet execution and cached for reuse.
 *
 * Security: Only lambdas with CREDENTIALS_TABLE_NAME env var can access this.
 * The table uses KMS encryption (KMS_KEY_ARN) for field-level encryption.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { EmbeddedWalletCredentialsEntity } from './types';
import { requireEnvVar } from '../utils/envVars';

// Environment variables - validated at module load time
// This will throw if the lambda doesn't have access to the credentials table
const CREDENTIALS_TABLE_NAME = requireEnvVar('CREDENTIALS_TABLE_NAME');

// Also need the main table for updating hasCredentials flag
const MONOTABLE_NAME = requireEnvVar('MONOTABLE_NAME');

// Initialize DynamoDB client for credentials table
const client = new DynamoDBClient({});
const credentialsDocClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// =============================================================================
// Key Builders
// =============================================================================

const credentialsKeys = {
  embeddedWalletCreds: (walletAddress: string) => ({
    PK: `USER#${walletAddress.toLowerCase()}`,
    SK: 'CREDS#polymarket',
  }),
};

// =============================================================================
// Embedded Wallet Credentials Operations
// =============================================================================

/**
 * Get cached Polymarket credentials for a user's embedded wallet
 */
export async function getEmbeddedWalletCredentials(
  walletAddress: string
): Promise<EmbeddedWalletCredentialsEntity | null> {
  const { PK, SK } = credentialsKeys.embeddedWalletCreds(walletAddress);

  const result = await credentialsDocClient.send(
    new GetCommand({
      TableName: CREDENTIALS_TABLE_NAME,
      Key: { PK, SK },
    })
  );

  return (result.Item as EmbeddedWalletCredentialsEntity) || null;
}

/**
 * Input type for caching credentials (PK/SK are built internally)
 */
export type EmbeddedWalletCredentialsInput = Omit<EmbeddedWalletCredentialsEntity, 'PK' | 'SK'>;

/**
 * Cache derived Polymarket credentials for a user's embedded wallet
 * Also updates hasCredentials flag in the main table
 */
export async function cacheEmbeddedWalletCredentials(
  creds: EmbeddedWalletCredentialsInput
): Promise<void> {
  const { PK, SK } = credentialsKeys.embeddedWalletCreds(creds.walletAddress);

  // Save to credentials table
  await credentialsDocClient.send(
    new PutCommand({
      TableName: CREDENTIALS_TABLE_NAME,
      Item: {
        ...creds,
        PK,
        SK,
      },
    })
  );

  // Update user's hasCredentials flag in main table
  const userPK = `USER#${creds.walletAddress.toLowerCase()}`;
  await credentialsDocClient.send(
    new UpdateCommand({
      TableName: MONOTABLE_NAME,
      Key: { PK: userPK, SK: 'PROFILE' },
      UpdateExpression: 'SET hasCredentials = :val, updatedAt = :now',
      ExpressionAttributeValues: {
        ':val': true,
        ':now': new Date().toISOString(),
      },
    })
  );
}
