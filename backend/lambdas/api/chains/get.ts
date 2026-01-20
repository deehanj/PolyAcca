/**
 * GET handlers for chains
 *
 * - GET /chains - List user's chains
 * - GET /chains/trending - List trending chains (public)
 * - GET /chains/{id} - Get user chain details
 * - GET /chains/{id}/users - Get all users on a chain
 */

import type { APIGatewayProxyResult } from 'aws-lambda';
import {
  getUserChains,
  getUserChain,
  getChain,
  getChainUsers as getChainUsersFromDb,
  getAllChains,
} from '../../shared/dynamo-client';
import type { UserChainSummary, UserChainDetail, ChainSummary, ChainEntity } from '../../shared/types';
import {
  toUserChainSummary,
  toChainSummary,
  toTrendingChainSummary,
  successResponse,
  errorResponse,
  getUserChainDetail,
} from './utils';

/**
 * GET /chains - List user's chains
 */
export async function listUserChains(walletAddress: string): Promise<APIGatewayProxyResult> {
  const userChains = await getUserChains(walletAddress);

  // Get chain info for each to get totalLegs, name, and imageKey
  const summaries: UserChainSummary[] = [];

  for (const userChain of userChains) {
    const chain = await getChain(userChain.chainId);
    if (chain) {
      summaries.push(toUserChainSummary(userChain, chain));
    }
  }

  // Sort by createdAt descending
  summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return successResponse<UserChainSummary[]>(summaries);
}

/**
 * GET /chains/{id} - Get chain details (public)
 * Returns chain definition and participant info without requiring auth
 */
export async function getChainById(
  chainId: string
): Promise<APIGatewayProxyResult> {
  const chain = await getChain(chainId);

  if (!chain) {
    return errorResponse(404, 'Chain not found');
  }

  // Get participant count
  const userChains = await getChainUsersFromDb(chainId);
  const activeUserChains = userChains.filter(
    (uc) => !['FAILED', 'CANCELLED'].includes(uc.status)
  );

  return successResponse({
    ...toTrendingChainSummary(chain, activeUserChains.length),
    legs: chain.legs, // Include full leg details for copying the bet
  });
}

/**
 * GET /users/me/chains/{id} - Get user's chain position details (authenticated)
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
  console.log('getChainUsers called with chainId:', chainId);
  const chain = await getChain(chainId);
  console.log('getChain result:', chain ? 'found' : 'not found', chain ? { chainId: chain.chainId, name: chain.name } : null);

  if (!chain) {
    console.log('Chain not found for chainId:', chainId);
    return errorResponse(404, 'Chain not found');
  }

  const userChains = await getChainUsersFromDb(chainId);

  const summaries: UserChainSummary[] = userChains.map((userChain) =>
    toUserChainSummary(userChain, chain)
  );

  // Sort by createdAt descending
  summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return successResponse({
    chain: toChainSummary(chain),
    users: summaries,
  });
}

/**
 * GET /chains/trending - List trending chains (public, no auth required)
 * Returns chains sorted by totalValue (most popular first)
 * Includes extended data: participant count, completed legs, categories
 */
export async function listTrendingChains(
  limit: number = 10
): Promise<APIGatewayProxyResult> {
  const chains = await getAllChains();

  // Filter to only chains with names (customized) and sort by totalValue descending
  const trendingChains = chains
    .filter((chain) => chain.name) // Only show customized chains
    .sort((a, b) => (b.totalValue || 0) - (a.totalValue || 0))
    .slice(0, limit);

  // Fetch participant counts for each chain
  // Only count active positions (exclude FAILED/CANCELLED)
  const summaries: ChainSummary[] = await Promise.all(
    trendingChains.map(async (chain: ChainEntity) => {
      const userChains = await getChainUsersFromDb(chain.chainId);
      const activeUserChains = userChains.filter(
        (uc) => !['FAILED', 'CANCELLED'].includes(uc.status)
      );
      const participantCount = activeUserChains.length;

      return toTrendingChainSummary(chain, participantCount);
    })
  );

  return successResponse<ChainSummary[]>(summaries);
}
