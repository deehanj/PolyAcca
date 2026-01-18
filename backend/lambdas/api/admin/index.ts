/**
 * Admin Lambda - Chain and bet management for dashboard
 *
 * Endpoints:
 * - GET /admin/chains - List all chains with user counts
 * - GET /admin/chains/{chainId} - Get chain details with all user bets
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  getAllChains,
  getAllChainBets,
  getChain,
  getChainUsers,
} from '../../shared/dynamo-client';
import { isAdminWallet } from '../../shared/admin-config';
import { getWalletAddress, errorResponse, successResponse } from '../../shared/api-utils';
import type {
  ChainEntity,
  BetEntity,
  ChainSummary,
  BetSummary,
} from '../../shared/types';

// =============================================================================
// Response Types
// =============================================================================

interface AdminChainSummary extends ChainSummary {
  userCount: number;
}

interface AdminChainDetail {
  chain: ChainSummary;
  users: AdminUserPosition[];
}

interface AdminUserPosition {
  walletAddress: string;
  initialStake: string;
  currentValue: string;
  completedLegs: number;
  status: string;
  createdAt: string;
  bets: BetSummary[];
}

// =============================================================================
// Helper Functions
// =============================================================================

function toChainSummary(entity: ChainEntity): ChainSummary {
  return {
    chainId: entity.chainId,
    name: entity.name,
    description: entity.description,
    imageKey: entity.imageKey,
    chain: entity.chain,
    totalValue: entity.totalValue,
    status: entity.status,
    createdAt: entity.createdAt,
  };
}

function toBetSummary(entity: BetEntity): BetSummary {
  return {
    betId: entity.betId,
    sequence: entity.sequence,
    conditionId: entity.conditionId,
    tokenId: entity.tokenId,
    marketQuestion: entity.marketQuestion,
    side: entity.side,
    targetPrice: entity.targetPrice,
    stake: entity.stake,
    potentialPayout: entity.potentialPayout,
    status: entity.status,
    outcome: entity.outcome,
    actualPayout: entity.actualPayout,
  };
}

// =============================================================================
// Handlers
// =============================================================================

/**
 * GET /admin/chains - List all chains
 */
async function listAllChains(): Promise<APIGatewayProxyResult> {
  const chains = await getAllChains();

  const summaries: AdminChainSummary[] = await Promise.all(
    chains.map(async (chain) => {
      const users = await getChainUsers(chain.chainId);
      return {
        ...toChainSummary(chain),
        userCount: users.length,
      };
    })
  );

  // Sort by createdAt descending
  summaries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return successResponse(summaries);
}

/**
 * GET /admin/chains/{chainId} - Get chain with all user positions and bets
 */
async function getChainDetail(chainId: string): Promise<APIGatewayProxyResult> {
  const chain = await getChain(chainId);

  if (!chain) {
    return errorResponse(404, 'Chain not found');
  }

  const [users, allBets] = await Promise.all([
    getChainUsers(chainId),
    getAllChainBets(chainId),
  ]);

  // Group bets by wallet address
  const betsByWallet = new Map<string, BetEntity[]>();
  for (const bet of allBets) {
    const wallet = bet.walletAddress.toLowerCase();
    const existing = betsByWallet.get(wallet) || [];
    existing.push(bet);
    betsByWallet.set(wallet, existing);
  }

  const userPositions: AdminUserPosition[] = users.map((user) => {
    const userBets = betsByWallet.get(user.walletAddress.toLowerCase()) || [];
    userBets.sort((a, b) => a.sequence - b.sequence);

    return {
      walletAddress: user.walletAddress,
      initialStake: user.initialStake,
      currentValue: user.currentValue,
      completedLegs: user.completedLegs,
      status: user.status,
      createdAt: user.createdAt,
      bets: userBets.map(toBetSummary),
    };
  });

  // Sort users by createdAt descending
  userPositions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return successResponse<AdminChainDetail>({
    chain: toChainSummary(chain),
    users: userPositions,
  });
}

// =============================================================================
// Main Handler
// =============================================================================

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    // Get wallet address from authorizer
    const walletAddress = getWalletAddress(event);
    if (!walletAddress) {
      return errorResponse(401, 'Unauthorized');
    }

    // Check admin access
    if (!isAdminWallet(walletAddress)) {
      return errorResponse(403, 'Forbidden - Admin access required');
    }

    const method = event.httpMethod;
    const chainId = event.pathParameters?.chainId;

    // Route handling
    if (method === 'GET') {
      if (chainId) {
        return getChainDetail(chainId);
      }
      return listAllChains();
    }

    return errorResponse(405, 'Method not allowed');
  } catch (error) {
    console.error('Admin handler error:', error);
    return errorResponse(500, 'Internal server error');
  }
}
