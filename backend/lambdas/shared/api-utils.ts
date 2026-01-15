/**
 * Shared API utilities for Lambda handlers
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { ApiResponse } from './types';

export const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Extract wallet address from authorizer context
 */
export function getWalletAddress(event: APIGatewayProxyEvent): string | null {
  return event.requestContext.authorizer?.walletAddress || null;
}

/**
 * Build error response
 */
export function errorResponse(statusCode: number, error: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify({ success: false, error } as ApiResponse),
  };
}

/**
 * Build success response
 */
export function successResponse<T>(data: T, statusCode = 200): APIGatewayProxyResult {
  return {
    statusCode,
    headers: HEADERS,
    body: JSON.stringify({ success: true, data } as ApiResponse<T>),
  };
}
