/**
 * Credentials Client
 *
 * Separate DynamoDB client for accessing the credentials table.
 * This table stores Polymarket API credentials and is only accessible
 * by specific lambdas that need to read or write credentials.
 *
 * Security: Only lambdas with CREDENTIALS_TABLE_NAME env var can access this.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { UserCredsEntity } from './types';
import { requireEnvVar } from '../utils/envVars';

// Environment variables - validated at module load time
// This will throw if the lambda doesn't have access to the credentials table
const CREDENTIALS_TABLE_NAME = requireEnvVar('CREDENTIALS_TABLE_NAME');

// Also need the main table for updating hasCredentials flag
const TABLE_NAME = requireEnvVar('TABLE_NAME');

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
  userCreds: (walletAddress: string) => ({
    PK: `USER#${walletAddress.toLowerCase()}`,
    SK: 'CREDS#polymarket',
  }),
};

// =============================================================================
// User Credentials Operations
// =============================================================================

/**
 * Get user's Polymarket credentials from the credentials table
 */
export async function getUserCreds(walletAddress: string): Promise<UserCredsEntity | null> {
  const { PK, SK } = credentialsKeys.userCreds(walletAddress);

  const result = await credentialsDocClient.send(
    new GetCommand({
      TableName: CREDENTIALS_TABLE_NAME,
      Key: { PK, SK },
    })
  );

  return (result.Item as UserCredsEntity) || null;
}

/**
 * Save user's Polymarket credentials to the credentials table
 * Also updates hasCredentials flag in the main table
 */
export async function saveUserCreds(creds: UserCredsEntity): Promise<void> {
  const { PK, SK } = credentialsKeys.userCreds(creds.walletAddress);

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
      TableName: TABLE_NAME,
      Key: { PK: userPK, SK: 'PROFILE' },
      UpdateExpression: 'SET hasCredentials = :val, updatedAt = :now',
      ExpressionAttributeValues: {
        ':val': true,
        ':now': new Date().toISOString(),
      },
    })
  );
}

/**
 * Delete user's Polymarket credentials from the credentials table
 * Also updates hasCredentials flag in the main table
 */
export async function deleteUserCreds(walletAddress: string): Promise<void> {
  const { PK, SK } = credentialsKeys.userCreds(walletAddress);

  // Delete from credentials table
  await credentialsDocClient.send(
    new DeleteCommand({
      TableName: CREDENTIALS_TABLE_NAME,
      Key: { PK, SK },
    })
  );

  // Update user's hasCredentials flag in main table
  const userPK = `USER#${walletAddress.toLowerCase()}`;
  await credentialsDocClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: userPK, SK: 'PROFILE' },
      UpdateExpression: 'SET hasCredentials = :val, updatedAt = :now',
      ExpressionAttributeValues: {
        ':val': false,
        ':now': new Date().toISOString(),
      },
    })
  );
}
