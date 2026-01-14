/**
 * Lambda Authorizer - Validates JWT tokens for protected API routes
 *
 * Extracts the wallet address from the token and passes it to downstream Lambdas
 * via the authorizer context.
 */

import type {
  APIGatewayRequestAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from 'aws-lambda';
import { verifyJwt } from '../shared/jwt';

/**
 * Generate IAM policy for API Gateway
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

/**
 * Extract token from Authorization header
 */
function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <token>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Support raw token format
  return authHeader;
}

export async function handler(
  event: APIGatewayRequestAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> {
  console.log('Authorizer invoked for:', event.methodArn);

  try {
    // Extract token from Authorization header
    const token = extractToken(event.headers?.Authorization || event.headers?.authorization);

    if (!token) {
      console.log('No token provided');
      return generatePolicy('anonymous', 'Deny', event.methodArn);
    }

    // Verify JWT token
    const payload = await verifyJwt(token);

    console.log('Token verified for wallet:', payload.sub);

    // Generate Allow policy with wallet address in context
    // The wallet address will be available in downstream Lambdas via:
    // event.requestContext.authorizer.walletAddress
    return generatePolicy(payload.sub, 'Allow', event.methodArn, {
      walletAddress: payload.sub,
    });
  } catch (error) {
    console.error('Authorization failed:', error);

    // Return Deny policy for any error
    return generatePolicy('anonymous', 'Deny', event.methodArn);
  }
}
