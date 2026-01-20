/**
 * Orderbook client for fetching CLOB orderbook data
 * and calculating price impact
 */

import { ClobClient } from '@polymarket/clob-client';
import type { OrderbookLevel, OrderbookData } from './types';
import { createLogger } from './logger';
import { toMicroUsdc, fromMicroUsdc } from './usdc-math';

const logger = createLogger('orderbook-client');

const POLYMARKET_HOST = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;

export interface PriceImpactResult {
  estimatedFillPrice: string;
  fillableAmount: string;
  priceImpact: string;        // Percentage as decimal (0.025 = 2.5%)
  insufficientLiquidity: boolean;
}

/**
 * Fetch orderbook for a token from Polymarket CLOB
 */
export async function fetchOrderbook(tokenId: string): Promise<OrderbookData> {
  const client = new ClobClient(POLYMARKET_HOST, POLYGON_CHAIN_ID);

  logger.info('Fetching orderbook', { tokenId });

  try {
    const book = await client.getOrderBook(tokenId);

    const bids: OrderbookLevel[] = (book.bids || []).map((b: any) => ({
      price: String(b.price),
      size: String(b.size),
    }));

    const asks: OrderbookLevel[] = (book.asks || []).map((a: any) => ({
      price: String(a.price),
      size: String(a.size),
    }));

    const bestBid = bids[0]?.price || '0';
    const bestAsk = asks[0]?.price || '1';
    const bestBidMicro = toMicroUsdc(bestBid);
    const bestAskMicro = toMicroUsdc(bestAsk);
    const midPriceMicro = (bestBidMicro + bestAskMicro) / 2n;
    const midPrice = fromMicroUsdc(midPriceMicro);
    const spread = fromMicroUsdc(bestAskMicro - bestBidMicro);

    return {
      bids,
      asks,
      midPrice,
      spread,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.errorWithStack('Failed to fetch orderbook', error, { tokenId });
    throw error;
  }
}

/**
 * Calculate price impact for a given order size
 *
 * @param levels - Ask levels for buys, bid levels for sells
 * @param stakeAmount - Amount in USDC to spend
 * @param targetPrice - The displayed price user saw
 * @returns Price impact calculation result
 */
export function calculatePriceImpact(
  levels: OrderbookLevel[],
  stakeAmount: string,
  targetPrice: string
): PriceImpactResult {
  const stakeMicro = toMicroUsdc(stakeAmount);
  const targetPriceNum = parseFloat(targetPrice);

  let remainingStakeMicro = stakeMicro;
  let totalSharesAcquired = 0n;
  let totalCostMicro = 0n;

  for (const level of levels) {
    if (remainingStakeMicro <= 0n) break;

    const levelPriceMicro = toMicroUsdc(level.price);

    // How many shares can we buy at this level?
    // shares = stake / price
    const maxSharesAtLevel = toMicroUsdc(level.size);
    const affordableShares = (remainingStakeMicro * 1_000_000n) / levelPriceMicro;

    const sharesToBuy = affordableShares < maxSharesAtLevel ? affordableShares : maxSharesAtLevel;
    const costMicro = (sharesToBuy * levelPriceMicro) / 1_000_000n;

    totalSharesAcquired += sharesToBuy;
    totalCostMicro += costMicro;
    remainingStakeMicro -= costMicro;
  }

  const filledStakeMicro = stakeMicro - remainingStakeMicro;
  const insufficientLiquidity = remainingStakeMicro > 0n;

  // Calculate average fill price
  let avgFillPrice = targetPriceNum;
  if (totalSharesAcquired > 0n) {
    avgFillPrice = Number(totalCostMicro) / Number(totalSharesAcquired);
  }

  // Price impact as percentage
  const impact = targetPriceNum > 0
    ? (avgFillPrice - targetPriceNum) / targetPriceNum
    : 0;

  return {
    estimatedFillPrice: avgFillPrice.toFixed(4),
    fillableAmount: fromMicroUsdc(filledStakeMicro),
    priceImpact: impact.toFixed(4),
    insufficientLiquidity,
  };
}

/**
 * Check if stake amount exceeds threshold percentage of market liquidity
 */
export function exceedsLiquidityThreshold(
  stakeAmount: string,
  marketLiquidity: number,
  thresholdPercent: number = 0.05
): boolean {
  const stake = parseFloat(stakeAmount);
  return stake > (marketLiquidity * thresholdPercent);
}
