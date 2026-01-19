/**
 * Market types for frontend
 */

export interface Market {
  id: string;
  conditionId: string;
  slug: string;
  question: string;
  description?: string;
  category: string;
  volume: string;
  volumeNum: number;
  liquidity: string;
  liquidityNum: number;
  yesPrice: number;
  noPrice: number;
  yesTokenId: string;
  noTokenId: string;
  endDate: string;
  image?: string;
  volume24hr?: number;
  active: boolean;
  closed: boolean;
}

export interface MarketsResponse {
  success: boolean;
  data?: {
    markets: Market[];
    total?: number;
    limit: number;
    offset: number;
  };
  error?: string;
}

export interface MarketsQueryParams {
  // Pagination
  limit?: number;
  offset?: number;
  // Status filters
  active?: boolean;
  closed?: boolean;
  // Range filters
  liquidityMin?: number;
  liquidityMax?: number;
  volumeMin?: number;
  volumeMax?: number;
  // Date filters
  endDateMin?: string;
  endDateMax?: string;
  // Sorting
  order?: 'volume' | 'liquidity' | 'endDate' | 'volume24hr';
  ascending?: boolean;
}

// Sort option for UI
export interface SortOption {
  value: MarketsQueryParams['order'];
  label: string;
  ascending?: boolean;
}

// Available sort options
export const SORT_OPTIONS: SortOption[] = [
  { value: 'volume', label: 'Highest Volume' },
  { value: 'volume', label: 'Lowest Volume', ascending: true },
  { value: 'liquidity', label: 'Most Liquid' },
  { value: 'liquidity', label: 'Least Liquid', ascending: true },
  { value: 'endDate', label: 'Ending Soon', ascending: true },
  { value: 'endDate', label: 'Ending Later' },
  { value: 'volume24hr', label: 'Trending (24h)' },
];
