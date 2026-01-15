/**
 * Admin WebSocket $connect handler
 *
 * After authorization passes, this handler:
 * 1. Stores connection in DynamoDB
 * 2. Sends initial state (all chains with bets)
 *
 * Authorization (JWT + admin check) is handled by the WebSocket authorizer.
 */

import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {
  saveAdminConnection,
  getAllChains,
  getAllChainBets,
  getChainUsers,
  getAllMarkets,
} from '../../shared/dynamo-client';
import { requireEnvVar } from '../../utils/envVars';

const WEBSOCKET_ENDPOINT = requireEnvVar('WEBSOCKET_ENDPOINT');

interface AdminChainData {
  chainId: string;
  name: string;
  description?: string;
  chain: string[];
  totalValue: number;
  status: string;
  createdAt: string;
  users: AdminUserData[];
}

interface AdminUserData {
  walletAddress: string;
  initialStake: string;
  currentValue: string;
  completedLegs: number;
  status: string;
  createdAt: string;
  bets: AdminBetData[];
}

interface AdminBetData {
  betId: string;
  sequence: number;
  conditionId: string;
  marketQuestion: string;
  side: string;
  targetPrice: string;
  stake: string;
  potentialPayout: string;
  status: string;
  outcome?: string;
  actualPayout?: string;
}

interface AdminMarketData {
  conditionId: string;
  questionId: string;
  question: string;
  description?: string;
  status: string;
  endDate: string;
  resolutionDate?: string;
  outcome?: string;
  volume?: string;
  liquidity?: string;
  lastSyncedAt: string;
}

interface AdminState {
  chains: AdminChainData[];
  markets: AdminMarketData[];
}

/**
 * Build full admin state snapshot
 */
async function buildAdminState(): Promise<AdminState> {
  const [chains, markets] = await Promise.all([getAllChains(), getAllMarkets()]);

  const chainData: AdminChainData[] = await Promise.all(
    chains.map(async (chain) => {
      const [users, allBets] = await Promise.all([
        getChainUsers(chain.chainId),
        getAllChainBets(chain.chainId),
      ]);

      // Group bets by wallet
      const betsByWallet = new Map<string, typeof allBets>();
      for (const bet of allBets) {
        const wallet = bet.walletAddress.toLowerCase();
        const existing = betsByWallet.get(wallet) || [];
        existing.push(bet);
        betsByWallet.set(wallet, existing);
      }

      const userData: AdminUserData[] = users.map((user) => {
        const userBets = betsByWallet.get(user.walletAddress.toLowerCase()) || [];
        userBets.sort((a, b) => a.sequence - b.sequence);

        return {
          walletAddress: user.walletAddress,
          initialStake: user.initialStake,
          currentValue: user.currentValue,
          completedLegs: user.completedLegs,
          status: user.status,
          createdAt: user.createdAt,
          bets: userBets.map((bet) => ({
            betId: bet.betId,
            sequence: bet.sequence,
            conditionId: bet.conditionId,
            marketQuestion: bet.marketQuestion,
            side: bet.side,
            targetPrice: bet.targetPrice,
            stake: bet.stake,
            potentialPayout: bet.potentialPayout,
            status: bet.status,
            outcome: bet.outcome,
            actualPayout: bet.actualPayout,
          })),
        };
      });

      // Sort users by createdAt desc
      userData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return {
        chainId: chain.chainId,
        name: chain.name,
        description: chain.description,
        chain: chain.chain,
        totalValue: chain.totalValue,
        status: chain.status,
        createdAt: chain.createdAt,
        users: userData,
      };
    })
  );

  // Sort chains by createdAt desc
  chainData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Map markets to admin format
  const marketData: AdminMarketData[] = markets.map((market) => ({
    conditionId: market.conditionId,
    questionId: market.questionId,
    question: market.question,
    description: market.description,
    status: market.status,
    endDate: market.endDate,
    resolutionDate: market.resolutionDate,
    outcome: market.outcome,
    volume: market.volume,
    liquidity: market.liquidity,
    lastSyncedAt: market.lastSyncedAt,
  }));

  // Sort markets by endDate desc
  marketData.sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());

  return { chains: chainData, markets: marketData };
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  console.log('Admin WebSocket connect:', connectionId);

  try {
    // Get wallet address from authorizer context
    // Cast to access authorizer context which is added by the Lambda authorizer
    const requestContext = event.requestContext as unknown as {
      authorizer?: { walletAddress?: string };
    };
    const walletAddress = requestContext.authorizer?.walletAddress;

    if (!walletAddress) {
      // This shouldn't happen if authorizer is working correctly
      console.error('No wallet address in authorizer context');
      return { statusCode: 500, body: 'Authorization context missing' };
    }

    // Store admin connection
    await saveAdminConnection(connectionId, walletAddress);
    console.log('Admin connection saved:', connectionId, walletAddress);

    // Build and send initial state
    const adminState = await buildAdminState();

    const apiClient = new ApiGatewayManagementApiClient({
      endpoint: WEBSOCKET_ENDPOINT,
    });

    await apiClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify({
          type: 'ADMIN_STATE',
          data: adminState,
        })),
      })
    );

    console.log('Initial state sent to admin');

    return { statusCode: 200, body: 'Connected' };
  } catch (error) {
    console.error('Admin connect error:', error);
    return { statusCode: 500, body: 'Internal server error' };
  }
};
