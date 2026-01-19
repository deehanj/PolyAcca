/**
 * Integration tests for FAK (Fill-and-Kill) order handling in bet-executor
 *
 * These tests verify actual bet-executor behavior by mocking dependencies
 * and asserting that the correct functions are called with correct parameters.
 */

import type { BetEntity } from '../../lambdas/shared/types';

// Mock all dependencies BEFORE importing the module under test
const mockPlaceOrder = jest.fn();
const mockFetchOrderStatus = jest.fn();
const mockDeriveApiCredentials = jest.fn().mockResolvedValue({
  apiKey: 'test-key',
  apiSecret: 'test-secret',
  passphrase: 'test-pass',
});
const mockDecryptCredentials = jest.fn().mockResolvedValue({
  apiKey: 'test-key',
  apiSecret: 'test-secret',
  passphrase: 'test-pass',
});
const mockEncryptCredentials = jest.fn().mockResolvedValue({
  apiKey: 'encrypted',
  apiSecret: 'encrypted',
  passphrase: 'encrypted',
});

jest.mock('../../lambdas/shared/polymarket-client', () => ({
  placeOrder: mockPlaceOrder,
  fetchOrderStatus: mockFetchOrderStatus,
  deriveApiCredentials: mockDeriveApiCredentials,
  decryptEmbeddedWalletCredentials: mockDecryptCredentials,
  encryptEmbeddedWalletCredentials: mockEncryptCredentials,
}));

const mockFetchMarket = jest.fn();
jest.mock('../../lambdas/shared/gamma-client', () => ({
  fetchMarketByConditionId: mockFetchMarket,
}));

const mockUpdateBetStatus = jest.fn().mockResolvedValue(undefined);
const mockUpdateUserChainStatus = jest.fn().mockResolvedValue(undefined);
const mockGetUser = jest.fn().mockResolvedValue({
  walletAddress: '0xuser',
  embeddedWalletAddress: '0xembedded',
});
const mockGetChain = jest.fn().mockResolvedValue({
  chainId: 'chain-1',
  totalLegs: 3,
});

jest.mock('../../lambdas/shared/dynamo-client', () => ({
  updateBetStatus: mockUpdateBetStatus,
  updateUserChainStatus: mockUpdateUserChainStatus,
  getUser: mockGetUser,
  getChain: mockGetChain,
}));

jest.mock('../../lambdas/shared/turnkey-client', () => ({
  createSigner: jest.fn().mockResolvedValue({
    getAddress: jest.fn().mockResolvedValue('0xembedded'),
  }),
}));

const mockGetEmbeddedWalletCredentials = jest.fn().mockResolvedValue({
  apiKey: 'encrypted-key',
  apiSecret: 'encrypted-secret',
  passphrase: 'encrypted-pass',
});
const mockCacheEmbeddedWalletCredentials = jest.fn().mockResolvedValue(undefined);

jest.mock('../../lambdas/shared/embedded-wallet-credentials', () => ({
  getEmbeddedWalletCredentials: mockGetEmbeddedWalletCredentials,
  cacheEmbeddedWalletCredentials: mockCacheEmbeddedWalletCredentials,
}));

jest.mock('ethers', () => ({
  JsonRpcProvider: jest.fn().mockImplementation(() => ({
    getBlockNumber: jest.fn().mockResolvedValue(12345678),
  })),
}));

// Import the module under test AFTER mocks are set up
import { executeBet } from '../../lambdas/streams/bet-executor/index';

// Create a test bet
function createTestBet(overrides: Partial<BetEntity> = {}): BetEntity {
  return {
    entityType: 'BET',
    chainId: 'chain-1',
    walletAddress: '0xuser',
    sequence: 1,
    betId: 'bet-1',
    conditionId: 'condition-1',
    tokenId: 'token-1',
    targetPrice: '0.40',
    maxPrice: '0.41', // 2.5% slippage
    maxSlippage: '0.025',
    stake: '100',
    requestedStake: '100',
    potentialPayout: '250',
    status: 'READY',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as BetEntity;
}

describe('bet-executor FAK orders', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: market is active and has plenty of time
    mockFetchMarket.mockResolvedValue({
      conditionId: 'condition-1',
      active: true,
      closed: false,
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      liquidityNum: 10000,
      yesPrice: 0.4,
      noPrice: 0.6,
    } as any);

    // Default: order fills successfully
    mockPlaceOrder.mockResolvedValue('order-123');
    mockFetchOrderStatus.mockResolvedValue({
      status: 'FILLED',
      filledSize: '250',
      fillPrice: '0.40',
    } as any);
  });

  describe('FAK order placement', () => {
    it('should place FAK order with maxPrice instead of targetPrice', async () => {
      const bet = createTestBet({
        targetPrice: '0.40',
        maxPrice: '0.41',
      });

      await executeBet(bet);

      // Verify placeOrder was called with FAK and maxPrice
      expect(mockPlaceOrder).toHaveBeenCalledWith(
        expect.anything(), // signer
        expect.anything(), // credentials
        expect.objectContaining({
          tokenId: 'token-1',
          side: 'BUY',
          price: 0.41, // maxPrice, NOT targetPrice
          orderType: 'FAK',
        })
      );
    });

    it('should fall back to targetPrice when maxPrice not set', async () => {
      const bet = createTestBet({
        targetPrice: '0.50',
        maxPrice: undefined,
      });

      await executeBet(bet);

      expect(mockPlaceOrder).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          price: 0.50, // falls back to targetPrice
          orderType: 'FAK',
        })
      );
    });
  });

  describe('UNFILLED status handling', () => {
    it('should mark bet as UNFILLED when FAK gets zero fills', async () => {
      // Mock: order gets zero fills
      mockFetchOrderStatus.mockResolvedValue({
        status: 'EXPIRED',
        filledSize: '0',
        fillPrice: undefined,
      } as any);

      const bet = createTestBet();
      await executeBet(bet);

      // Should update bet status to UNFILLED
      expect(mockUpdateBetStatus).toHaveBeenCalledWith(
        'chain-1',
        '0xuser',
        1,
        'UNFILLED',
        expect.objectContaining({
          orderId: 'order-123',
        })
      );

      // Should mark chain as FAILED
      expect(mockUpdateUserChainStatus).toHaveBeenCalledWith(
        'chain-1',
        '0xuser',
        'FAILED',
        expect.objectContaining({
          completedLegs: 0, // sequence - 1
        })
      );
    });
  });

  describe('partial fill tracking', () => {
    it('should store fill details when order fills', async () => {
      // Mock: order partially fills
      mockFetchOrderStatus.mockResolvedValue({
        status: 'FILLED',
        filledSize: '200', // Got 200 shares instead of 250
        fillPrice: '0.42', // At slightly higher price
      } as any);

      const bet = createTestBet({
        targetPrice: '0.40',
        requestedStake: '100',
      });

      await executeBet(bet);

      // Should update with fill details including slippage tracking
      expect(mockUpdateBetStatus).toHaveBeenCalledWith(
        'chain-1',
        '0xuser',
        1,
        'FILLED',
        expect.objectContaining({
          fillPrice: '0.42',
          sharesAcquired: '200',
          actualStake: expect.any(String), // 200 * 0.42 = 84
          fillPercentage: expect.any(String),
          priceImpact: expect.any(String),
        })
      );
    });

    it('should calculate correct fill percentage', async () => {
      mockFetchOrderStatus.mockResolvedValue({
        status: 'FILLED',
        filledSize: '200',
        fillPrice: '0.425', // actualStake = 200 * 0.425 = 85
      } as any);

      const bet = createTestBet({
        requestedStake: '100',
      });

      await executeBet(bet);

      // Get the call args for FILLED status update
      const filledCall = mockUpdateBetStatus.mock.calls.find(
        (call) => call[3] === 'FILLED'
      );
      expect(filledCall).toBeDefined();

      const fillDetails = filledCall![4];
      // fillPercentage should be actualStake / requestedStake
      // 85 / 100 = 0.85
      expect(parseFloat(fillDetails.fillPercentage)).toBeCloseTo(0.85, 2);
    });

    it('should calculate correct price impact', async () => {
      mockFetchOrderStatus.mockResolvedValue({
        status: 'FILLED',
        filledSize: '250',
        fillPrice: '0.42', // 5% higher than target of 0.40
      } as any);

      const bet = createTestBet({
        targetPrice: '0.40',
      });

      await executeBet(bet);

      const filledCall = mockUpdateBetStatus.mock.calls.find(
        (call) => call[3] === 'FILLED'
      );
      expect(filledCall).toBeDefined();

      const fillDetails = filledCall![4];
      // priceImpact = (0.42 - 0.40) / 0.40 = 0.05
      expect(parseFloat(fillDetails.priceImpact)).toBeCloseTo(0.05, 3);
    });
  });

  describe('24-hour market timeout', () => {
    it('should reject bets on markets closing within 24 hours', async () => {
      // Market closes in 12 hours
      mockFetchMarket.mockResolvedValue({
        conditionId: 'condition-1',
        active: true,
        closed: false,
        endDate: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        liquidityNum: 10000,
      } as any);

      const bet = createTestBet();
      await executeBet(bet);

      // Should NOT place order
      expect(mockPlaceOrder).not.toHaveBeenCalled();

      // Should mark bet as MARKET_CLOSING_SOON
      expect(mockUpdateBetStatus).toHaveBeenCalledWith(
        'chain-1',
        '0xuser',
        1,
        'MARKET_CLOSING_SOON'
      );

      // Should mark chain as FAILED
      expect(mockUpdateUserChainStatus).toHaveBeenCalledWith(
        'chain-1',
        '0xuser',
        'FAILED',
        expect.objectContaining({
          completedLegs: 0,
        })
      );
    });

    it('should allow bets on markets with more than 24 hours remaining', async () => {
      // Market closes in 48 hours
      mockFetchMarket.mockResolvedValue({
        conditionId: 'condition-1',
        active: true,
        closed: false,
        endDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        liquidityNum: 10000,
      } as any);

      const bet = createTestBet();
      await executeBet(bet);

      // Should place order
      expect(mockPlaceOrder).toHaveBeenCalled();

      // Should NOT mark as MARKET_CLOSING_SOON
      expect(mockUpdateBetStatus).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'MARKET_CLOSING_SOON'
      );
    });

    it('should allow bets at exactly 24 hour boundary', async () => {
      // Market closes in 24 hours + 1 minute (account for timing drift between setup and execution)
      // The check is < 24, so >= 24 hours is allowed
      mockFetchMarket.mockResolvedValue({
        conditionId: 'condition-1',
        active: true,
        closed: false,
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 1000).toISOString(),
        liquidityNum: 10000,
      } as any);

      const bet = createTestBet();
      await executeBet(bet);

      // Should place order (24h is the boundary, >= 24 is allowed)
      expect(mockPlaceOrder).toHaveBeenCalled();
    });
  });

  describe('closed market handling', () => {
    it('should skip bet when market is closed', async () => {
      mockFetchMarket.mockResolvedValue({
        conditionId: 'condition-1',
        active: false,
        closed: true,
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      } as any);

      const bet = createTestBet();
      await executeBet(bet);

      // Should NOT place order
      expect(mockPlaceOrder).not.toHaveBeenCalled();

      // Should mark as MARKET_CLOSED
      expect(mockUpdateBetStatus).toHaveBeenCalledWith(
        'chain-1',
        '0xuser',
        1,
        'MARKET_CLOSED'
      );
    });

    it('should skip bet when market not found', async () => {
      mockFetchMarket.mockResolvedValue(null);

      const bet = createTestBet();
      await executeBet(bet);

      // Should NOT place order
      expect(mockPlaceOrder).not.toHaveBeenCalled();

      // Should mark as MARKET_CLOSED
      expect(mockUpdateBetStatus).toHaveBeenCalledWith(
        'chain-1',
        '0xuser',
        1,
        'MARKET_CLOSED'
      );
    });
  });
});
