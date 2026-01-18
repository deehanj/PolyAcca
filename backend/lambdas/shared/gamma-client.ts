/**
 * Polymarket Gamma API client
 *
 * Fetches market data from the public Gamma API
 * Reference: https://gamma-api.polymarket.com
 */

import { createLogger } from './logger';
import type { GammaApiMarket, GammaMarket, MarketsQueryParams } from './types';

const logger = createLogger('gamma-client');

const GAMMA_API_BASE = 'https://gamma-api.polymarket.com';
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse JSON string fields from Gamma API response
 */
function parseJsonField<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    logger.warn('Failed to parse JSON field', { value });
    return fallback;
  }
}

/**
 * Transform Gamma API market to frontend-friendly format
 */
export function transformMarket(raw: GammaApiMarket): GammaMarket {
  // Parse outcome prices (usually ["YES_PRICE", "NO_PRICE"])
  const prices = parseJsonField<string[]>(raw.outcomePrices, ['0.5', '0.5']);
  const yesPrice = parseFloat(prices[0]) || 0.5;
  const noPrice = parseFloat(prices[1]) || 0.5;

  // Parse CLOB token IDs (usually ["YES_TOKEN_ID", "NO_TOKEN_ID"])
  const tokenIds = parseJsonField<string[]>(raw.clobTokenIds, ['', '']);
  const yesTokenId = tokenIds[0] || '';
  const noTokenId = tokenIds[1] || '';

  return {
    id: raw.id,
    conditionId: raw.conditionId,
    slug: raw.slug,
    question: raw.question,
    description: raw.description || undefined,
    category: raw.category || 'Other',
    endDate: raw.endDate,
    image: raw.image || raw.icon,
    yesPrice,
    noPrice,
    yesTokenId,
    noTokenId,
    volume: raw.volume,
    volumeNum: raw.volumeNum,
    liquidity: raw.liquidity,
    liquidityNum: raw.liquidityNum,
    volume24hr: raw.volume24hr,
    active: raw.active,
    closed: raw.closed,
  };
}

/**
 * Build query string from parameters
 */
function buildQueryString(params: MarketsQueryParams): string {
  const searchParams = new URLSearchParams();

  // Pagination
  const limit = Math.min(params.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  searchParams.set('limit', String(limit));

  if (params.offset) {
    searchParams.set('offset', String(params.offset));
  }

  // Filters
  if (params.active !== undefined) {
    searchParams.set('active', String(params.active));
  }
  if (params.closed !== undefined) {
    searchParams.set('closed', String(params.closed));
  }

  // Filter out markets that have already ended (server-side)
  const endDateMin = new Date().toISOString();
  searchParams.set('end_date_min', endDateMin);

  // Note: Gamma API may not support category filter directly
  // We filter client-side after fetching

  return searchParams.toString();
}

/**
 * Fetch markets from Gamma API
 */
export async function fetchMarkets(
  params: MarketsQueryParams = {}
): Promise<{ markets: GammaMarket[]; rawCount: number }> {
  const queryString = buildQueryString(params);
  const url = `${GAMMA_API_BASE}/markets?${queryString}`;

  logger.info('Fetching markets from Gamma API', { url, params });

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      logger.error('Gamma API request failed', {
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`Gamma API error: ${response.status} ${response.statusText}`);
    }

    const rawMarkets = (await response.json()) as GammaApiMarket[];

    logger.info('Fetched markets from Gamma API', { count: rawMarkets.length });

    // Transform and optionally filter
    let markets = rawMarkets.map(transformMarket);

    // Filter out markets that have already ended
    const now = new Date();
    const beforeFilterCount = markets.length;
    markets = markets.filter((m) => new Date(m.endDate) > now);

    logger.info('Market endDate filter applied', {
      beforeFilter: beforeFilterCount,
      afterFilter: markets.length,
      filtered: beforeFilterCount - markets.length,
      now: now.toISOString(),
      sampleEndDates: rawMarkets.slice(0, 5).map((m) => ({
        id: m.id,
        question: m.question?.substring(0, 50),
        endDate: m.endDate,
        parsed: new Date(m.endDate).toISOString(),
        isInFuture: new Date(m.endDate) > now,
      })),
    });

    // Client-side category filter if needed
    if (params.category && params.category.toLowerCase() !== 'all') {
      markets = markets.filter(
        (m) => m.category.toLowerCase() === params.category!.toLowerCase()
      );
    }

    // Client-side sorting if needed
    if (params.order) {
      markets.sort((a, b) => {
        let comparison = 0;
        switch (params.order) {
          case 'volume':
            comparison = b.volumeNum - a.volumeNum;
            break;
          case 'liquidity':
            comparison = b.liquidityNum - a.liquidityNum;
            break;
          case 'endDate':
            comparison = new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
            break;
        }
        return params.ascending ? -comparison : comparison;
      });
    }

    return { markets, rawCount: rawMarkets.length };
  } catch (error) {
    logger.errorWithStack('Failed to fetch markets from Gamma API', error);
    throw error;
  }
}

/**
 * Fetch a single market by ID
 */
export async function fetchMarketById(marketId: string): Promise<GammaMarket | null> {
  const url = `${GAMMA_API_BASE}/markets/${marketId}`;

  logger.info('Fetching market from Gamma API', { marketId });

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.status}`);
    }

    const rawMarket = (await response.json()) as GammaApiMarket;
    return transformMarket(rawMarket);
  } catch (error) {
    logger.errorWithStack('Failed to fetch market from Gamma API', error, { marketId });
    throw error;
  }
}

/**
 * Fetch market by condition ID (for integration with existing MarketEntity)
 */
export async function fetchMarketByConditionId(
  conditionId: string
): Promise<GammaMarket | null> {
  const url = `${GAMMA_API_BASE}/markets?condition_ids=${conditionId}&limit=1`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.status}`);
    }

    const rawMarkets = (await response.json()) as GammaApiMarket[];
    if (rawMarkets.length === 0) {
      return null;
    }

    return transformMarket(rawMarkets[0]);
  } catch (error) {
    logger.errorWithStack('Failed to fetch market by condition ID', error, { conditionId });
    throw error;
  }
}
