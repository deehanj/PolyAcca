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
import {
  getBetsByCondition,
  getChain,
  getUserChain,
  updateBetStatus,
  updateUserChainStatus,
  getBet,
} from '../../shared/dynamo-client';
import { createLogger } from '../../shared/logger';
import type { MarketEntity, BetEntity } from '../../shared/types';

const log = createLogger('market-resolution-handler');

/**
 * Determine if a bet won based on market outcome and bet side
 */
function didBetWin(bet: BetEntity, marketOutcome: 'YES' | 'NO'): boolean {
  return bet.side === marketOutcome;
}

/**
 * Calculate actual payout for a winning bet
 * Winner gets $1 per share held
 */
function calculatePayout(bet: BetEntity): string {
  // Shares owned = stake / price
  // Payout = shares * $1 = stake / price
  const price = parseFloat(bet.targetPrice);
  const stake = parseFloat(bet.stake);
  const shares = stake / price;
  return shares.toFixed(2);
}

/**
 * Process a single bet settlement
 */
async function settleBet(
  bet: BetEntity,
  marketOutcome: 'YES' | 'NO'
): Promise<{ won: boolean; payout: string }> {
  const won = didBetWin(bet, marketOutcome);
  const payout = won ? calculatePayout(bet) : '0';
  const now = new Date().toISOString();

  // Update bet status to SETTLED
  await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'SETTLED', {
    outcome: won ? 'WON' : 'LOST',
    actualPayout: payout,
    settledAt: now,
  });

  log.info('Bet settled', {
    betId: bet.betId,
    walletAddress: bet.walletAddress,
    side: bet.side,
    marketOutcome,
    won,
    payout,
  });

  return { won, payout };
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

    await updateUserChainStatus(bet.chainId, bet.walletAddress, 'WON', {
      currentValue: payout,
      completedLegs: bet.sequence,
    });

    // TODO: Trigger payout to user's wallet
    log.warn('Payout not yet implemented', { payout, walletAddress: bet.walletAddress });
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
      const { won, payout } = await settleBet(bet, market.outcome);
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
