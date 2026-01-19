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
import { fetchMarketByConditionId } from '../../shared/gamma-client';
import { fetchOrderStatus, decryptEmbeddedWalletCredentials } from '../../shared/polymarket-client';
import { getEmbeddedWalletCredentials } from '../../shared/embedded-wallet-credentials';
import type { MarketEntity, BetEntity, MarketOutcome } from '../../shared/types';

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
 * Returns null for VOID outcomes (neither won nor lost in normal sense)
 */
function didBetWin(bet: BetEntity, marketOutcome: MarketOutcome): boolean | null {
  if (marketOutcome === 'VOID') {
    return null; // Market was voided - special handling needed
  }
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
 * Re-check order status for a PLACED bet and update to FILLED if filled
 * This handles the case where an order fills after our initial polling window
 *
 * @returns true if the bet was updated to FILLED, false otherwise
 */
async function recheckAndUpdatePlacedBet(bet: BetEntity): Promise<boolean> {
  if (!bet.orderId) {
    log.warn('PLACED bet has no orderId, cannot recheck', { betId: bet.betId });
    return false;
  }

  try {
    // Get credentials to check order status
    const creds = await getEmbeddedWalletCredentials(bet.walletAddress);
    if (!creds) {
      log.error('No credentials found for PLACED bet recheck', {
        betId: bet.betId,
        walletAddress: bet.walletAddress,
      });
      return false;
    }

    const decrypted = await decryptEmbeddedWalletCredentials(creds);
    const status = await fetchOrderStatus(decrypted, bet.orderId);

    if (status.filled) {
      log.info('PLACED bet confirmed filled on recheck', {
        betId: bet.betId,
        orderId: bet.orderId,
        fillPrice: status.fillPrice,
        filledSize: status.filledSize,
      });

      // Update bet to FILLED status with fill details
      await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'FILLED', {
        fillPrice: status.fillPrice ?? bet.targetPrice,
        sharesAcquired: status.filledSize ?? bet.potentialPayout,
      });

      // Update in-memory bet object for subsequent processing
      bet.status = 'FILLED';
      bet.fillPrice = status.fillPrice ?? bet.targetPrice;
      bet.sharesAcquired = status.filledSize ?? bet.potentialPayout;

      return true;
    }

    log.warn('PLACED bet still not filled on recheck', {
      betId: bet.betId,
      orderId: bet.orderId,
      status: status.status,
    });
    return false;
  } catch (error) {
    log.errorWithStack('Error rechecking PLACED bet status', error, {
      betId: bet.betId,
      orderId: bet.orderId,
    });
    return false;
  }
}

/**
 * Handle a VOID market resolution
 * Marks the bet as VOIDED and the chain as FAILED
 */
async function handleVoidedBet(bet: BetEntity): Promise<void> {
  const now = new Date().toISOString();

  log.info('Handling voided bet due to VOID market resolution', {
    betId: bet.betId,
    chainId: bet.chainId,
    walletAddress: bet.walletAddress,
  });

  // Mark bet as VOIDED
  await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'VOIDED', {
    settledAt: now,
  });

  // Get user chain to get current value
  const userChain = await getUserChain(bet.chainId, bet.walletAddress);
  if (!userChain) {
    log.error('UserChain not found for voided bet', {
      chainId: bet.chainId,
      walletAddress: bet.walletAddress,
    });
    return;
  }

  // Mark chain as FAILED due to voided market
  // The position-termination-handler will void any remaining QUEUED bets
  await updateUserChainStatus(bet.chainId, bet.walletAddress, 'FAILED', {
    completedLegs: bet.sequence - 1,
    currentValue: userChain.currentValue, // Preserve current value
  });

  log.info('Chain marked as FAILED due to VOID market resolution', {
    chainId: bet.chainId,
    walletAddress: bet.walletAddress,
  });
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
 *
 * Note: VOID outcomes should be handled separately via handleVoidedBet()
 */
async function settleBet(
  bet: BetEntity,
  marketOutcome: 'YES' | 'NO',
  embeddedWalletAddress?: string
): Promise<{ won: boolean; payout: string; redemptionTxHash?: string }> {
  const won = didBetWin(bet, marketOutcome);
  const now = new Date().toISOString();

  // won should never be null here since we filter VOID outcomes before calling
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

  // Calculate current wonLegs and skippedLegs from existing userChain
  const currentWonLegs = userChain.wonLegs ?? 0;
  const currentSkippedLegs = userChain.skippedLegs ?? 0;

  if (!won) {
    // Bet lost - mark user chain as LOST
    // The position-termination-handler will void remaining QUEUED bets via stream
    log.info('Bet lost, marking user chain as LOST', {
      chainId: bet.chainId,
      walletAddress: bet.walletAddress,
    });

    await updateUserChainStatus(bet.chainId, bet.walletAddress, 'LOST', {
      completedLegs: bet.sequence,
      wonLegs: currentWonLegs, // No change - this bet was lost, not won
      skippedLegs: currentSkippedLegs, // No change
    });

    return;
  }

  // Bet won - increment wonLegs
  const newWonLegs = currentWonLegs + 1;

  // Bet won
  const isLastBet = bet.sequence === chain.legs.length;

  if (isLastBet) {
    // All bets won! Mark user chain as WON
    log.info('All bets won, marking user chain as WON', {
      chainId: bet.chainId,
      walletAddress: bet.walletAddress,
      payout,
      wonLegs: newWonLegs,
      skippedLegs: currentSkippedLegs,
    });

    // Collect platform fee (2% of profit) - only for multi-leg accumulators
    // Single-leg chains are just regular bets, no commission applies
    let platformFee = '0';
    let platformFeeTxHash: string | undefined;
    let feeCollectionFailed = false;
    let feeCollectionError: string | undefined;

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
            // Fee collection failed - track it for alerting
            feeCollectionFailed = true;
            feeCollectionError = feeResult.error ?? 'Unknown error';
            log.error('CRITICAL: Platform fee collection failed', {
              chainId: bet.chainId,
              walletAddress: bet.walletAddress,
              payout,
              initialStake: userChain.initialStake,
              error: feeResult.error,
            });
          }
        } else {
          feeCollectionFailed = true;
          feeCollectionError = 'User has no embedded wallet';
          log.error('CRITICAL: Platform fee collection failed - no embedded wallet', {
            chainId: bet.chainId,
            walletAddress: bet.walletAddress,
            payout,
          });
        }
      } catch (error) {
        // Log at ERROR level for alerting - fee collection failures are revenue loss
        feeCollectionFailed = true;
        feeCollectionError = error instanceof Error ? error.message : 'Unknown error';
        log.error('CRITICAL: Platform fee collection threw exception', {
          chainId: bet.chainId,
          walletAddress: bet.walletAddress,
          payout,
          initialStake: userChain.initialStake,
          error: feeCollectionError,
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
      wonLegs: newWonLegs,
      skippedLegs: currentSkippedLegs,
      platformFee,
      platformFeeTxHash,
      feeCollectionFailed: feeCollectionFailed || undefined, // Only set if true
      feeCollectionError,
    });
  } else {
    // More bets to go - update user chain and mark next bet as READY
    const nextSequence = bet.sequence + 1;

    log.info('Bet won, preparing to mark next bet as READY', {
      chainId: bet.chainId,
      walletAddress: bet.walletAddress,
      nextSequence,
      newStake: payout,
    });

    // Get next bet to check its market status
    const nextBet = await getBet(bet.chainId, bet.walletAddress, nextSequence);

    if (!nextBet) {
      log.error('Next bet not found', {
        chainId: bet.chainId,
        walletAddress: bet.walletAddress,
        nextSequence,
      });
      return;
    }

    // Find the next available bet (skipping any that have closed markets)
    let currentSequence = nextSequence;
    let currentBet = nextBet;
    let foundActiveBet = false;

    while (currentSequence <= chain.legs.length) {
      // Check if the market is still active
      try {
        const market = await fetchMarketByConditionId(currentBet.conditionId);

        if (!market) {
          log.warn('Market not found in Gamma API, skipping bet', {
            chainId: bet.chainId,
            conditionId: currentBet.conditionId,
            sequence: currentSequence,
          });
          // Mark this bet as MARKET_CLOSED and try the next one
          await updateBetStatus(bet.chainId, bet.walletAddress, currentSequence, 'MARKET_CLOSED');
        } else if (market.closed) {
          log.warn('Market has already closed, skipping bet', {
            chainId: bet.chainId,
            conditionId: currentBet.conditionId,
            question: market.question,
            sequence: currentSequence,
          });
          // Mark this bet as MARKET_CLOSED and try the next one
          await updateBetStatus(bet.chainId, bet.walletAddress, currentSequence, 'MARKET_CLOSED');
        } else if (!market.active) {
          log.warn('Market is not active, skipping bet', {
            chainId: bet.chainId,
            conditionId: currentBet.conditionId,
            question: market.question,
            sequence: currentSequence,
          });
          // Mark this bet as MARKET_CLOSED and try the next one
          await updateBetStatus(bet.chainId, bet.walletAddress, currentSequence, 'MARKET_CLOSED');
        } else {
          // Market is active - this is the bet we want to execute
          const endDate = new Date(market.endDate);
          const now = new Date();
          if (endDate <= now) {
            log.warn('Market end date has passed but not closed yet, proceeding', {
              chainId: bet.chainId,
              conditionId: currentBet.conditionId,
              endDate: market.endDate,
              sequence: currentSequence,
            });
          }
          foundActiveBet = true;
          break;
        }
      } catch (error) {
        log.errorWithStack('Failed to check market status, proceeding with bet', error, {
          chainId: bet.chainId,
          conditionId: currentBet.conditionId,
          sequence: currentSequence,
        });
        // On error, assume market is active and try to place the bet
        // The bet-executor will do its own check
        foundActiveBet = true;
        break;
      }

      // Move to the next bet
      currentSequence++;
      if (currentSequence <= chain.legs.length) {
        const nextBetInChain = await getBet(bet.chainId, bet.walletAddress, currentSequence);
        if (!nextBetInChain) {
          log.error('Bet not found while scanning for active market', {
            chainId: bet.chainId,
            walletAddress: bet.walletAddress,
            sequence: currentSequence,
          });
          break;
        }
        currentBet = nextBetInChain;
      }
    }

    // Calculate how many bets were skipped in this pass
    const betsSkippedThisPass = currentSequence - nextSequence;
    const newSkippedLegs = currentSkippedLegs + betsSkippedThisPass;

    if (!foundActiveBet) {
      // All remaining bets have closed markets - mark chain as FAILED
      log.warn('All remaining markets are closed, chain cannot continue', {
        chainId: bet.chainId,
        walletAddress: bet.walletAddress,
        lastCheckedSequence: currentSequence - 1,
        wonLegs: newWonLegs,
        skippedLegs: newSkippedLegs,
      });
      await updateUserChainStatus(bet.chainId, bet.walletAddress, 'FAILED', {
        currentValue: payout,
        completedLegs: currentSequence - 1,
        wonLegs: newWonLegs,
        skippedLegs: newSkippedLegs,
      });
      return;
    }

    // Update user chain with new current value and progress
    await updateUserChainStatus(bet.chainId, bet.walletAddress, 'ACTIVE', {
      currentValue: payout,
      completedLegs: currentSequence - 1, // All bets before this one are done (settled or skipped)
      wonLegs: newWonLegs,
      skippedLegs: newSkippedLegs,
      currentLegSequence: currentSequence,
    });

    // Mark the active bet as READY - the stream will trigger BetExecutor
    await updateBetStatus(bet.chainId, bet.walletAddress, currentSequence, 'READY');

    log.info('Next active bet marked as READY', {
      chainId: bet.chainId,
      walletAddress: bet.walletAddress,
      sequence: currentSequence,
      skippedBets: betsSkippedThisPass,
      totalWonLegs: newWonLegs,
      totalSkippedLegs: newSkippedLegs,
    });
  }
}

/**
 * Process a single market resolution or cancellation event
 *
 * Handles:
 * - FILLED bets: Settle normally based on outcome
 * - PLACED bets: Re-check order status, then settle if filled
 * - VOID outcomes: Mark bets as VOIDED and chains as FAILED
 * - CANCELLED markets: Treat same as VOID - mark bets and chains as FAILED
 */
async function processMarketResolution(record: DynamoDBRecord): Promise<void> {
  if (!record.dynamodb?.NewImage) {
    log.warn('No NewImage in record');
    return;
  }

  // Unmarshall old and new images to check for status transition
  const market = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  ) as MarketEntity;

  const oldMarket = record.dynamodb.OldImage
    ? (unmarshall(record.dynamodb.OldImage as Record<string, AttributeValue>) as MarketEntity)
    : null;

  // Only process if this is a transition TO RESOLVED or CANCELLED
  const terminalStatuses = ['RESOLVED', 'CANCELLED'];
  if (!terminalStatuses.includes(market.status)) {
    return; // Not a terminal status, skip
  }

  // Skip if already was in a terminal status (avoid re-processing)
  if (oldMarket && terminalStatuses.includes(oldMarket.status)) {
    log.debug('Market already in terminal status, skipping', {
      conditionId: market.conditionId,
      oldStatus: oldMarket.status,
      newStatus: market.status,
    });
    return;
  }

  // Handle CANCELLED markets - treat same as VOID outcome
  if (market.status === 'CANCELLED') {
    log.info('Market was CANCELLED, treating as VOID outcome', {
      conditionId: market.conditionId,
      question: market.question,
    });
    // Set outcome to VOID for consistent handling below
    market.outcome = 'VOID';
  }

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

  // Handle VOID outcomes separately - all bets are voided
  if (market.outcome === 'VOID') {
    log.info('Market resolved as VOID, voiding all active bets', {
      conditionId: market.conditionId,
      betCount: bets.length,
    });

    const activeBets = bets.filter((bet) =>
      ['FILLED', 'PLACED', 'EXECUTING', 'READY'].includes(bet.status)
    );

    for (const bet of activeBets) {
      try {
        await handleVoidedBet(bet);
      } catch (error) {
        log.errorWithStack('Error handling voided bet', error, { betId: bet.betId });
      }
    }
    return;
  }

  // For YES/NO outcomes, process both FILLED and PLACED bets
  // PLACED bets may have filled after our initial polling window
  const filledBets = bets.filter((bet) => bet.status === 'FILLED');
  const placedBets = bets.filter((bet) => bet.status === 'PLACED');

  log.info('Found bets to process', {
    filledCount: filledBets.length,
    placedCount: placedBets.length,
  });

  // First, recheck PLACED bets to see if they actually filled
  const recheckResults: { bet: BetEntity; updated: boolean }[] = [];
  for (const bet of placedBets) {
    try {
      const updated = await recheckAndUpdatePlacedBet(bet);
      recheckResults.push({ bet, updated });
    } catch (error) {
      log.errorWithStack('Error rechecking PLACED bet', error, { betId: bet.betId });
      recheckResults.push({ bet, updated: false });
    }
  }

  // Combine FILLED bets with successfully rechecked PLACED bets
  const betsToSettle = [
    ...filledBets,
    ...recheckResults.filter((r) => r.updated).map((r) => r.bet),
  ];

  log.info('Settling bets', { count: betsToSettle.length });

  // Settle each bet
  for (const bet of betsToSettle) {
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

  // Handle PLACED bets that couldn't be confirmed as filled
  // These are stuck orders - mark them and the chain as FAILED
  const stuckPlacedBets = recheckResults.filter((r) => !r.updated).map((r) => r.bet);
  if (stuckPlacedBets.length > 0) {
    log.warn('Found stuck PLACED bets that could not be confirmed filled', {
      count: stuckPlacedBets.length,
    });

    for (const bet of stuckPlacedBets) {
      try {
        const now = new Date().toISOString();

        // Mark bet as failed - order status unknown
        await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'EXECUTION_ERROR', {
          settledAt: now,
        });

        // Mark chain as FAILED
        await updateUserChainStatus(bet.chainId, bet.walletAddress, 'FAILED', {
          completedLegs: bet.sequence - 1,
        });

        log.info('Marked stuck PLACED bet and chain as FAILED', {
          betId: bet.betId,
          chainId: bet.chainId,
        });
      } catch (error) {
        log.errorWithStack('Error handling stuck PLACED bet', error, { betId: bet.betId });
      }
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
