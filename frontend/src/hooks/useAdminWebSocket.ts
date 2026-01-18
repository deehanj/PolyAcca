/**
 * Hook for admin WebSocket connection
 * Receives initial state and real-time updates for the dashboard
 */

import { useState, useCallback, useMemo } from 'react';
import { useAuth } from './useAuth';
import { useUserProfile } from './useUserProfile';
import { useWebSocket } from './useWebSocket';

const ADMIN_WS_URL = import.meta.env.VITE_ADMIN_WS_URL || '';

// Types matching backend response
export type ChainStatus = 'ACTIVE' | 'WON' | 'LOST';
export type BetStatus =
  | 'QUEUED'
  | 'READY'
  | 'EXECUTING'
  | 'PLACED'
  | 'FILLED'
  | 'SETTLED'
  | 'CANCELLED'
  | 'VOIDED'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'NO_CREDENTIALS'
  | 'ORDER_REJECTED'
  | 'MARKET_CLOSED'
  | 'EXECUTION_ERROR'
  | 'UNKNOWN_FAILURE';

export interface AdminBetData {
  betId: string;
  sequence: number;
  conditionId: string;
  marketQuestion: string;
  side: string;
  targetPrice: string;
  stake: string;
  potentialPayout: string;
  status: BetStatus;
  outcome?: string;
  actualPayout?: string;
}

export interface AdminUserData {
  walletAddress: string;
  initialStake: string;
  currentValue: string;
  completedLegs: number;
  status: string;
  createdAt: string;
  bets: AdminBetData[];
}

export interface AdminChainData {
  chainId: string;
  name: string;
  description?: string;
  chain: string[];
  totalValue: number;
  status: ChainStatus;
  createdAt: string;
  users: AdminUserData[];
}

export type MarketStatus = 'ACTIVE' | 'CLOSED' | 'RESOLVED';

export interface AdminMarketData {
  conditionId: string;
  questionId: string;
  question: string;
  description?: string;
  status: MarketStatus;
  endDate: string;
  resolutionDate?: string;
  outcome?: 'YES' | 'NO';
  volume?: string;
  liquidity?: string;
  lastSyncedAt: string;
}

interface AdminUpdateEntity {
  chainId?: string;
  walletAddress?: string;
  sequence?: number;
  status?: string;
  totalValue?: number;
  initialStake?: string;
  currentValue?: string;
  completedLegs?: number;
  name?: string;
  description?: string;
  chain?: string[];
  createdAt?: string;
  betId?: string;
  conditionId?: string;
  marketQuestion?: string;
  side?: string;
  targetPrice?: string;
  stake?: string;
  potentialPayout?: string;
  outcome?: string;
  actualPayout?: string;
  // Market fields
  questionId?: string;
  question?: string;
  endDate?: string;
  resolutionDate?: string;
  volume?: string;
  liquidity?: string;
  lastSyncedAt?: string;
}

interface AdminState {
  chains: AdminChainData[];
  markets: AdminMarketData[];
}

interface AdminUpdateMessage {
  type: 'ADMIN_STATE' | 'ADMIN_UPDATE';
  data:
    | AdminState
    | {
        entityType: 'CHAIN' | 'BET' | 'USER_CHAIN' | 'MARKET';
        eventName: 'INSERT' | 'MODIFY';
        entity: AdminUpdateEntity;
      };
}

/** Apply an incremental update to chains state */
function applyChainsUpdate(
  chains: AdminChainData[],
  entityType: string,
  eventName: string,
  entity: AdminUpdateEntity
): AdminChainData[] {
  const { chainId, walletAddress, sequence } = entity;

  if (entityType === 'CHAIN' && chainId) {
    if (eventName === 'INSERT' && !chains.some((c) => c.chainId === chainId)) {
      return [
        ...chains,
        {
          chainId,
          name: entity.name || '',
          description: entity.description,
          chain: entity.chain || [],
          totalValue: entity.totalValue || 0,
          status: (entity.status as ChainStatus) || 'ACTIVE',
          createdAt: entity.createdAt || new Date().toISOString(),
          users: [],
        },
      ];
    }
    if (eventName === 'MODIFY') {
      return chains.map((c) =>
        c.chainId === chainId
          ? {
              ...c,
              totalValue: entity.totalValue ?? c.totalValue,
              status: (entity.status as ChainStatus) ?? c.status,
            }
          : c
      );
    }
  }

  if (entityType === 'USER_CHAIN' && chainId && walletAddress) {
    const wallet = walletAddress.toLowerCase();
    return chains.map((chain) => {
      if (chain.chainId !== chainId) return chain;

      if (eventName === 'INSERT' && !chain.users.some((u) => u.walletAddress.toLowerCase() === wallet)) {
        return {
          ...chain,
          users: [
            ...chain.users,
            {
              walletAddress: wallet,
              initialStake: entity.initialStake || '0',
              currentValue: entity.currentValue || '0',
              completedLegs: entity.completedLegs || 0,
              status: entity.status || 'ACTIVE',
              createdAt: entity.createdAt || new Date().toISOString(),
              bets: [],
            },
          ],
        };
      }
      if (eventName === 'MODIFY') {
        return {
          ...chain,
          users: chain.users.map((u) =>
            u.walletAddress.toLowerCase() === wallet
              ? {
                  ...u,
                  currentValue: entity.currentValue ?? u.currentValue,
                  completedLegs: entity.completedLegs ?? u.completedLegs,
                  status: entity.status ?? u.status,
                }
              : u
          ),
        };
      }
      return chain;
    });
  }

  if (entityType === 'BET' && chainId && walletAddress && sequence !== undefined) {
    const wallet = walletAddress.toLowerCase();
    return chains.map((chain) => {
      if (chain.chainId !== chainId) return chain;
      return {
        ...chain,
        users: chain.users.map((user) => {
          if (user.walletAddress.toLowerCase() !== wallet) return user;

          if (eventName === 'INSERT' && !user.bets.some((b) => b.sequence === sequence)) {
            return {
              ...user,
              bets: [
                ...user.bets,
                {
                  betId: entity.betId || `${chainId}-${wallet}-${sequence}`,
                  sequence,
                  conditionId: entity.conditionId || '',
                  marketQuestion: entity.marketQuestion || '',
                  side: entity.side || '',
                  targetPrice: entity.targetPrice || '0',
                  stake: entity.stake || '0',
                  potentialPayout: entity.potentialPayout || '0',
                  status: (entity.status as BetStatus) || 'QUEUED',
                  outcome: entity.outcome,
                  actualPayout: entity.actualPayout,
                },
              ],
            };
          }
          if (eventName === 'MODIFY') {
            return {
              ...user,
              bets: user.bets.map((bet) =>
                bet.sequence === sequence
                  ? {
                      ...bet,
                      status: (entity.status as BetStatus) ?? bet.status,
                      outcome: entity.outcome ?? bet.outcome,
                      actualPayout: entity.actualPayout ?? bet.actualPayout,
                    }
                  : bet
              ),
            };
          }
          return user;
        }),
      };
    });
  }

  return chains;
}

/** Apply an incremental update to markets state */
function applyMarketsUpdate(
  markets: AdminMarketData[],
  eventName: string,
  entity: AdminUpdateEntity
): AdminMarketData[] {
  const { conditionId } = entity;
  if (!conditionId) return markets;

  if (eventName === 'INSERT' && !markets.some((m) => m.conditionId === conditionId)) {
    return [
      ...markets,
      {
        conditionId,
        questionId: entity.questionId || '',
        question: entity.question || '',
        description: entity.description,
        status: (entity.status as MarketStatus) || 'ACTIVE',
        endDate: entity.endDate || new Date().toISOString(),
        resolutionDate: entity.resolutionDate,
        outcome: entity.outcome as 'YES' | 'NO' | undefined,
        volume: entity.volume,
        liquidity: entity.liquidity,
        lastSyncedAt: entity.lastSyncedAt || new Date().toISOString(),
      },
    ];
  }

  if (eventName === 'MODIFY') {
    return markets.map((m) =>
      m.conditionId === conditionId
        ? {
            ...m,
            status: (entity.status as MarketStatus) ?? m.status,
            resolutionDate: entity.resolutionDate ?? m.resolutionDate,
            outcome: (entity.outcome as 'YES' | 'NO' | undefined) ?? m.outcome,
            volume: entity.volume ?? m.volume,
            liquidity: entity.liquidity ?? m.liquidity,
            lastSyncedAt: entity.lastSyncedAt ?? m.lastSyncedAt,
          }
        : m
    );
  }

  return markets;
}

export function useAdminWebSocket() {
  const { token, isAuthenticated } = useAuth();
  const { isAdmin } = useUserProfile();
  const [chains, setChains] = useState<AdminChainData[]>([]);
  const [markets, setMarkets] = useState<AdminMarketData[]>([]);
  
  const wsUrl = useMemo(() => {
    if (!ADMIN_WS_URL || !token || !isAdmin) return '';
    return `${ADMIN_WS_URL}?token=${encodeURIComponent(token)}`;
  }, [token, isAdmin]);

  const handleMessage = useCallback((data: unknown) => {
    const message = data as AdminUpdateMessage;

    if (message.type === 'ADMIN_STATE' && message.data && 'chains' in message.data) {
      const state = message.data as AdminState;
      console.log('Received admin state:', state.chains.length, 'chains,', state.markets.length, 'markets');
      setChains(state.chains);
      setMarkets(state.markets);
    }

    if (message.type === 'ADMIN_UPDATE' && message.data && 'entityType' in message.data) {
      const { entityType, eventName, entity } = message.data;
      console.log('Received admin update:', entityType, eventName);

      if (entityType === 'MARKET') {
        setMarkets((prev) => applyMarketsUpdate(prev, eventName, entity));
      } else {
        setChains((prev) => applyChainsUpdate(prev, entityType, eventName, entity));
      }
    }
  }, []);

  const { isConnected } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    enabled: isAuthenticated && isAdmin && !!wsUrl,
  });

  // Derive error state from connection status
  const error = (!isConnected && isAuthenticated && isAdmin && wsUrl)
    ? 'Disconnected from admin WebSocket'
    : null;

  return {
    isConnected,
    chains,
    markets,
    error,
    chainCount: chains.length,
    marketCount: markets.length,
  };
}
