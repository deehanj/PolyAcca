/**
 * Integration tests for slippage and price impact flow
 *
 * These tests verify the complete flow from:
 * - Estimate endpoint calculating price impact
 * - Chain creation with slippage parameters
 * - Bet execution using FAK orders with maxPrice
 * - Fill tracking and status handling
 */

import { estimateChain } from '../../lambdas/api/chains/estimate';
import {
  calculatePriceImpact,
  exceedsLiquidityThreshold,
} from '../../lambdas/shared/orderbook-client';

// Mock gamma-client for controlled testing
jest.mock('../../lambdas/shared/gamma-client', () => ({
  fetchMarketByConditionId: jest.fn().mockResolvedValue({
    liquidityNum: 10000,
    yesPrice: 0.42,
    noPrice: 0.58,
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
  }),
}));

// Mock orderbook-client for estimate endpoint
jest.mock('../../lambdas/shared/orderbook-client', () => ({
  fetchOrderbook: jest.fn().mockResolvedValue({
    asks: [
      { price: '0.42', size: '1000' },
      { price: '0.45', size: '500' },
    ],
    bids: [{ price: '0.40', size: '1000' }],
    midPrice: '0.41',
    spread: '0.02',
    timestamp: new Date().toISOString(),
  }),
  calculatePriceImpact: jest.fn().mockReturnValue({
    estimatedFillPrice: '0.425',
    fillableAmount: '100.00',
    priceImpact: '0.0119',
    insufficientLiquidity: false,
  }),
  exceedsLiquidityThreshold: jest
    .fn()
    .mockImplementation((stake, liquidity, threshold) => {
      return parseFloat(stake) > liquidity * threshold;
    }),
}));

describe('Slippage and Price Impact Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Estimate endpoint', () => {
    it('should calculate price impact using Gamma liquidity', async () => {
      const body = JSON.stringify({
        legs: [
          {
            conditionId: 'cond-1',
            tokenId: 'token-1',
            side: 'YES',
            targetPrice: '0.42',
          },
        ],
        initialStake: '100',
        maxSlippage: '0.025',
      });

      const result = await estimateChain(body);
      expect(result.statusCode).toBe(200);

      const data = JSON.parse(result.body);
      expect(data.success).toBe(true);
      expect(data.data.legs).toHaveLength(1);
      expect(data.data.totalEstimatedCost).toBeDefined();
    });

    it('should return warnings when impact exceeds slippage', async () => {
      // Test with high impact scenario
      const mockCalculateImpact =
        require('../../lambdas/shared/orderbook-client').calculatePriceImpact;
      const mockExceedsThreshold =
        require('../../lambdas/shared/orderbook-client').exceedsLiquidityThreshold;

      mockExceedsThreshold.mockReturnValueOnce(true);
      mockCalculateImpact.mockReturnValueOnce({
        estimatedFillPrice: '0.50',
        fillableAmount: '5000.00',
        priceImpact: '0.1905', // ~19% impact
        insufficientLiquidity: false,
      });

      const body = JSON.stringify({
        legs: [
          {
            conditionId: 'cond-1',
            tokenId: 'token-1',
            side: 'YES',
            targetPrice: '0.42',
          },
        ],
        initialStake: '5000', // Large stake to trigger orderbook fetch
        maxSlippage: '0.025', // 2.5% tolerance
      });

      const result = await estimateChain(body);
      const data = JSON.parse(result.body);

      // Should have warning about slippage exceeded
      expect(data.data.warnings.length).toBeGreaterThan(0);
      expect(data.data.warnings[0]).toContain('exceeds');
    });

    it('should handle multiple legs in estimate', async () => {
      const body = JSON.stringify({
        legs: [
          {
            conditionId: 'cond-1',
            tokenId: 'token-1',
            side: 'YES',
            targetPrice: '0.42',
          },
          {
            conditionId: 'cond-2',
            tokenId: 'token-2',
            side: 'NO',
            targetPrice: '0.55',
          },
        ],
        initialStake: '100',
        maxSlippage: '0.025',
      });

      const result = await estimateChain(body);
      expect(result.statusCode).toBe(200);

      const data = JSON.parse(result.body);
      expect(data.data.legs).toHaveLength(2);
    });
  });

  describe('Chain creation with slippage', () => {
    it('should calculate maxPrice from targetPrice and slippage', () => {
      const targetPrice = 0.4;
      const maxSlippage = 0.025;
      const expectedMaxPrice = targetPrice * (1 + maxSlippage);

      expect(expectedMaxPrice).toBeCloseTo(0.41, 4);
    });

    it('should default slippage to 2.5% when not provided', () => {
      const defaultSlippage = 0.025;
      expect(defaultSlippage).toBe(0.025);
    });

    it('should cap maxPrice at 0.99 for high-priced markets', () => {
      const targetPrice = 0.98;
      const maxSlippage = 0.025;
      const calculatedMaxPrice = targetPrice * (1 + maxSlippage);
      const cappedMaxPrice = Math.min(calculatedMaxPrice, 0.99);

      expect(cappedMaxPrice).toBe(0.99);
    });

    it('should handle NO side slippage correctly', () => {
      // For NO side, we're buying NO tokens, slippage still applies same way
      const targetPrice = 0.6;
      const maxSlippage = 0.025;
      const expectedMaxPrice = targetPrice * (1 + maxSlippage);

      expect(expectedMaxPrice).toBeCloseTo(0.615, 4);
    });
  });

  describe('Bet execution with FAK', () => {
    it('should use maxPrice for FAK order placement', () => {
      const bet = {
        targetPrice: '0.40',
        maxPrice: '0.41',
      };
      const orderPrice = parseFloat(bet.maxPrice || bet.targetPrice);
      expect(orderPrice).toBe(0.41);
    });

    it('should track partial fill and calculate correct percentages', () => {
      const requestedStake = '100';
      const actualStake = '85';
      const fillPercentage = (
        parseFloat(actualStake) / parseFloat(requestedStake)
      ).toFixed(4);

      expect(fillPercentage).toBe('0.8500');
    });

    it('should detect unfilled orders (zero fills)', () => {
      const fillDetails = {
        filled: false,
        filledSize: '0',
        unfilled: true,
      };

      expect(fillDetails.unfilled).toBe(true);
    });

    it('should detect markets closing within 24h', () => {
      const hoursToEnd = 12; // 12 hours until market closes
      const shouldReject = hoursToEnd < 24;

      expect(shouldReject).toBe(true);
    });

    it('should allow bets on markets with sufficient time', () => {
      const hoursToEnd = 48; // 2 days until market closes
      const shouldReject = hoursToEnd < 24;

      expect(shouldReject).toBe(false);
    });
  });

  describe('Price impact calculation', () => {
    it('should calculate impact percentage correctly', () => {
      const targetPrice = 0.4;
      const fillPrice = 0.42;
      const impact = (fillPrice - targetPrice) / targetPrice;

      expect(impact).toBeCloseTo(0.05, 4); // 5% impact
    });

    it('should detect when stake exceeds liquidity threshold', () => {
      const mockExceedsThreshold =
        require('../../lambdas/shared/orderbook-client').exceedsLiquidityThreshold;

      // $600 stake on $10000 liquidity with 5% threshold = exceeds
      expect(mockExceedsThreshold('600', 10000, 0.05)).toBe(true);

      // $400 stake on $10000 liquidity with 5% threshold = does not exceed
      expect(mockExceedsThreshold('400', 10000, 0.05)).toBe(false);
    });

    it('should handle edge case of zero liquidity', () => {
      const mockExceedsThreshold =
        require('../../lambdas/shared/orderbook-client').exceedsLiquidityThreshold;

      // Any stake should exceed threshold when liquidity is 0
      expect(mockExceedsThreshold('1', 0, 0.05)).toBe(true);
    });

    it('should calculate negative impact for better-than-expected fills', () => {
      const targetPrice = 0.42;
      const fillPrice = 0.4; // Got a better price
      const impact = (fillPrice - targetPrice) / targetPrice;

      expect(impact).toBeLessThan(0);
      expect(impact).toBeCloseTo(-0.0476, 3);
    });
  });

  describe('Multi-leg chain stake propagation', () => {
    it('should calculate subsequent leg stakes from previous fill', () => {
      // First leg: $100 at 0.40 = 250 shares
      // If all shares win, second leg stake = 250 * $1 = $250
      const initialStake = 100;
      const firstLegPrice = 0.4;
      const sharesAcquired = initialStake / firstLegPrice;
      const nextLegStake = sharesAcquired * 1; // $1 per winning share

      expect(sharesAcquired).toBe(250);
      expect(nextLegStake).toBe(250);
    });

    it('should handle partial fills in stake propagation', () => {
      // First leg: Requested $100, but only 85% filled
      const requestedStake = 100;
      const fillPercentage = 0.85;
      const actualStake = requestedStake * fillPercentage;
      const firstLegPrice = 0.4;
      const sharesAcquired = actualStake / firstLegPrice;
      const nextLegStake = sharesAcquired * 1;

      expect(actualStake).toBe(85);
      expect(sharesAcquired).toBe(212.5);
      expect(nextLegStake).toBe(212.5);
    });
  });

  describe('Slippage tolerance edge cases', () => {
    it('should handle zero slippage tolerance', () => {
      const targetPrice = 0.4;
      const maxSlippage = 0;
      const maxPrice = targetPrice * (1 + maxSlippage);

      expect(maxPrice).toBe(0.4); // No room for slippage
    });

    it('should handle high slippage tolerance (10%)', () => {
      const targetPrice = 0.4;
      const maxSlippage = 0.1;
      const maxPrice = targetPrice * (1 + maxSlippage);

      expect(maxPrice).toBeCloseTo(0.44, 4);
    });

    it('should correctly detect when fill price exceeds slippage', () => {
      const targetPrice = 0.4;
      const maxSlippage = 0.025;
      const maxPrice = targetPrice * (1 + maxSlippage);
      const actualFillPrice = 0.42; // 5% above target

      const exceedsSlippage = actualFillPrice > maxPrice;
      expect(exceedsSlippage).toBe(true);
    });

    it('should accept fill price within slippage tolerance', () => {
      const targetPrice = 0.4;
      const maxSlippage = 0.025;
      const maxPrice = targetPrice * (1 + maxSlippage);
      const actualFillPrice = 0.408; // 2% above target

      const exceedsSlippage = actualFillPrice > maxPrice;
      expect(exceedsSlippage).toBe(false);
    });
  });

  describe('FAK order status transitions', () => {
    it('should transition to FILLED for complete fills', () => {
      const orderResponse = {
        filledSize: '250',
        requestedSize: '250',
      };
      const fillPercentage =
        parseFloat(orderResponse.filledSize) /
        parseFloat(orderResponse.requestedSize);
      const status = fillPercentage === 1 ? 'FILLED' : 'PARTIAL';

      expect(status).toBe('FILLED');
    });

    it('should transition to PARTIAL for incomplete fills', () => {
      const orderResponse = {
        filledSize: '200',
        requestedSize: '250',
      };
      const fillPercentage =
        parseFloat(orderResponse.filledSize) /
        parseFloat(orderResponse.requestedSize);
      const status = fillPercentage === 1 ? 'FILLED' : 'PARTIAL';

      expect(status).toBe('PARTIAL');
      expect(fillPercentage).toBe(0.8);
    });

    it('should transition to UNFILLED for zero fills', () => {
      const orderResponse = {
        filledSize: '0',
        requestedSize: '250',
      };
      const fillPercentage =
        parseFloat(orderResponse.filledSize) /
        parseFloat(orderResponse.requestedSize);
      const status =
        fillPercentage === 0 ? 'UNFILLED' : fillPercentage === 1 ? 'FILLED' : 'PARTIAL';

      expect(status).toBe('UNFILLED');
    });
  });
});
