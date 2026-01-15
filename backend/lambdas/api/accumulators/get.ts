/**
 * GET handlers for accumulators
 *
 * - GET /accumulators - List user's accumulators
 * - GET /accumulators/{id} - Get user acca details
 * - GET /accumulators/{id}/users - Get all users on an accumulator
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import {
  getUserAccas,
  getUserAcca,
  getAccumulator,
  getAccumulatorUserAccas,
} from '../../shared/dynamo-client';
import type { UserAccaSummary, UserAccaDetail } from '../../shared/types';
import {
  toUserAccaSummary,
  toAccumulatorSummary,
  successResponse,
  errorResponse,
  getUserAccaDetail,
} from './utils';

/**
 * GET /accumulators - List user's accumulators
 */
export async function listUserAccas(walletAddress: string): Promise<APIGatewayProxyResult> {
  const userAccas = await getUserAccas(walletAddress);

  // Get accumulator info for each to get totalLegs
  const summaries: UserAccaSummary[] = [];

  for (const userAcca of userAccas) {
    const accumulator = await getAccumulator(userAcca.accumulatorId);
    if (accumulator) {
      summaries.push(toUserAccaSummary(userAcca, accumulator.legs.length));
    }
  }

  // Sort by createdAt descending
  summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return successResponse<UserAccaSummary[]>(summaries);
}

/**
 * GET /accumulators/{id} - Get user acca details
 */
export async function getUserAccaById(
  walletAddress: string,
  accumulatorId: string
): Promise<APIGatewayProxyResult> {
  const userAcca = await getUserAcca(accumulatorId, walletAddress);

  if (!userAcca) {
    return errorResponse(404, 'Accumulator not found');
  }

  const detail = await getUserAccaDetail(userAcca);

  if (!detail) {
    return errorResponse(404, 'Accumulator definition not found');
  }

  return successResponse<UserAccaDetail>(detail);
}

/**
 * GET /accumulators/{id}/users - Get all users on an accumulator
 */
export async function getAccumulatorUsers(
  accumulatorId: string
): Promise<APIGatewayProxyResult> {
  const accumulator = await getAccumulator(accumulatorId);

  if (!accumulator) {
    return errorResponse(404, 'Accumulator not found');
  }

  const userAccas = await getAccumulatorUserAccas(accumulatorId);

  const summaries: UserAccaSummary[] = userAccas.map((userAcca) =>
    toUserAccaSummary(userAcca, accumulator.legs.length)
  );

  // Sort by createdAt descending
  summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return successResponse({
    accumulator: toAccumulatorSummary(accumulator),
    users: summaries,
  });
}
