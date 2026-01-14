/**
 * Market Resolution Handler
 *
 * Triggered when a market status changes to RESOLVED.
 * Settles all bets on that market and triggers next actions:
 * - If bet WON and more bets: Mark next bet READY
 * - If bet WON and last bet: Mark accumulator WON, trigger payout
 * - If bet LOST: Mark accumulator LOST
 */

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import {
  getBetsByCondition,
  getAccumulator,
  updateBetStatus,
  updateAccumulatorStatus,
  getBet,
} from '../../shared/dynamo-client';
import type { MarketEntity, BetEntity } from '../../shared/types';

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
  await updateBetStatus(bet.accumulatorId, bet.sequence, 'SETTLED', {
    outcome: won ? 'WON' : 'LOST',
    actualPayout: payout,
    settledAt: now,
  });

  console.log('Bet settled:', {
    betId: bet.betId,
    side: bet.side,
    marketOutcome,
    won,
    payout,
  });

  return { won, payout };
}

/**
 * Handle accumulator after bet settlement
 */
async function handleAccumulatorAfterSettlement(
  bet: BetEntity,
  won: boolean,
  payout: string
): Promise<void> {
  const accumulator = await getAccumulator(bet.walletAddress, bet.accumulatorId);

  if (!accumulator) {
    console.error('Accumulator not found:', bet.accumulatorId);
    return;
  }

  if (!won) {
    // Bet lost - mark accumulator as LOST
    console.log('Bet lost, marking accumulator as LOST:', bet.accumulatorId);
    await updateAccumulatorStatus(bet.walletAddress, bet.accumulatorId, 'LOST', {
      completedBets: bet.sequence,
    });
    return;
  }

  // Bet won
  const isLastBet = bet.sequence === accumulator.totalBets;

  if (isLastBet) {
    // All bets won! Mark accumulator as WON
    console.log('All bets won! Marking accumulator as WON:', bet.accumulatorId);
    await updateAccumulatorStatus(bet.walletAddress, bet.accumulatorId, 'WON', {
      currentValue: payout,
      completedBets: bet.sequence,
    });

    // TODO: Trigger payout to user's wallet
    console.log('TODO: Trigger payout of', payout, 'USDC to', bet.walletAddress);
  } else {
    // More bets to go - update accumulator and mark next bet as READY
    const nextSequence = bet.sequence + 1;

    console.log('Bet won, marking next bet as READY:', {
      accumulatorId: bet.accumulatorId,
      nextSequence,
      newStake: payout,
    });

    // Update accumulator with new current value and progress
    await updateAccumulatorStatus(bet.walletAddress, bet.accumulatorId, 'ACTIVE', {
      currentValue: payout,
      completedBets: bet.sequence,
      currentBetSequence: nextSequence,
    });

    // Get next bet and update its stake (payout from previous bet)
    const nextBet = await getBet(bet.accumulatorId, nextSequence);

    if (nextBet) {
      // Update next bet with new stake (from previous win) and mark READY
      // Note: updateBetStatus will update GSI1 for READY status
      await updateBetStatus(bet.accumulatorId, nextSequence, 'READY');

      console.log('Next bet marked as READY, BetReadyHandler will pick it up');
    } else {
      console.error('Next bet not found:', { accumulatorId: bet.accumulatorId, nextSequence });
    }
  }
}

/**
 * Process a single market resolution event
 */
async function processMarketResolution(record: DynamoDBRecord): Promise<void> {
  if (!record.dynamodb?.NewImage) {
    console.warn('No NewImage in record');
    return;
  }

  // Unmarshall the DynamoDB record
  const market = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  ) as MarketEntity;

  if (!market.outcome) {
    console.error('Market resolved without outcome:', market.conditionId);
    return;
  }

  console.log('Processing market resolution:', {
    conditionId: market.conditionId,
    question: market.question,
    outcome: market.outcome,
  });

  // Find all bets on this market
  const bets = await getBetsByCondition(market.conditionId);

  // Filter to only FILLED bets (waiting for resolution)
  const filledBets = bets.filter((bet) => bet.status === 'FILLED');

  console.log(`Found ${filledBets.length} filled bets to settle`);

  // Settle each bet
  for (const bet of filledBets) {
    try {
      const { won, payout } = await settleBet(bet, market.outcome);
      await handleAccumulatorAfterSettlement(bet, won, payout);
    } catch (error) {
      console.error('Error settling bet:', bet.betId, error);
      // Continue with other bets, don't fail entire batch
    }
  }
}

export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  console.log(`Processing ${event.Records.length} market resolution records`);

  for (const record of event.Records) {
    try {
      if (record.eventName === 'MODIFY') {
        await processMarketResolution(record);
      }
    } catch (error) {
      console.error('Error processing market resolution record:', error);
      throw error; // Re-throw to trigger DLQ/retry
    }
  }
}
