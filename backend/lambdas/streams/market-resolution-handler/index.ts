/**
 * Market Resolution Handler
 *
 * Triggered when a market status changes to RESOLVED.
 * Settles all bets on that market and triggers next actions:
 * - If bet WON and more bets: Mark next bet READY
 * - If bet WON and last bet: Mark position WON, trigger payout
 * - If bet LOST: Mark position LOST
 */

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { JsonRpcProvider, Contract, formatUnits, EventLog } from 'ethers';
import {
  getBetsByCondition,
  getChain,
  getUserChain,
  updateBetStatus,
  updateUserChainStatus,
  getBet,
  getUser,
} from '../../shared/dynamo-client';
import { createLogger } from '../../shared/logger';
import { collectPlatformFee } from '../../shared/platform-fee';
import { toMicroUsdc, fromMicroUsdc, calculateShares } from '../../shared/usdc-math';
import type { MarketEntity, BetEntity } from '../../shared/types';

const log = createLogger('market-resolution-handler');

// Polygon configuration for redemption verification
const POLYGON_RPC_URL = 'https://polygon-rpc.com';
const POLYGON_CHAIN_ID = 137;
const USDC_CONTRACT_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e on Polygon

// Polymarket contracts that send redemption payouts
const CTF_CONTRACT_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const EXCHANGE_CONTRACT_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

// ERC20 Transfer event ABI
const ERC20_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

/**
 * Determine if a bet won based on market outcome and bet side
 */
function didBetWin(bet: BetEntity, marketOutcome: 'YES' | 'NO'): boolean {
  return bet.side === marketOutcome;
}

/**
 * Calculate actual payout for a winning bet
 * Winner gets $1 per share held
 *
 * Uses sharesAcquired if available (actual fill data from bet execution),
 * otherwise falls back to calculating from stake/targetPrice
 */
function calculateExpectedPayout(bet: BetEntity): string {
  // If we have actual shares acquired from the fill, use that
  // Each share = $1 on win
  if (bet.sharesAcquired) {
    log.debug('Using sharesAcquired for payout', {
      betId: bet.betId,
      sharesAcquired: bet.sharesAcquired,
    });
    return bet.sharesAcquired;
  }

  // Fallback: calculate from stake / fillPrice (or targetPrice)
  const price = bet.fillPrice ?? bet.targetPrice;
  const stakeMicro = toMicroUsdc(bet.stake);
  const priceMicro = toMicroUsdc(price);
  const sharesMicro = calculateShares(stakeMicro, priceMicro);

  log.debug('Calculated payout from stake/price', {
    betId: bet.betId,
    stake: bet.stake,
    price,
    calculatedShares: fromMicroUsdc(sharesMicro),
  });

  return fromMicroUsdc(sharesMicro);
}

/**
 * Verify redemption payout by checking for USDC transfers from CTF/Exchange
 * to the embedded wallet within a block range (timeboxed lookup)
 *
 * @returns The verified payout amount, or null if no matching transfer found
 */
async function verifyRedemptionPayout(
  embeddedWalletAddress: string,
  fromBlock: number,
  expectedPayout: string
): Promise<{ verified: boolean; actualPayout?: string; txHash?: string }> {
  try {
    const provider = new JsonRpcProvider(POLYGON_RPC_URL, { chainId: POLYGON_CHAIN_ID, name: 'polygon' });
    const currentBlock = await provider.getBlockNumber();

    // Search from fillBlockNumber to current block
    // Add some buffer blocks in case of reorgs
    const searchFromBlock = Math.max(0, fromBlock - 10);

    log.info('Verifying redemption payout', {
      embeddedWalletAddress,
      fromBlock: searchFromBlock,
      toBlock: currentBlock,
      expectedPayout,
    });

    const usdcContract = new Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, provider);

    // Query Transfer events TO the embedded wallet FROM CTF or Exchange contracts
    const filter = usdcContract.filters.Transfer(
      null, // from any (we'll filter below)
      embeddedWalletAddress // to embedded wallet
    );

    const events = await usdcContract.queryFilter(filter, searchFromBlock, currentBlock);

    // Filter to only transfers from CTF or Exchange contracts
    const redemptionSources = new Set([
      CTF_CONTRACT_ADDRESS.toLowerCase(),
      EXCHANGE_CONTRACT_ADDRESS.toLowerCase(),
    ]);

    // Filter to EventLog with args and only from CTF or Exchange contracts
    const redemptionEvents = events.filter((event): event is EventLog => {
      if (!('args' in event)) return false;
      const from = event.args?.from?.toLowerCase();
      return from && redemptionSources.has(from);
    });

    if (redemptionEvents.length === 0) {
      log.warn('No redemption transfer found', {
        embeddedWalletAddress,
        fromBlock: searchFromBlock,
        toBlock: currentBlock,
      });
      return { verified: false };
    }

    // Sum all redemption transfers (in case of multiple)
    let totalPayoutWei = 0n;
    let latestTxHash: string | undefined;

    for (const event of redemptionEvents) {
      const value = event.args?.value;
      if (value) {
        totalPayoutWei = totalPayoutWei + BigInt(value);
        latestTxHash = event.transactionHash;
      }
    }

    const actualPayout = formatUnits(totalPayoutWei, 6); // USDC has 6 decimals

    log.info('Redemption transfer verified', {
      embeddedWalletAddress,
      expectedPayout,
      actualPayout,
      txHash: latestTxHash,
      transferCount: redemptionEvents.length,
    });

    // Check if actual matches expected (with some tolerance for rounding)
    const expectedMicro = toMicroUsdc(expectedPayout);
    const actualMicro = toMicroUsdc(actualPayout);
    const difference = expectedMicro > actualMicro
      ? expectedMicro - actualMicro
      : actualMicro - expectedMicro;

    // Allow 0.01 USDC tolerance for rounding differences
    const tolerance = 10000n; // 0.01 USDC in micro
    if (difference > tolerance) {
      log.warn('Payout mismatch detected', {
        embeddedWalletAddress,
        expectedPayout,
        actualPayout,
        difference: fromMicroUsdc(difference),
      });
    }

    return {
      verified: true,
      actualPayout,
      txHash: latestTxHash,
    };
  } catch (error) {
    log.errorWithStack('Failed to verify redemption payout', error, {
      embeddedWalletAddress,
      fromBlock,
    });
    // Non-fatal - return unverified and use expected payout
    return { verified: false };
  }
}

/**
 * Process a single bet settlement
 *
 * For winning bets:
 * 1. Calculate expected payout from shares
 * 2. If fillBlockNumber available, verify redemption transfer on-chain
 * 3. Use verified payout if available, otherwise use expected payout
 */
async function settleBet(
  bet: BetEntity,
  marketOutcome: 'YES' | 'NO',
  embeddedWalletAddress?: string
): Promise<{ won: boolean; payout: string; redemptionTxHash?: string }> {
  const won = didBetWin(bet, marketOutcome);
  const now = new Date().toISOString();

  if (!won) {
    // Lost bet - no payout
    await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'SETTLED', {
      outcome: 'LOST',
      actualPayout: '0',
      settledAt: now,
    });

    log.info('Bet settled (lost)', {
      betId: bet.betId,
      walletAddress: bet.walletAddress,
      side: bet.side,
      marketOutcome,
    });

    return { won: false, payout: '0' };
  }

  // Won bet - calculate and verify payout
  const expectedPayout = calculateExpectedPayout(bet);
  let actualPayout = expectedPayout;
  let redemptionTxHash: string | undefined;

  // Verify redemption on-chain if we have the fill block number and embedded wallet
  if (bet.fillBlockNumber && embeddedWalletAddress) {
    const verification = await verifyRedemptionPayout(
      embeddedWalletAddress,
      bet.fillBlockNumber,
      expectedPayout
    );

    if (verification.verified && verification.actualPayout) {
      actualPayout = verification.actualPayout;
      redemptionTxHash = verification.txHash;
    }
  }

  // Update bet status to SETTLED with payout details
  await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'SETTLED', {
    outcome: 'WON',
    actualPayout,
    settledAt: now,
    redemptionTxHash,
  });

  log.info('Bet settled (won)', {
    betId: bet.betId,
    walletAddress: bet.walletAddress,
    side: bet.side,
    marketOutcome,
    expectedPayout,
    actualPayout,
    redemptionTxHash,
  });

  return { won: true, payout: actualPayout, redemptionTxHash };
}

/**
 * Handle user chain after bet settlement
 */
async function handleUserChainAfterSettlement(
  bet: BetEntity,
  won: boolean,
  payout: string
): Promise<void> {
  // Get the chain to know total legs
  const chain = await getChain(bet.chainId);

  if (!chain) {
    log.error('Chain not found', { chainId: bet.chainId });
    return;
  }

  // Get the user's chain
  const userChain = await getUserChain(bet.chainId, bet.walletAddress);

  if (!userChain) {
    log.error('UserChain not found', { chainId: bet.chainId, walletAddress: bet.walletAddress });
    return;
  }

  if (!won) {
    // Bet lost - mark user chain as LOST
    // The position-termination-handler will void remaining QUEUED bets via stream
    log.info('Bet lost, marking user chain as LOST', {
      chainId: bet.chainId,
      walletAddress: bet.walletAddress,
    });

    await updateUserChainStatus(bet.chainId, bet.walletAddress, 'LOST', {
      completedLegs: bet.sequence,
    });

    return;
  }

  // Bet won
  const isLastBet = bet.sequence === chain.legs.length;

  if (isLastBet) {
    // All bets won! Mark user chain as WON
    log.info('All bets won, marking user chain as WON', {
      chainId: bet.chainId,
      walletAddress: bet.walletAddress,
      payout,
    });

    // Collect platform fee (2% of profit) - only for multi-leg accumulators
    // Single-leg chains are just regular bets, no commission applies
    let platformFee = '0';
    let platformFeeTxHash: string | undefined;

    if (chain.legs.length > 1) {
      try {
        // Get user to find embedded wallet address
        const user = await getUser(bet.walletAddress);

        if (user?.embeddedWalletAddress) {
          const feeResult = await collectPlatformFee(
            user.embeddedWalletAddress,
            payout,
            userChain.initialStake
          );

          if (feeResult.success) {
            platformFee = feeResult.feeAmount;
            platformFeeTxHash = feeResult.txHash;
            log.info('Platform fee collected', {
              chainId: bet.chainId,
              walletAddress: bet.walletAddress,
              feeAmount: platformFee,
              txHash: platformFeeTxHash,
            });
          } else {
            log.warn('Platform fee collection failed', {
              chainId: bet.chainId,
              walletAddress: bet.walletAddress,
              error: feeResult.error,
            });
          }
        } else {
          log.warn('User has no embedded wallet, skipping fee collection', {
            walletAddress: bet.walletAddress,
          });
        }
      } catch (error) {
        // Log but don't fail the resolution - fee collection is not critical
        log.errorWithStack('Error collecting platform fee', error, {
          chainId: bet.chainId,
          walletAddress: bet.walletAddress,
        });
      }
    } else {
      log.info('Single-leg chain, no platform fee applies', {
        chainId: bet.chainId,
        walletAddress: bet.walletAddress,
      });
    }

    await updateUserChainStatus(bet.chainId, bet.walletAddress, 'WON', {
      currentValue: payout,
      completedLegs: bet.sequence,
      platformFee,
      platformFeeTxHash,
    });
  } else {
    // More bets to go - update user chain and mark next bet as READY
    const nextSequence = bet.sequence + 1;

    log.info('Bet won, marking next bet as READY', {
      chainId: bet.chainId,
      walletAddress: bet.walletAddress,
      nextSequence,
      newStake: payout,
    });

    // Update user chain with new current value and progress
    await updateUserChainStatus(bet.chainId, bet.walletAddress, 'ACTIVE', {
      currentValue: payout,
      completedLegs: bet.sequence,
      currentLegSequence: nextSequence,
    });

    // Get next bet and mark it as READY
    const nextBet = await getBet(bet.chainId, bet.walletAddress, nextSequence);

    if (nextBet) {
      // Mark next bet as READY - the stream will trigger BetExecutor
      await updateBetStatus(bet.chainId, bet.walletAddress, nextSequence, 'READY');

      log.debug('Next bet marked as READY, BetExecutor will pick it up');
    } else {
      log.error('Next bet not found', {
        chainId: bet.chainId,
        walletAddress: bet.walletAddress,
        nextSequence,
      });
    }
  }
}

/**
 * Process a single market resolution event
 */
async function processMarketResolution(record: DynamoDBRecord): Promise<void> {
  if (!record.dynamodb?.NewImage) {
    log.warn('No NewImage in record');
    return;
  }

  // Unmarshall the DynamoDB record
  const market = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  ) as MarketEntity;

  if (!market.outcome) {
    log.error('Market resolved without outcome', { conditionId: market.conditionId });
    return;
  }

  log.info('Processing market resolution', {
    conditionId: market.conditionId,
    question: market.question,
    outcome: market.outcome,
  });

  // Find all bets on this market
  const bets = await getBetsByCondition(market.conditionId);

  // Filter to only FILLED bets (waiting for resolution)
  const filledBets = bets.filter((bet) => bet.status === 'FILLED');

  log.info('Found filled bets to settle', { count: filledBets.length });

  // Settle each bet
  for (const bet of filledBets) {
    try {
      // Get user's embedded wallet address for redemption verification
      const user = await getUser(bet.walletAddress);
      const embeddedWalletAddress = user?.embeddedWalletAddress;

      const { won, payout } = await settleBet(bet, market.outcome, embeddedWalletAddress);
      await handleUserChainAfterSettlement(bet, won, payout);
    } catch (error) {
      log.errorWithStack('Error settling bet', error, { betId: bet.betId });
      // Continue with other bets, don't fail entire batch
    }
  }
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  log.info('Processing market resolution records', { count: event.Records.length });

  for (const record of event.Records) {
    try {
      if (record.eventName === 'MODIFY') {
        await processMarketResolution(record);
      }
    } catch (error) {
      log.errorWithStack('Error processing market resolution record', error);
      throw error; // Re-throw to trigger DLQ/retry
    }
  }
}
