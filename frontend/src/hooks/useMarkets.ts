/**
 * Hook for fetching markets from the Gamma API
 */

import { useQuery } from '@tanstack/react-query';
import type { Market, MarketsResponse, MarketsQueryParams } from '../types/market';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function fetchMarketsFromApi(
  params: MarketsQueryParams
): Promise<MarketsResponse['data']> {
  if (!API_URL) throw new Error('API URL not configured');

  const searchParams = new URLSearchParams();

  // Pagination
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.offset) searchParams.set('offset', String(params.offset));

  // Status filters
  if (params.active !== undefined) searchParams.set('active', String(params.active));
  if (params.closed !== undefined) searchParams.set('closed', String(params.closed));

  // Range filters
  if (params.liquidityMin !== undefined) searchParams.set('liquidityMin', String(params.liquidityMin));
  if (params.liquidityMax !== undefined) searchParams.set('liquidityMax', String(params.liquidityMax));
  if (params.volumeMin !== undefined) searchParams.set('volumeMin', String(params.volumeMin));
  if (params.volumeMax !== undefined) searchParams.set('volumeMax', String(params.volumeMax));

  // Date filters
  if (params.endDateMin) searchParams.set('endDateMin', params.endDateMin);
  if (params.endDateMax) searchParams.set('endDateMax', params.endDateMax);

  // Sorting
  if (params.order) searchParams.set('order', params.order);
  if (params.ascending !== undefined) searchParams.set('ascending', String(params.ascending));

  const queryString = searchParams.toString();
  const url = queryString ? `${API_URL}/markets?${queryString}` : `${API_URL}/markets`;

  const response = await fetch(url);
  const data: MarketsResponse = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch markets');
  }

  return data.data!;
}

/**
 * Hook for fetching a page of markets
 */
export function useMarkets(params: MarketsQueryParams = {}) {
  const query = useQuery({
    queryKey: ['markets', params],
    queryFn: () => fetchMarketsFromApi(params),
    staleTime: 30 * 1000, // 30 seconds - markets update frequently
    refetchInterval: 60 * 1000, // Refresh every minute
    enabled: !!API_URL,
  });

  return {
    markets: query.data?.markets ?? [],
    total: query.data?.total,
    limit: query.data?.limit ?? params.limit ?? 20,
    offset: query.data?.offset ?? params.offset ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error?.message || null,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching a single market by ID
 */
export function useMarket(marketId: string | undefined) {
  const query = useQuery({
    queryKey: ['market', marketId],
    queryFn: async (): Promise<Market> => {
      if (!API_URL) throw new Error('API URL not configured');

      const response = await fetch(`${API_URL}/markets/${marketId}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch market');
      }

      return data.data;
    },
    enabled: !!marketId && !!API_URL,
    staleTime: 30 * 1000,
  });

  return {
    market: query.data,
    isLoading: query.isLoading,
    error: query.error?.message || null,
    refetch: query.refetch,
  };
}
