/**
 * Hook for admin WebSocket connection
 * Receives initial state and real-time updates for the dashboard
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
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
}

interface AdminUpdateMessage {
  type: 'ADMIN_STATE' | 'ADMIN_UPDATE';
  data:
    | AdminChainData[]
    | {
        entityType: 'CHAIN' | 'BET' | 'USER_CHAIN';
        eventName: 'INSERT' | 'MODIFY';
        entity: AdminUpdateEntity;
      };
}

/** Apply an incremental update to chains state */
function applyUpdate(
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

export function useAdminWebSocket() {
  const { token, isAuthenticated } = useAuth();
  const { isAdmin } = useUserProfile();
  const [chains, setChains] = useState<AdminChainData[]>([]);
  const [error, setError] = useState<string | null>(null);

  const wsUrl = useMemo(() => {
    if (!ADMIN_WS_URL || !token || !isAdmin) return '';
    return `${ADMIN_WS_URL}?token=${encodeURIComponent(token)}`;
  }, [token, isAdmin]);

  const handleMessage = useCallback((data: unknown) => {
    const message = data as AdminUpdateMessage;

    if (message.type === 'ADMIN_STATE' && Array.isArray(message.data)) {
      console.log('Received admin state:', message.data.length, 'chains');
      setChains(message.data);
    }

    if (message.type === 'ADMIN_UPDATE' && message.data && typeof message.data === 'object' && !Array.isArray(message.data)) {
      const { entityType, eventName, entity } = message.data;
      console.log('Received admin update:', entityType, eventName);
      setChains((prev) => applyUpdate(prev, entityType, eventName, entity));
    }
  }, []);

  const { isConnected } = useWebSocket({
    url: wsUrl,
    onMessage: handleMessage,
    enabled: isAuthenticated && isAdmin && !!wsUrl,
  });

  // Set error when not connected after being connected
  useEffect(() => {
    if (!isConnected && isAuthenticated && isAdmin && wsUrl) {
      setError('Disconnected from admin WebSocket');
    } else {
      setError(null);
    }
  }, [isConnected, isAuthenticated, isAdmin, wsUrl]);

  return {
    isConnected,
    chains,
    error,
    chainCount: chains.length,
  };
}
