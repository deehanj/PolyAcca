/**
 * Polymarket CLOB API client
 *
 * Fetches order book and market status data from the CLOB API
 * Reference: https://clob.polymarket.com
 */

import { createLogger } from './logger';

const logger = createLogger('clob-client');

const CLOB_API_BASE = 'https://clob.polymarket.com';
const FETCH_TIMEOUT_MS = 10000; // 10 second timeout

/**
 * Market status from CLOB API
 */
export interface ClobMarketStatus {
  /** Whether the market is accepting new orders */
  acceptingOrders: boolean;
  /** Whether the market is closed */
  closed: boolean;
  /** Whether the market is active */
  active: boolean;
  /** Whether the order book is enabled */
  enableOrderBook: boolean;
  /** Condition ID */
  conditionId: string;
  /** End date (ISO string) */
  endDate?: string;
}

/**
 * Raw CLOB market response
 */
interface ClobMarketResponse {
  condition_id: string;
  accepting_orders: boolean;
  closed: boolean;
  active: boolean;
  enable_order_book: boolean;
  end_date_iso?: string;
  tokens?: Array<{
    token_id: string;
    outcome: string;
    price: number;
  }>;
}

/**
 * Fetch with timeout to prevent Lambda from hanging
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Browser-like headers
 */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Connection: 'keep-alive',
};

/**
 * Check if a market is accepting orders
 *
 * This is the source of truth for whether you can place a bet.
 * The Gamma API's `active` field is not reliable - use this instead.
 *
 * @param tokenId - The token ID (YES or NO token) for the market
 * @returns Market status including acceptingOrders
 * @throws Error if the API call fails (not including 404)
 */
export async function checkMarketAcceptingOrders(
  tokenId: string
): Promise<ClobMarketStatus | null> {
  const url = `${CLOB_API_BASE}/markets/${tokenId}`;

  logger.info('Checking market accepting orders status', { tokenId, url });

  try {
    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: BROWSER_HEADERS,
    });

    // 404 means market not found on CLOB (removed/never existed)
    if (response.status === 404) {
      logger.info('Market not found on CLOB', { tokenId });
      return null;
    }

    if (!response.ok) {
      logger.error('CLOB API request failed', {
        tokenId,
        status: response.status,
        statusText: response.statusText,
      });
      throw new Error(`CLOB API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as ClobMarketResponse;

    const status: ClobMarketStatus = {
      acceptingOrders: data.accepting_orders,
      closed: data.closed,
      active: data.active,
      enableOrderBook: data.enable_order_book,
      conditionId: data.condition_id,
      endDate: data.end_date_iso,
    };

    logger.info('Market status retrieved', {
      tokenId,
      acceptingOrders: status.acceptingOrders,
      closed: status.closed,
    });

    return status;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeout = errorMessage.includes('aborted') || errorMessage.includes('timeout');

    logger.errorWithStack('Failed to check market accepting orders', error, {
      tokenId,
      isTimeout,
    });

    if (isTimeout) {
      throw new Error(`CLOB API timeout for tokenId: ${tokenId}`);
    }
    throw error;
  }
}

/**
 * Check if a market is bettable (accepting orders and not closed)
 *
 * Convenience function that returns a simple boolean with reason.
 *
 * @param tokenId - The token ID for the market
 * @returns Object with canBet boolean and reason string
 */
export async function isMarketBettable(
  tokenId: string
): Promise<{ canBet: boolean; reason: string }> {
  const status = await checkMarketAcceptingOrders(tokenId);

  if (status === null) {
    return {
      canBet: false,
      reason: 'Market not found on order book',
    };
  }

  if (status.closed) {
    return {
      canBet: false,
      reason: 'Market is closed',
    };
  }

  if (!status.acceptingOrders) {
    return {
      canBet: false,
      reason: 'Market is not accepting orders',
    };
  }

  if (!status.enableOrderBook) {
    return {
      canBet: false,
      reason: 'Order book is disabled',
    };
  }

  return {
    canBet: true,
    reason: 'Market is open for betting',
  };
}
