/**
 * GET handlers for chains
 *
 * - GET /chains - List user's chains
 * - GET /chains/{id} - Get user chain details
 * - GET /chains/{id}/users - Get all users on a chain
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import {
  getUserChains,
  getUserChain,
  getChain,
  getChainUserChains,
} from '../../shared/dynamo-client';
import type { UserChainSummary, UserChainDetail } from '../../shared/types';
import {
  toUserChainSummary,
  toChainSummary,
  successResponse,
  errorResponse,
  getUserChainDetail,
} from './utils';

/**
 * GET /chains - List user's chains
 */
export async function listUserChains(walletAddress: string): Promise<APIGatewayProxyResult> {
  const userChains = await getUserChains(walletAddress);

  // Get chain info for each to get totalLegs
  const summaries: UserChainSummary[] = [];

  for (const userChain of userChains) {
    const chain = await getChain(userChain.chainId);
    if (chain) {
      summaries.push(toUserChainSummary(userChain, chain.legs.length));
    }
  }

  // Sort by createdAt descending
  summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return successResponse<UserChainSummary[]>(summaries);
}

/**
 * GET /chains/{id} - Get user chain details
 */
export async function getUserChainById(
  walletAddress: string,
  chainId: string
): Promise<APIGatewayProxyResult> {
  const userChain = await getUserChain(chainId, walletAddress);

  if (!userChain) {
    return errorResponse(404, 'Chain not found');
  }

  const detail = await getUserChainDetail(userChain);

  if (!detail) {
    return errorResponse(404, 'Chain definition not found');
  }

  return successResponse<UserChainDetail>(detail);
}

/**
 * GET /chains/{id}/users - Get all users on a chain
 */
export async function getChainUsers(
  chainId: string
): Promise<APIGatewayProxyResult> {
  const chain = await getChain(chainId);

  if (!chain) {
    return errorResponse(404, 'Chain not found');
  }

  const userChains = await getChainUserChains(chainId);

  const summaries: UserChainSummary[] = userChains.map((userChain) =>
    toUserChainSummary(userChain, chain.legs.length)
  );

  // Sort by createdAt descending
  summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return successResponse({
    chain: toChainSummary(chain),
    users: summaries,
  });
}
