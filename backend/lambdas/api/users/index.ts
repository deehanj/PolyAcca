/**
 * Users Lambda - User profile management
 *
 * Endpoints:
 * - GET /users/me - Get current user profile
 * - PUT /users/me - Update user profile
 *
 * Note: Polymarket credentials are now derived automatically via embedded wallets.
 * The bet-executor derives and caches credentials on first bet execution.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getUser, keys, docClient } from '../../shared/dynamo-client';
import { isAdminWallet } from '../../shared/admin-config';
import type { ApiResponse, UserProfile, UpdateProfileRequest } from '../../shared/types';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireEnvVar } from '../../utils/envVars';

// Environment variables - validated at module load time
const MONOTABLE_NAME = requireEnvVar('MONOTABLE_NAME');

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
  const user = await getUser(walletAddress);

  // User should exist from auth flow - if not, require re-authentication
  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: false,
        error: 'User not found. Please re-authenticate.',
      } as ApiResponse),
    };
  }

  const profile: UserProfile = {
    walletAddress: user.walletAddress,
    displayName: user.displayName,
    hasCredentials: user.hasCredentials,
    createdAt: user.createdAt,
    admin: isAdminWallet(walletAddress) || undefined,
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
      TableName: MONOTABLE_NAME,
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
    if (path.endsWith('/me')) {
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
