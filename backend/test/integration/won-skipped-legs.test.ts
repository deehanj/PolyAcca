/**
 * Tests for wonLegs/skippedLegs tracking and fee collection failure alerting
 */

import type { DynamoDBRecord } from 'aws-lambda';
import { marshall } from '@aws-sdk/util-dynamodb';
import type {
  MarketEntity,
  BetEntity,
  UserChainEntity,
} from '../../lambdas/shared/types';

// Mock external dependencies
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

import {
  getBetsByCondition,
  getChain,
  getUserChain,
  updateBetStatus,
  updateUserChainStatus,
  getUser,
  getBet,
} from '../../lambdas/shared/dynamo-client';

import { collectPlatformFee } from '../../lambdas/shared/platform-fee';
import { fetchMarketByConditionId } from '../../lambdas/shared/gamma-client';
import { handler } from '../../lambdas/streams/market-resolution-handler';

const marshallOptions = { removeUndefinedValues: true };

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
    wonLegs: overrides.wonLegs ?? 0,
    skippedLegs: overrides.skippedLegs ?? 0,
    currentLegSequence: overrides.currentLegSequence ?? 1,
    status: overrides.status ?? 'ACTIVE',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as UserChainEntity;
}

describe('wonLegs and skippedLegs tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('When bet wins and no skips', () => {
    it('should increment wonLegs but not skippedLegs', async () => {
      const conditionId = 'cond-win-test';
      const walletAddress = '0xwinner';

      const record = createMarketResolutionRecord(
        { conditionId, status: 'RESOLVED', outcome: 'YES' },
        { conditionId, status: 'ACTIVE' }
      );

      const winningBet = createBet({
        conditionId,
        walletAddress,
        sequence: 1,
        status: 'FILLED',
        side: 'YES',
        sharesAcquired: '200.00',
      });

      (getBetsByCondition as jest.Mock).mockResolvedValue([winningBet]);
      (getUser as jest.Mock).mockResolvedValue({ embeddedWalletAddress: '0xembedded' });
      (getChain as jest.Mock).mockResolvedValue({ legs: [{ sequence: 1 }] }); // Single leg chain
      (getUserChain as jest.Mock).mockResolvedValue(createUserChain({
        walletAddress,
        wonLegs: 0,
        skippedLegs: 0,
      }));

      await handler({ Records: [record] });

      // Verify wonLegs is 1, skippedLegs stays 0
      expect(updateUserChainStatus).toHaveBeenCalledWith(
        winningBet.chainId,
        walletAddress,
        'WON',
        expect.objectContaining({
          wonLegs: 1,
          skippedLegs: 0,
        })
      );
    });
  });

  describe('When bet wins and then advances to next with no skips', () => {
    it('should increment wonLegs for the winning bet', async () => {
      const conditionId = 'cond-advance-test';
      const walletAddress = '0xadvancer';

      const record = createMarketResolutionRecord(
        { conditionId, status: 'RESOLVED', outcome: 'YES' },
        { conditionId, status: 'ACTIVE' }
      );

      const winningBet = createBet({
        conditionId,
        walletAddress,
        sequence: 1,
        status: 'FILLED',
        side: 'YES',
        sharesAcquired: '200.00',
      });

      const nextBet = createBet({
        conditionId: 'cond-next',
        walletAddress,
        sequence: 2,
        status: 'QUEUED',
      });

      (getBetsByCondition as jest.Mock).mockResolvedValue([winningBet]);
      (getUser as jest.Mock).mockResolvedValue({ embeddedWalletAddress: '0xembedded' });
      (getChain as jest.Mock).mockResolvedValue({
        legs: [{ sequence: 1 }, { sequence: 2 }],
      });
      (getUserChain as jest.Mock).mockResolvedValue(createUserChain({
        walletAddress,
        wonLegs: 0,
        skippedLegs: 0,
      }));
      (getBet as jest.Mock).mockResolvedValue(nextBet);
      (fetchMarketByConditionId as jest.Mock).mockResolvedValue({
        active: true,
        closed: false,
        endDate: '2025-12-31T00:00:00Z',
      });

      await handler({ Records: [record] });

      // Verify wonLegs is 1, skippedLegs stays 0
      expect(updateUserChainStatus).toHaveBeenCalledWith(
        winningBet.chainId,
        walletAddress,
        'ACTIVE',
        expect.objectContaining({
          wonLegs: 1,
          skippedLegs: 0,
        })
      );
    });
  });

  describe('When bet wins and next markets are closed (skipping)', () => {
    it('should track skippedLegs when markets are closed', async () => {
      const conditionId = 'cond-skip-test';
      const walletAddress = '0xskipper';

      const record = createMarketResolutionRecord(
        { conditionId, status: 'RESOLVED', outcome: 'YES' },
        { conditionId, status: 'ACTIVE' }
      );

      const winningBet = createBet({
        conditionId,
        walletAddress,
        sequence: 1,
        status: 'FILLED',
        side: 'YES',
        sharesAcquired: '200.00',
      });

      const closedMarketBet = createBet({
        conditionId: 'cond-closed',
        walletAddress,
        sequence: 2,
        status: 'QUEUED',
      });

      const activeMarketBet = createBet({
        conditionId: 'cond-active',
        walletAddress,
        sequence: 3,
        status: 'QUEUED',
      });

      (getBetsByCondition as jest.Mock).mockResolvedValue([winningBet]);
      (getUser as jest.Mock).mockResolvedValue({ embeddedWalletAddress: '0xembedded' });
      (getChain as jest.Mock).mockResolvedValue({
        legs: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }],
      });
      (getUserChain as jest.Mock).mockResolvedValue(createUserChain({
        walletAddress,
        wonLegs: 0,
        skippedLegs: 0,
      }));

      // First getBet returns the closed market bet, second returns active market bet
      (getBet as jest.Mock)
        .mockResolvedValueOnce(closedMarketBet)
        .mockResolvedValueOnce(activeMarketBet);

      // First market is closed, second is active
      (fetchMarketByConditionId as jest.Mock)
        .mockResolvedValueOnce({ active: false, closed: true })
        .mockResolvedValueOnce({ active: true, closed: false, endDate: '2025-12-31T00:00:00Z' });

      await handler({ Records: [record] });

      // Should have skipped 1 bet (sequence 2) and advanced to sequence 3
      // wonLegs should be 1 (bet won), skippedLegs should be 1 (one market was closed)
      expect(updateUserChainStatus).toHaveBeenCalledWith(
        winningBet.chainId,
        walletAddress,
        'ACTIVE',
        expect.objectContaining({
          wonLegs: 1,
          skippedLegs: 1,
          currentLegSequence: 3,
        })
      );
    });
  });

  describe('When bet loses', () => {
    it('should preserve wonLegs and skippedLegs on loss', async () => {
      const conditionId = 'cond-loss-test';
      const walletAddress = '0xloser';

      const record = createMarketResolutionRecord(
        { conditionId, status: 'RESOLVED', outcome: 'NO' },
        { conditionId, status: 'ACTIVE' }
      );

      const losingBet = createBet({
        conditionId,
        walletAddress,
        sequence: 3,
        status: 'FILLED',
        side: 'YES', // Bet YES but NO won
      });

      (getBetsByCondition as jest.Mock).mockResolvedValue([losingBet]);
      (getUser as jest.Mock).mockResolvedValue({ embeddedWalletAddress: '0xembedded' });
      (getChain as jest.Mock).mockResolvedValue({
        legs: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }],
      });
      // User had 2 wins and 0 skips before this loss
      (getUserChain as jest.Mock).mockResolvedValue(createUserChain({
        walletAddress,
        wonLegs: 2,
        skippedLegs: 0,
      }));

      await handler({ Records: [record] });

      // Should preserve wonLegs=2, skippedLegs=0 (no change since bet lost, not won)
      expect(updateUserChainStatus).toHaveBeenCalledWith(
        losingBet.chainId,
        walletAddress,
        'LOST',
        expect.objectContaining({
          wonLegs: 2, // Preserved
          skippedLegs: 0, // Preserved
        })
      );
    });
  });
});

describe('Fee collection failure alerting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should set feeCollectionFailed=true when fee collection fails', async () => {
    const conditionId = 'cond-fee-fail';
    const walletAddress = '0xfeefail';

    const record = createMarketResolutionRecord(
      { conditionId, status: 'RESOLVED', outcome: 'YES' },
      { conditionId, status: 'ACTIVE' }
    );

    const winningBet = createBet({
      conditionId,
      walletAddress,
      sequence: 2, // Last bet in 2-leg chain
      status: 'FILLED',
      side: 'YES',
      sharesAcquired: '400.00',
    });

    (getBetsByCondition as jest.Mock).mockResolvedValue([winningBet]);
    (getUser as jest.Mock).mockResolvedValue({ embeddedWalletAddress: '0xembedded' });
    (getChain as jest.Mock).mockResolvedValue({
      legs: [{ sequence: 1 }, { sequence: 2 }], // 2 legs = fee applies
    });
    (getUserChain as jest.Mock).mockResolvedValue(createUserChain({
      walletAddress,
      wonLegs: 1,
      skippedLegs: 0,
      initialStake: '100.00',
    }));

    // Fee collection fails
    (collectPlatformFee as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Insufficient balance for fee',
    });

    await handler({ Records: [record] });

    // Should mark chain as WON but with fee collection failed
    expect(updateUserChainStatus).toHaveBeenCalledWith(
      winningBet.chainId,
      walletAddress,
      'WON',
      expect.objectContaining({
        feeCollectionFailed: true,
        feeCollectionError: 'Insufficient balance for fee',
      })
    );
  });

  it('should set feeCollectionFailed=true when fee collection throws exception', async () => {
    const conditionId = 'cond-fee-throw';
    const walletAddress = '0xfeethrow';

    const record = createMarketResolutionRecord(
      { conditionId, status: 'RESOLVED', outcome: 'YES' },
      { conditionId, status: 'ACTIVE' }
    );

    const winningBet = createBet({
      conditionId,
      walletAddress,
      sequence: 2,
      status: 'FILLED',
      side: 'YES',
      sharesAcquired: '400.00',
    });

    (getBetsByCondition as jest.Mock).mockResolvedValue([winningBet]);
    (getUser as jest.Mock).mockResolvedValue({ embeddedWalletAddress: '0xembedded' });
    (getChain as jest.Mock).mockResolvedValue({
      legs: [{ sequence: 1 }, { sequence: 2 }],
    });
    (getUserChain as jest.Mock).mockResolvedValue(createUserChain({
      walletAddress,
      wonLegs: 1,
      skippedLegs: 0,
      initialStake: '100.00',
    }));

    // Fee collection throws
    (collectPlatformFee as jest.Mock).mockRejectedValue(new Error('Network timeout'));

    await handler({ Records: [record] });

    expect(updateUserChainStatus).toHaveBeenCalledWith(
      winningBet.chainId,
      walletAddress,
      'WON',
      expect.objectContaining({
        feeCollectionFailed: true,
        feeCollectionError: 'Network timeout',
      })
    );
  });

  it('should set feeCollectionFailed=true when user has no embedded wallet', async () => {
    const conditionId = 'cond-no-wallet';
    const walletAddress = '0xnowallet';

    const record = createMarketResolutionRecord(
      { conditionId, status: 'RESOLVED', outcome: 'YES' },
      { conditionId, status: 'ACTIVE' }
    );

    const winningBet = createBet({
      conditionId,
      walletAddress,
      sequence: 2,
      status: 'FILLED',
      side: 'YES',
      sharesAcquired: '400.00',
    });

    (getBetsByCondition as jest.Mock).mockResolvedValue([winningBet]);
    // User has NO embedded wallet
    (getUser as jest.Mock).mockResolvedValue({ embeddedWalletAddress: null });
    (getChain as jest.Mock).mockResolvedValue({
      legs: [{ sequence: 1 }, { sequence: 2 }],
    });
    (getUserChain as jest.Mock).mockResolvedValue(createUserChain({
      walletAddress,
      wonLegs: 1,
      skippedLegs: 0,
    }));

    await handler({ Records: [record] });

    expect(updateUserChainStatus).toHaveBeenCalledWith(
      winningBet.chainId,
      walletAddress,
      'WON',
      expect.objectContaining({
        feeCollectionFailed: true,
        feeCollectionError: 'User has no embedded wallet',
      })
    );
  });

  it('should NOT set feeCollectionFailed when fee collection succeeds', async () => {
    const conditionId = 'cond-fee-success';
    const walletAddress = '0xfeesuccess';

    const record = createMarketResolutionRecord(
      { conditionId, status: 'RESOLVED', outcome: 'YES' },
      { conditionId, status: 'ACTIVE' }
    );

    const winningBet = createBet({
      conditionId,
      walletAddress,
      sequence: 2,
      status: 'FILLED',
      side: 'YES',
      sharesAcquired: '400.00',
    });

    (getBetsByCondition as jest.Mock).mockResolvedValue([winningBet]);
    (getUser as jest.Mock).mockResolvedValue({ embeddedWalletAddress: '0xembedded' });
    (getChain as jest.Mock).mockResolvedValue({
      legs: [{ sequence: 1 }, { sequence: 2 }],
    });
    (getUserChain as jest.Mock).mockResolvedValue(createUserChain({
      walletAddress,
      wonLegs: 1,
      skippedLegs: 0,
      initialStake: '100.00',
    }));

    // Fee collection succeeds
    (collectPlatformFee as jest.Mock).mockResolvedValue({
      success: true,
      feeAmount: '6.00',
      txHash: '0xfeetx123',
    });

    await handler({ Records: [record] });

    // Should NOT have feeCollectionFailed set (or it should be undefined/falsy)
    expect(updateUserChainStatus).toHaveBeenCalledWith(
      winningBet.chainId,
      walletAddress,
      'WON',
      expect.objectContaining({
        platformFee: '6.00',
        platformFeeTxHash: '0xfeetx123',
      })
    );

    // Verify feeCollectionFailed is NOT true
    const calls = (updateUserChainStatus as jest.Mock).mock.calls;
    const wonCall = calls.find((c: any[]) => c[2] === 'WON');
    expect(wonCall[3].feeCollectionFailed).toBeFalsy();
  });

  it('should NOT apply fee for single-leg chains', async () => {
    const conditionId = 'cond-single-leg';
    const walletAddress = '0xsingleleg';

    const record = createMarketResolutionRecord(
      { conditionId, status: 'RESOLVED', outcome: 'YES' },
      { conditionId, status: 'ACTIVE' }
    );

    const winningBet = createBet({
      conditionId,
      walletAddress,
      sequence: 1,
      status: 'FILLED',
      side: 'YES',
      sharesAcquired: '200.00',
    });

    (getBetsByCondition as jest.Mock).mockResolvedValue([winningBet]);
    (getUser as jest.Mock).mockResolvedValue({ embeddedWalletAddress: '0xembedded' });
    (getChain as jest.Mock).mockResolvedValue({
      legs: [{ sequence: 1 }], // Single leg - no fee
    });
    (getUserChain as jest.Mock).mockResolvedValue(createUserChain({
      walletAddress,
      wonLegs: 0,
      skippedLegs: 0,
    }));

    await handler({ Records: [record] });

    // collectPlatformFee should NOT be called for single-leg chains
    expect(collectPlatformFee).not.toHaveBeenCalled();

    // feeCollectionFailed should not be set
    const calls = (updateUserChainStatus as jest.Mock).mock.calls;
    const wonCall = calls.find((c: any[]) => c[2] === 'WON');
    expect(wonCall[3].feeCollectionFailed).toBeFalsy();
  });
});
