/**
 * Hook for fetching trending chains (public, no auth required)
 */

import { useQuery } from '@tanstack/react-query';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export interface ChainSummary {
  chainId: string;
  name?: string;
  description?: string;
  imageKey?: string;
  chain: string[]; // Array of "conditionId:side" pairs
  totalValue: number;
  status: 'ACTIVE' | 'WON' | 'LOST';
  createdAt: string;
  // Extended fields for trending display
  categories?: string[];
  firstMarketEndDate?: string;
  participantCount?: number;
  completedLegs?: number;
  totalLegs?: number;
}

interface TrendingChainsResponse {
  success: boolean;
  data?: ChainSummary[];
  error?: string;
}

/**
 * Hook for fetching trending chains (public endpoint)
 */
export function useTrendingChains(limit: number = 10) {
  const query = useQuery({
    queryKey: ['trending-chains', limit],
    queryFn: async (): Promise<ChainSummary[]> => {
      if (!API_URL) throw new Error('API URL not configured');

      const response = await fetch(`${API_URL}/chains/trending?limit=${limit}`);
      const data: TrendingChainsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch trending chains');
      }

      return data.data || [];
    },
    enabled: !!API_URL,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 2 * 60 * 1000, // Refresh every 2 minutes
  });

  return {
    chains: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message || null,
    refetch: query.refetch,
  };
}
