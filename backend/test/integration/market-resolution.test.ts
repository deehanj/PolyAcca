/**
 * Integration Tests for Market Resolution Handler Bug Fixes
 *
 * These tests import the actual types and test the real logic flow
 * by mocking the external dependencies (DynamoDB, Polymarket API).
 */

import type { DynamoDBRecord } from 'aws-lambda';
import { marshall } from '@aws-sdk/util-dynamodb';
import type {
  MarketEntity,
  BetEntity,
  UserChainEntity,
  MarketOutcome,
  BetStatus,
  MarketStatus,
} from '../../lambdas/shared/types';

// Mock external dependencies before importing the handler
jest.mock('../../lambdas/shared/dynamo-client', () => ({
  getBetsByCondition: jest.fn(),
  getChain: jest.fn(),
  getUserChain: jest.fn(),
  updateBetStatus: jest.fn(),
  updateUserChainStatus: jest.fn(),
  getBet: jest.fn(),
  getUser: jest.fn(),
}));

jest.mock('../../lambdas/shared/polymarket-client', () => ({
  fetchOrderStatus: jest.fn(),
  decryptEmbeddedWalletCredentials: jest.fn(),
}));

jest.mock('../../lambdas/shared/embedded-wallet-credentials', () => ({
  getEmbeddedWalletCredentials: jest.fn(),
}));

jest.mock('../../lambdas/shared/platform-fee', () => ({
  collectPlatformFee: jest.fn(),
}));

jest.mock('../../lambdas/shared/gamma-client', () => ({
  fetchMarketByConditionId: jest.fn(),
}));

jest.mock('../../lambdas/shared/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    errorWithStack: jest.fn(),
  }),
}));

// Mock ethers
jest.mock('ethers', () => ({
  JsonRpcProvider: jest.fn().mockImplementation(() => ({
    getBlockNumber: jest.fn().mockResolvedValue(12345678),
  })),
  Contract: jest.fn().mockImplementation(() => ({
    filters: { Transfer: jest.fn() },
    queryFilter: jest.fn().mockResolvedValue([]),
  })),
  formatUnits: jest.fn().mockReturnValue('100.00'),
}));

// Import mocked modules
import {
  getBetsByCondition,
  getChain,
  getUserChain,
  updateBetStatus,
  updateUserChainStatus,
  getUser,
} from '../../lambdas/shared/dynamo-client';

import { fetchOrderStatus, decryptEmbeddedWalletCredentials } from '../../lambdas/shared/polymarket-client';
import { getEmbeddedWalletCredentials } from '../../lambdas/shared/embedded-wallet-credentials';

// Import the handler
import { handler } from '../../lambdas/streams/market-resolution-handler';

// Marshall options to handle undefined values
const marshallOptions = { removeUndefinedValues: true };

// Helper to create a DynamoDB stream record
function createMarketResolutionRecord(
  newMarket: Partial<MarketEntity>,
  oldMarket?: Partial<MarketEntity>
): DynamoDBRecord {
  const newImage = {
    PK: `MARKET#${newMarket.conditionId}`,
    SK: 'MARKET',
    entityType: 'MARKET',
    conditionId: newMarket.conditionId,
    questionId: newMarket.questionId ?? 'q-123',
    question: newMarket.question ?? 'Test question?',
    yesTokenId: newMarket.yesTokenId ?? 'yes-token',
    noTokenId: newMarket.noTokenId ?? 'no-token',
    status: newMarket.status ?? 'RESOLVED',
    outcome: newMarket.outcome,
    endDate: newMarket.endDate ?? '2024-12-31T00:00:00Z',
    lastSyncedAt: '2024-01-01T00:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
  };

  const record: DynamoDBRecord = {
    eventName: 'MODIFY',
    dynamodb: {
      NewImage: marshall(newImage, marshallOptions) as any,
    },
  };

  if (oldMarket) {
    const oldImage = {
      ...newImage,
      status: oldMarket.status ?? 'ACTIVE',
      outcome: oldMarket.outcome,
      updatedAt: '2024-01-01T00:00:00Z',
    };
    record.dynamodb!.OldImage = marshall(oldImage, marshallOptions) as any;
  }

  return record;
}

// Helper to create bet entity
function createBet(overrides: Partial<BetEntity>): BetEntity {
  return {
    PK: `CHAIN#${overrides.chainId ?? 'chain-123'}`,
    SK: `BET#${overrides.walletAddress ?? '0x123'}#001`,
    entityType: 'BET',
    betId: overrides.betId ?? 'bet-123',
    chainId: overrides.chainId ?? 'chain-123',
    walletAddress: overrides.walletAddress ?? '0x123',
    sequence: overrides.sequence ?? 1,
    conditionId: overrides.conditionId ?? 'cond-123',
    tokenId: overrides.tokenId ?? 'token-123',
    marketQuestion: overrides.marketQuestion ?? 'Test question?',
    side: overrides.side ?? 'YES',
    targetPrice: overrides.targetPrice ?? '0.50',
    stake: overrides.stake ?? '100.00',
    potentialPayout: overrides.potentialPayout ?? '200.00',
    status: overrides.status ?? 'FILLED',
    orderId: overrides.orderId,
    fillPrice: overrides.fillPrice,
    sharesAcquired: overrides.sharesAcquired,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as BetEntity;
}

// Helper to create user chain entity
function createUserChain(overrides: Partial<UserChainEntity>): UserChainEntity {
  return {
    PK: `CHAIN#${overrides.chainId ?? 'chain-123'}`,
    SK: `USER#${overrides.walletAddress ?? '0x123'}`,
    entityType: 'USER_CHAIN',
    chainId: overrides.chainId ?? 'chain-123',
    walletAddress: overrides.walletAddress ?? '0x123',
    initialStake: overrides.initialStake ?? '100.00',
    currentValue: overrides.currentValue ?? '100.00',
    completedLegs: overrides.completedLegs ?? 0,
    currentLegSequence: overrides.currentLegSequence ?? 1,
    status: overrides.status ?? 'ACTIVE',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as UserChainEntity;
}

describe('Market Resolution Handler - Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Bug Fix #1: PLACED bets should be rechecked and settled', () => {
    it('should recheck PLACED bet order status and settle if filled', async () => {
      const conditionId = 'cond-placed-test';
      const walletAddress = '0xplaced123';

      // Setup: Market resolves as YES
      const record = createMarketResolutionRecord(
        { conditionId, status: 'RESOLVED', outcome: 'YES' },
        { conditionId, status: 'ACTIVE' }
      );

      // Setup: One PLACED bet (not yet confirmed filled)
      const placedBet = createBet({
        betId: 'bet-placed',
        conditionId,
        walletAddress,
        status: 'PLACED',
        orderId: 'order-123',
        side: 'YES',
      });

      (getBetsByCondition as jest.Mock).mockResolvedValue([placedBet]);
      (getUser as jest.Mock).mockResolvedValue({ embeddedWalletAddress: '0xembedded' });
      (getEmbeddedWalletCredentials as jest.Mock).mockResolvedValue({
        encryptedApiKey: 'enc-key',
        encryptedApiSecret: 'enc-secret',
        encryptedPassphrase: 'enc-pass',
        signatureType: 'EOA',
      });
      (decryptEmbeddedWalletCredentials as jest.Mock).mockResolvedValue({
        apiKey: 'key',
        apiSecret: 'secret',
        passphrase: 'pass',
      });

      // The order is actually filled when we recheck
      (fetchOrderStatus as jest.Mock).mockResolvedValue({
        filled: true,
        fillPrice: '0.48',
        filledSize: '208.33',
      });

      (getChain as jest.Mock).mockResolvedValue({ legs: [{ sequence: 1 }] });
      (getUserChain as jest.Mock).mockResolvedValue(createUserChain({ walletAddress }));

      // Execute
      await handler({ Records: [record] });

      // Verify: Bet was updated to FILLED first
      expect(updateBetStatus).toHaveBeenCalledWith(
        placedBet.chainId,
        walletAddress,
        1,
        'FILLED',
        expect.objectContaining({
          fillPrice: '0.48',
          sharesAcquired: '208.33',
        })
      );

      // Verify: Bet was then settled
      expect(updateBetStatus).toHaveBeenCalledWith(
        placedBet.chainId,
        walletAddress,
        1,
        'SETTLED',
        expect.objectContaining({
          outcome: 'WON',
        })
      );
    });

    it('should mark stuck PLACED bet as EXECUTION_ERROR if still not filled', async () => {
      const conditionId = 'cond-stuck-test';
      const walletAddress = '0xstuck123';

      const record = createMarketResolutionRecord(
        { conditionId, status: 'RESOLVED', outcome: 'YES' },
        { conditionId, status: 'ACTIVE' }
      );

      const stuckBet = createBet({
        betId: 'bet-stuck',
        conditionId,
        walletAddress,
        status: 'PLACED',
        orderId: 'order-stuck',
      });

      (getBetsByCondition as jest.Mock).mockResolvedValue([stuckBet]);
      (getEmbeddedWalletCredentials as jest.Mock).mockResolvedValue({
        encryptedApiKey: 'enc-key',
        encryptedApiSecret: 'enc-secret',
        encryptedPassphrase: 'enc-pass',
        signatureType: 'EOA',
      });
      (decryptEmbeddedWalletCredentials as jest.Mock).mockResolvedValue({
        apiKey: 'key',
        apiSecret: 'secret',
        passphrase: 'pass',
      });

      // Order is NOT filled
      (fetchOrderStatus as jest.Mock).mockResolvedValue({
        filled: false,
        status: 'OPEN',
      });

      await handler({ Records: [record] });

      // Verify: Bet marked as EXECUTION_ERROR
      expect(updateBetStatus).toHaveBeenCalledWith(
        stuckBet.chainId,
        walletAddress,
        1,
        'EXECUTION_ERROR',
        expect.any(Object)
      );

      // Verify: Chain marked as FAILED
      expect(updateUserChainStatus).toHaveBeenCalledWith(
        stuckBet.chainId,
        walletAddress,
        'FAILED',
        expect.any(Object)
      );
    });
  });

  describe('Bug Fix #2: VOID outcome should void all bets', () => {
    it('should void all active bets when market outcome is VOID', async () => {
      const conditionId = 'cond-void-test';

      const record = createMarketResolutionRecord(
        { conditionId, status: 'RESOLVED', outcome: 'VOID' },
        { conditionId, status: 'ACTIVE' }
      );

      const filledBet = createBet({ betId: 'bet-1', conditionId, status: 'FILLED', walletAddress: '0x111' });
      const placedBet = createBet({ betId: 'bet-2', conditionId, status: 'PLACED', walletAddress: '0x222' });

      (getBetsByCondition as jest.Mock).mockResolvedValue([filledBet, placedBet]);
      (getUserChain as jest.Mock).mockResolvedValue(createUserChain({}));

      await handler({ Records: [record] });

      // Verify: Both bets marked as VOIDED
      expect(updateBetStatus).toHaveBeenCalledWith(
        filledBet.chainId,
        '0x111',
        1,
        'VOIDED',
        expect.any(Object)
      );
      expect(updateBetStatus).toHaveBeenCalledWith(
        placedBet.chainId,
        '0x222',
        1,
        'VOIDED',
        expect.any(Object)
      );

      // Verify: Both chains marked as FAILED
      expect(updateUserChainStatus).toHaveBeenCalledWith(
        filledBet.chainId,
        '0x111',
        'FAILED',
        expect.any(Object)
      );
    });
  });

  describe('Bug Fix #3: CANCELLED markets should be treated as VOID', () => {
    it('should treat CANCELLED market same as VOID outcome', async () => {
      const conditionId = 'cond-cancelled-test';

      // Note: CANCELLED status, no outcome set
      const record = createMarketResolutionRecord(
        { conditionId, status: 'CANCELLED' },
        { conditionId, status: 'ACTIVE' }
      );

      const bet = createBet({ betId: 'bet-cancelled', conditionId, status: 'FILLED' });

      (getBetsByCondition as jest.Mock).mockResolvedValue([bet]);
      (getUserChain as jest.Mock).mockResolvedValue(createUserChain({}));

      await handler({ Records: [record] });

      // Verify: Bet marked as VOIDED (same as VOID outcome)
      expect(updateBetStatus).toHaveBeenCalledWith(
        bet.chainId,
        bet.walletAddress,
        1,
        'VOIDED',
        expect.any(Object)
      );

      // Verify: Chain marked as FAILED
      expect(updateUserChainStatus).toHaveBeenCalledWith(
        bet.chainId,
        bet.walletAddress,
        'FAILED',
        expect.any(Object)
      );
    });
  });

  describe('Status transition detection', () => {
    it('should NOT re-process already RESOLVED market', async () => {
      const conditionId = 'cond-reprocess-test';

      // RESOLVED -> RESOLVED (e.g., just updating other fields)
      const record = createMarketResolutionRecord(
        { conditionId, status: 'RESOLVED', outcome: 'YES' },
        { conditionId, status: 'RESOLVED', outcome: 'YES' }
      );

      await handler({ Records: [record] });

      // Should not query for bets - skipped early
      expect(getBetsByCondition).not.toHaveBeenCalled();
    });

    it('should process ACTIVE -> RESOLVED transition', async () => {
      const conditionId = 'cond-transition-test';

      const record = createMarketResolutionRecord(
        { conditionId, status: 'RESOLVED', outcome: 'NO' },
        { conditionId, status: 'ACTIVE' }
      );

      (getBetsByCondition as jest.Mock).mockResolvedValue([]);

      await handler({ Records: [record] });

      // Should query for bets
      expect(getBetsByCondition).toHaveBeenCalledWith(conditionId);
    });
  });

  describe('Normal YES/NO outcomes still work', () => {
    it('should settle FILLED bet as WON when bet side matches outcome', async () => {
      const conditionId = 'cond-normal-win';
      const walletAddress = '0xwinner';

      const record = createMarketResolutionRecord(
        { conditionId, status: 'RESOLVED', outcome: 'YES' },
        { conditionId, status: 'ACTIVE' }
      );

      const winningBet = createBet({
        conditionId,
        walletAddress,
        status: 'FILLED',
        side: 'YES',
        sharesAcquired: '200.00',
      });

      (getBetsByCondition as jest.Mock).mockResolvedValue([winningBet]);
      (getUser as jest.Mock).mockResolvedValue({ embeddedWalletAddress: '0xembedded' });
      (getChain as jest.Mock).mockResolvedValue({ legs: [{ sequence: 1 }] });
      (getUserChain as jest.Mock).mockResolvedValue(createUserChain({ walletAddress }));

      await handler({ Records: [record] });

      // Verify: Bet settled as WON
      expect(updateBetStatus).toHaveBeenCalledWith(
        winningBet.chainId,
        walletAddress,
        1,
        'SETTLED',
        expect.objectContaining({
          outcome: 'WON',
          actualPayout: '200.00',
        })
      );
    });

    it('should settle FILLED bet as LOST when bet side does not match outcome', async () => {
      const conditionId = 'cond-normal-loss';
      const walletAddress = '0xloser';

      const record = createMarketResolutionRecord(
        { conditionId, status: 'RESOLVED', outcome: 'NO' },
        { conditionId, status: 'ACTIVE' }
      );

      const losingBet = createBet({
        conditionId,
        walletAddress,
        status: 'FILLED',
        side: 'YES', // Bet YES but NO won
      });

      (getBetsByCondition as jest.Mock).mockResolvedValue([losingBet]);
      (getUser as jest.Mock).mockResolvedValue({ embeddedWalletAddress: '0xembedded' });
      (getChain as jest.Mock).mockResolvedValue({ legs: [{ sequence: 1 }] });
      (getUserChain as jest.Mock).mockResolvedValue(createUserChain({ walletAddress }));

      await handler({ Records: [record] });

      // Verify: Bet settled as LOST
      expect(updateBetStatus).toHaveBeenCalledWith(
        losingBet.chainId,
        walletAddress,
        1,
        'SETTLED',
        expect.objectContaining({
          outcome: 'LOST',
          actualPayout: '0',
        })
      );

      // Verify: Chain marked as LOST
      expect(updateUserChainStatus).toHaveBeenCalledWith(
        losingBet.chainId,
        walletAddress,
        'LOST',
        expect.any(Object)
      );
    });
  });
});
