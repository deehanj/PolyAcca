/**
 * GET handlers for accumulators
 *
 * - GET /accumulators - List user's accumulators
 * - GET /accumulators/{id} - Get accumulator details
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import { getUserAccumulators } from '../../shared/dynamo-client';
import type { AccumulatorSummary, AccumulatorDetail, ApiResponse } from '../../shared/types';
import {
  HEADERS,
  toSummary,
  successResponse,
  errorResponse,
  getAccumulatorDetail,
} from './utils';

/**
 * GET /accumulators - List user's accumulators
 */
export async function listAccumulators(walletAddress: string): Promise<APIGatewayProxyResult> {
  const accumulators = await getUserAccumulators(walletAddress);

  const summaries = accumulators
    .map(toSummary)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return successResponse<AccumulatorSummary[]>(summaries);
}

/**
 * GET /accumulators/{id} - Get accumulator details
 */
export async function getAccumulatorById(
  walletAddress: string,
  accumulatorId: string
): Promise<APIGatewayProxyResult> {
  const detail = await getAccumulatorDetail(walletAddress, accumulatorId);

  if (!detail) {
    return errorResponse(404, 'Accumulator not found');
  }

  return successResponse<AccumulatorDetail>(detail);
}
