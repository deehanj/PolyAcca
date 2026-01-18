/**
 * Hook for calculating live multiplier for a chain
 * Fetches current market prices and calculates combined odds
 */

import { useQuery } from '@tanstack/react-query';
import type { Market } from '../types/market';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

interface ParsedLeg {
  conditionId: string;
  side: 'YES' | 'NO';
}

/**
 * Parse chain array into structured legs
 * Chain format: ["conditionId:YES", "conditionId:NO", ...]
 */
function parseChain(chain: string[]): ParsedLeg[] {
  return chain.map((leg) => {
    const [conditionId, side] = leg.split(':');
    return { conditionId, side: side as 'YES' | 'NO' };
  });
}

/**
 * Fetch market data for multiple condition IDs
 */
async function fetchMarketsForConditions(conditionIds: string[]): Promise<Map<string, Market>> {
  if (!API_URL || conditionIds.length === 0) {
    return new Map();
  }

  // Fetch all markets and filter by condition IDs
  // In a production app, you'd have a batch endpoint for this
  const response = await fetch(`${API_URL}/markets?limit=100&active=true`);
  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to fetch markets');
  }

  const markets: Market[] = data.data?.markets || [];
  const marketMap = new Map<string, Market>();

  for (const market of markets) {
    if (conditionIds.includes(market.conditionId)) {
      marketMap.set(market.conditionId, market);
    }
  }

  return marketMap;
}

/**
 * Calculate multiplier from legs and market prices
 * Multiplier = product of (1 / price) for each leg
 */
function calculateMultiplier(legs: ParsedLeg[], marketMap: Map<string, Market>): number | null {
  if (legs.length === 0) return null;

  let multiplier = 1;
  let hasAllPrices = true;

  for (const leg of legs) {
    const market = marketMap.get(leg.conditionId);
    if (!market) {
      hasAllPrices = false;
      break;
    }

    const price = leg.side === 'YES' ? market.yesPrice : market.noPrice;
    if (price <= 0) {
      hasAllPrices = false;
      break;
    }

    // Convert price to decimal odds (e.g., 0.42 -> 2.38)
    multiplier *= 1 / price;
  }

  return hasAllPrices ? multiplier : null;
}

/**
 * Hook to get live multiplier for a single chain
 */
export function useChainMultiplier(chain: string[] | undefined) {
  const legs = chain ? parseChain(chain) : [];
  const conditionIds = legs.map((l) => l.conditionId);

  const query = useQuery({
    queryKey: ['chain-multiplier', conditionIds.sort().join(',')],
    queryFn: async () => {
      const marketMap = await fetchMarketsForConditions(conditionIds);
      return calculateMultiplier(legs, marketMap);
    },
    enabled: conditionIds.length > 0 && !!API_URL,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  return {
    multiplier: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error?.message || null,
  };
}

/**
 * Hook to get live multipliers for multiple chains
 * More efficient - fetches markets once and calculates for all chains
 */
export function useChainMultipliers(chains: Array<{ chainId: string; chain: string[] }>) {
  // Collect all unique condition IDs across all chains
  const allConditionIds = new Set<string>();
  const parsedChains = chains.map((c) => {
    const legs = parseChain(c.chain);
    legs.forEach((l) => allConditionIds.add(l.conditionId));
    return { chainId: c.chainId, legs };
  });

  const conditionIdsArray = Array.from(allConditionIds);

  const query = useQuery({
    queryKey: ['chain-multipliers', conditionIdsArray.sort().join(',')],
    queryFn: async () => {
      const marketMap = await fetchMarketsForConditions(conditionIdsArray);

      // Calculate multiplier for each chain
      const multipliers = new Map<string, number | null>();
      for (const { chainId, legs } of parsedChains) {
        multipliers.set(chainId, calculateMultiplier(legs, marketMap));
      }

      return multipliers;
    },
    enabled: conditionIdsArray.length > 0 && !!API_URL,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  return {
    multipliers: query.data ?? new Map<string, number | null>(),
    isLoading: query.isLoading,
    error: query.error?.message || null,
  };
}
