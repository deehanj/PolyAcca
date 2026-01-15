/**
 * Admin WebSocket Authorizer
 *
 * Validates JWT token and checks admin wallet status before allowing connection.
 * Token is passed via query string: ?token=<jwt>
 */

import type { APIGatewayRequestAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { verifyJwt } from '../../shared/jwt';
import { isAdminWallet } from '../../shared/admin-config';

/**
 * Generate IAM policy for WebSocket API Gateway
 */
function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string>
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context,
  };
}

export async function handler(
  event: APIGatewayRequestAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> {
  console.log('Admin WebSocket authorizer invoked');

  try {
    // Get token from query string
    const token = event.queryStringParameters?.token;

    if (!token) {
      console.log('No token provided in query string');
      return generatePolicy('anonymous', 'Deny', event.methodArn);
    }

    // Verify JWT token
    let walletAddress: string;
    try {
      const payload = await verifyJwt(token);
      walletAddress = payload.sub;
    } catch (err) {
      console.log('Invalid token:', err);
      return generatePolicy('anonymous', 'Deny', event.methodArn);
    }

    // Check admin status
    if (!isAdminWallet(walletAddress)) {
      console.log('Not an admin wallet:', walletAddress);
      return generatePolicy(walletAddress, 'Deny', event.methodArn);
    }

    console.log('Admin authorized:', walletAddress);

    // Generate Allow policy with wallet address in context
    return generatePolicy(walletAddress, 'Allow', event.methodArn, {
      walletAddress,
    });
  } catch (error) {
    console.error('Admin authorization failed:', error);
    return generatePolicy('anonymous', 'Deny', event.methodArn);
  }
}
