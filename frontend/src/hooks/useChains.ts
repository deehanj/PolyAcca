/**
 * Hook for fetching user's chains (accumulators) from the API
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import type {
  UserChainSummary,
  UserChainDetail,
  ChainsResponse,
  ChainDetailResponse,
} from '../types/chain';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Hook for fetching all chains for the authenticated user
 */
export function useChains() {
  const { getAuthHeaders, isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: ['chains'],
    queryFn: async (): Promise<UserChainSummary[]> => {
      if (!API_URL) throw new Error('API URL not configured');

      const response = await fetch(`${API_URL}/chains`, {
        headers: {
          ...getAuthHeaders(),
        },
      });

      const data: ChainsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch chains');
      }

      return data.data || [];
    },
    enabled: !!API_URL && isAuthenticated,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  return {
    chains: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message || null,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching a single chain detail by ID
 */
export function useChainDetail(chainId: string | undefined) {
  const { getAuthHeaders, isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: ['chain', chainId],
    queryFn: async (): Promise<UserChainDetail> => {
      if (!API_URL) throw new Error('API URL not configured');

      const response = await fetch(`${API_URL}/chains/${chainId}`, {
        headers: {
          ...getAuthHeaders(),
        },
      });

      const data: ChainDetailResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch chain detail');
      }

      return data.data!;
    },
    enabled: !!chainId && !!API_URL && isAuthenticated,
    staleTime: 30 * 1000,
  });

  return {
    chain: query.data,
    isLoading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch,
  };
}
