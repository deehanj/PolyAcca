/**
 * Users Lambda - User profile and credential management
 *
 * Endpoints:
 * - GET /users/me - Get current user profile
 * - PUT /users/me - Update user profile
 * - PUT /users/me/credentials - Set Polymarket L2 credentials
 * - DELETE /users/me/credentials - Remove Polymarket credentials
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  getUser,
  createUser,
  getUserCreds,
  saveUserCreds,
  deleteUserCreds,
  keys,
} from '../../shared/dynamo-client';
import { encryptCredentials } from '../../shared/polymarket-client';
import type {
  ApiResponse,
  UserProfile,
  UpdateProfileRequest,
  SetCredentialsRequest,
  UserCredsEntity,
} from '../../shared/types';
import { docClient } from '../../shared/dynamo-client';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.TABLE_NAME!;

/**
 * Extract wallet address from authorizer context
 */
function getWalletAddress(event: APIGatewayProxyEvent): string | null {
  return event.requestContext.authorizer?.walletAddress || null;
}

/**
 * GET /users/me - Get current user profile
 */
async function getProfile(walletAddress: string): Promise<APIGatewayProxyResult> {
  let user = await getUser(walletAddress);

  // Create user if doesn't exist (shouldn't happen if auth worked)
  if (!user) {
    user = await createUser(walletAddress);
  }

  const profile: UserProfile = {
    walletAddress: user.walletAddress,
    displayName: user.displayName,
    hasCredentials: user.hasCredentials,
    createdAt: user.createdAt,
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ success: true, data: profile } as ApiResponse<UserProfile>),
  };
}

/**
 * PUT /users/me - Update user profile
 */
async function updateProfile(
  walletAddress: string,
  body: string | null
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: 'Request body required' } as ApiResponse),
    };
  }

  const request: UpdateProfileRequest = JSON.parse(body);
  const { PK, SK } = keys.user(walletAddress);

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: 'SET displayName = :name, updatedAt = :now',
      ExpressionAttributeValues: {
        ':name': request.displayName,
        ':now': new Date().toISOString(),
      },
    })
  );

  return getProfile(walletAddress);
}

/**
 * PUT /users/me/credentials - Set Polymarket L2 credentials
 */
async function setCredentials(
  walletAddress: string,
  body: string | null
): Promise<APIGatewayProxyResult> {
  if (!body) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: false, error: 'Request body required' } as ApiResponse),
    };
  }

  const request: SetCredentialsRequest = JSON.parse(body);

  // Validate required fields
  if (!request.apiKey || !request.apiSecret || !request.passphrase) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: false,
        error: 'apiKey, apiSecret, and passphrase are required',
      } as ApiResponse),
    };
  }

  // Encrypt credentials
  const encrypted = await encryptCredentials({
    apiKey: request.apiKey,
    apiSecret: request.apiSecret,
    passphrase: request.passphrase,
    signatureType: request.signatureType ?? 'EOA',
  });

  const now = new Date().toISOString();
  const { PK, SK } = keys.userCreds(walletAddress);

  const credsEntity: UserCredsEntity = {
    PK,
    SK,
    entityType: 'USER_CREDS',
    walletAddress: walletAddress.toLowerCase(),
    encryptedApiKey: encrypted.encryptedApiKey,
    encryptedApiSecret: encrypted.encryptedApiSecret,
    encryptedPassphrase: encrypted.encryptedPassphrase,
    signatureType: request.signatureType ?? 'EOA',
    createdAt: now,
    updatedAt: now,
  };

  await saveUserCreds(credsEntity);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      success: true,
      data: { message: 'Credentials saved successfully' },
    } as ApiResponse),
  };
}

/**
 * DELETE /users/me/credentials - Remove Polymarket credentials
 */
async function removeCredentials(walletAddress: string): Promise<APIGatewayProxyResult> {
  await deleteUserCreds(walletAddress);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({
      success: true,
      data: { message: 'Credentials removed successfully' },
    } as ApiResponse),
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    // Get wallet address from authorizer
    const walletAddress = getWalletAddress(event);
    if (!walletAddress) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Unauthorized' } as ApiResponse),
      };
    }

    const method = event.httpMethod;
    const path = event.path;

    // Route handling
    if (path.endsWith('/credentials')) {
      if (method === 'PUT') {
        return setCredentials(walletAddress, event.body);
      } else if (method === 'DELETE') {
        return removeCredentials(walletAddress);
      }
    } else if (path.endsWith('/me')) {
      if (method === 'GET') {
        return getProfile(walletAddress);
      } else if (method === 'PUT') {
        return updateProfile(walletAddress, event.body);
      }
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ success: false, error: 'Not found' } as ApiResponse),
    };
  } catch (error) {
    console.error('Users handler error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Internal server error' } as ApiResponse),
    };
  }
}
