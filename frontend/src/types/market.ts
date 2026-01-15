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
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
  category?: string;
  order?: 'volume' | 'liquidity' | 'endDate';
  ascending?: boolean;
}
