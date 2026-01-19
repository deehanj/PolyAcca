/**
 * Bet Executor
 *
 * Triggered via DynamoDB Stream when a bet has status=READY:
 * - INSERT: First bet in position (created with status=READY)
 * - MODIFY: Subsequent bets (status changed to READY after previous bet won)
 *
 * Places orders on Polymarket CLOB with builder attribution.
 * Uses embedded wallets (Turnkey) for signing - all users get an embedded wallet on first auth.
 * On failure, marks bet with specific status and UserChain as FAILED.
 * The position-termination-handler will void remaining bets via stream.
 */

// Install Cloudflare bypass headers BEFORE any other imports that might use axios
import { installCloudflareBypassHeaders } from '../../shared/axios-cloudflare-headers';
installCloudflareBypassHeaders();

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import {
  updateBetStatus,
  updateUserChainStatus,
  getUser,
  getBet,
  getChain,
  getUserChain,
} from '../../shared/dynamo-client';
import {
  getEmbeddedWalletCredentials,
  cacheEmbeddedWalletCredentials,
  type EmbeddedWalletCredentialsInput,
} from '../../shared/embedded-wallet-credentials';
import {
  decryptEmbeddedWalletCredentials,
  placeOrder,
  fetchOrderStatus,
  deriveApiCredentials,
  encryptEmbeddedWalletCredentials,
  setBuilderCredentials,
  hasBuilderCredentials,
} from '../../shared/polymarket-client';
import { createSigner } from '../../shared/turnkey-client';
import { createLogger } from '../../shared/logger';
import { toMicroUsdc, fromMicroUsdc, calculateShares } from '../../shared/usdc-math';
import { JsonRpcProvider } from 'ethers';
import type { BetEntity, BetStatus, BuilderCredentials } from '../../shared/types';
import { fetchMarketByConditionId } from '../../shared/gamma-client';

const log = createLogger('bet-executor');

// Polygon RPC for getting block numbers
const POLYGON_RPC_URL = 'https://polygon-rpc.com';

// Secrets Manager client
const secretsClient = new SecretsManagerClient({});

// Builder secret ARN from environment
const BUILDER_SECRET_ARN = process.env.BUILDER_SECRET_ARN;

/**
 * Load builder credentials from Secrets Manager (cold start only)
 */
async function initBuilderCredentials(): Promise<void> {
  if (hasBuilderCredentials()) {
    return; // Already loaded
  }

  if (!BUILDER_SECRET_ARN) {
    log.warn('BUILDER_SECRET_ARN not set - orders will not have builder attribution');
    return;
  }

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: BUILDER_SECRET_ARN })
    );

    if (response.SecretString) {
      const creds: BuilderCredentials = JSON.parse(response.SecretString);
      setBuilderCredentials(creds);
      log.info('Builder credentials loaded for order attribution');
    }
  } catch (error) {
    log.errorWithStack('Failed to load builder credentials', error);
    // Continue without builder attribution - orders will still work
  }
}

/**
 * Error types for classifying execution failures
 */
interface ExecutionError extends Error {
  code?: string;
  type?: string;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Classify an error into a specific BetStatus
 */
function classifyError(error: unknown): BetStatus {
  if (!(error instanceof Error)) {
    return 'UNKNOWN_FAILURE';
  }

  const err = error as ExecutionError;
  const message = err.message?.toLowerCase() || '';
  const code = err.code?.toLowerCase() || '';

  // Cloudflare blocking - treat as temporary execution error
  if (message.includes('cloudflare') || message.includes('403') ||
      message.includes('access denied') || message.includes('just a moment') ||
      message.includes('challenge') || message.includes('captcha') ||
      message.includes('ray id') || message.includes('blocked')) {
    log.warn('Cloudflare blocking detected', { message: err.message });
    return 'EXECUTION_ERROR';
  }

  // Credential issues
  if (message.includes('credential') || message.includes('api key') ||
      message.includes('unauthorized') || code === 'unauthorized') {
    return 'NO_CREDENTIALS';
  }

  // Missing embedded wallet
  if (message.includes('embedded wallet') || message.includes('no wallet')) {
    return 'NO_CREDENTIALS';
  }

  // Turnkey wallet errors (signing failures, wallet not found)
  if (message.includes('turnkey') || message.includes('could not find any resource to sign') ||
      message.includes('failed to sign') || message.includes('addresses are case sensitive')) {
    return 'NO_CREDENTIALS';
  }

  // Liquidity/balance issues
  if (message.includes('liquidity') || message.includes('insufficient') ||
      message.includes('not enough') || message.includes('balance') ||
      message.includes('funds')) {
    return 'INSUFFICIENT_LIQUIDITY';
  }

  // Market closed
  if (message.includes('market closed') || message.includes('market suspended') ||
      message.includes('trading halted') || message.includes('resolved')) {
    return 'MARKET_CLOSED';
  }

  // Order rejected
  if (message.includes('rejected') || message.includes('invalid order') ||
      code === 'order_rejected') {
    return 'ORDER_REJECTED';
  }

  // Known technical errors
  if (message.includes('timeout') || message.includes('network') ||
      message.includes('econnrefused') || message.includes('rate limit')) {
    return 'EXECUTION_ERROR';
  }

  // Unknown failure
  return 'UNKNOWN_FAILURE';
}

/**
 * Check if a market is still active and accepting orders
 * This prevents attempting to place bets on markets that have already closed or resolved
 *
 * @returns Object with isActive flag and reason if not active
 */
async function checkMarketIsActive(
  conditionId: string
): Promise<{ isActive: boolean; reason?: string }> {
  try {
    const market = await fetchMarketByConditionId(conditionId);

    if (!market) {
      log.warn('Market not found in Gamma API', { conditionId });
      // If we can't find the market, assume it might be closed
      return { isActive: false, reason: 'Market not found' };
    }

    // Check if market is closed
    if (market.closed) {
      log.info('Market is closed', { conditionId, question: market.question });
      return { isActive: false, reason: 'Market is closed' };
    }

    // Check if market is not active (some markets may be suspended)
    if (!market.active) {
      log.info('Market is not active', { conditionId, question: market.question });
      return { isActive: false, reason: 'Market is not active' };
    }

    // Check if end date has passed
    const endDate = new Date(market.endDate);
    const now = new Date();
    if (endDate <= now) {
      log.info('Market end date has passed', {
        conditionId,
        endDate: market.endDate,
        question: market.question,
      });
      return { isActive: false, reason: 'Market end date has passed' };
    }

    return { isActive: true };
  } catch (error) {
    log.errorWithStack('Failed to check market status', error, { conditionId });
    // On error checking market status, proceed with bet placement
    // The order will fail if the market is truly closed
    return { isActive: true };
  }
}

/**
 * Handle execution failure - mark bet and UserChain with appropriate status
 */
async function handleExecutionFailure(
  bet: BetEntity,
  error: unknown
): Promise<void> {
  const betStatus = classifyError(error);

  log.error('Execution failed, marking bet and position', {
    betId: bet.betId,
    betStatus,
    chainId: bet.chainId,
    walletAddress: bet.walletAddress,
  });

  // Mark bet with specific failure status
  await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, betStatus);

  // Mark UserChain as FAILED - stream will handle voiding remaining bets
  await updateUserChainStatus(bet.chainId, bet.walletAddress, 'FAILED', {
    completedLegs: bet.sequence - 1,
  });
}

/**
 * Fill details returned when an order is executed and filled
 */
interface FillDetails {
  orderId: string;
  filled: boolean;
  fillPrice?: string; // Actual fill price
  sharesAcquired?: string; // Actual shares received
  fillBlockNumber?: number; // Block number for timeboxing redemption lookups
}

/**
 * Determine the actual stake for a bet
 *
 * For the first leg (sequence 1), use the pre-calculated stake.
 * For subsequent legs, use the actual payout from the previous bet.
 * Logs a warning if the actual differs significantly from pre-calculated.
 */
async function determineActualStake(bet: BetEntity): Promise<string> {
  // First leg uses the initial stake
  if (bet.sequence === 1) {
    return bet.stake;
  }

  // Subsequent legs: fetch previous bet's actual payout
  const previousBet = await getBet(bet.chainId, bet.walletAddress, bet.sequence - 1);

  if (!previousBet) {
    log.error('Previous bet not found', {
      chainId: bet.chainId,
      walletAddress: bet.walletAddress,
      previousSequence: bet.sequence - 1,
    });
    throw new Error(`Previous bet (sequence ${bet.sequence - 1}) not found`);
  }

  if (previousBet.status !== 'SETTLED' || previousBet.outcome !== 'WON') {
    log.error('Previous bet not settled as won', {
      betId: previousBet.betId,
      status: previousBet.status,
      outcome: previousBet.outcome,
    });
    throw new Error(`Previous bet not settled as won (status: ${previousBet.status}, outcome: ${previousBet.outcome})`);
  }

  const actualPayout = previousBet.actualPayout;
  if (!actualPayout) {
    log.error('Previous bet has no actualPayout', { betId: previousBet.betId });
    throw new Error('Previous bet has no actualPayout');
  }

  // Compare actual vs pre-calculated stake for verification
  const preCalculatedMicro = toMicroUsdc(bet.stake);
  const actualMicro = toMicroUsdc(actualPayout);
  const difference = preCalculatedMicro > actualMicro
    ? preCalculatedMicro - actualMicro
    : actualMicro - preCalculatedMicro;

  // Calculate percentage difference
  const percentDiff = preCalculatedMicro > 0n
    ? Number((difference * 10000n) / preCalculatedMicro) / 100
    : 0;

  if (percentDiff > 1) {
    // More than 1% difference - log warning
    log.warn('Stake mismatch between pre-calculated and actual', {
      betId: bet.betId,
      preCalculatedStake: bet.stake,
      actualPayout,
      difference: fromMicroUsdc(difference),
      percentDiff: `${percentDiff.toFixed(2)}%`,
    });
  } else {
    log.info('Stake verified against previous payout', {
      betId: bet.betId,
      preCalculatedStake: bet.stake,
      actualPayout,
      percentDiff: `${percentDiff.toFixed(2)}%`,
    });
  }

  return actualPayout;
}

/**
 * Execute a bet using embedded wallet (Turnkey signer)
 *
 * Credentials are stored in CREDENTIALS_TABLE_NAME (the dedicated credentials table).
 * On first execution, we derive API credentials from Polymarket and cache them.
 */
async function executeBetWithEmbeddedWallet(
  bet: BetEntity,
  embeddedWalletAddress: string
): Promise<FillDetails> {
  log.info('Executing bet with embedded wallet', {
    betId: bet.betId,
    embeddedWalletAddress,
  });

  // Create Turnkey signer for the embedded wallet
  const signer = await createSigner(embeddedWalletAddress);

  // Check for cached credentials (derived on first bet execution)
  const cachedCreds = await getEmbeddedWalletCredentials(bet.walletAddress);
  let credentials: { apiKey: string; apiSecret: string; passphrase: string };

  if (cachedCreds) {
    // Use existing cached credentials
    const decrypted = await decryptEmbeddedWalletCredentials(cachedCreds);
    credentials = {
      apiKey: decrypted.apiKey,
      apiSecret: decrypted.apiSecret,
      passphrase: decrypted.passphrase,
    };
    log.debug('Using cached embedded wallet credentials');
  } else {
    // Derive credentials for the first time from Polymarket
    log.info('Deriving API credentials for embedded wallet', { embeddedWalletAddress });
    credentials = await deriveApiCredentials(signer);

    // Cache encrypted credentials for future use
    const encrypted = await encryptEmbeddedWalletCredentials({
      ...credentials,
      signatureType: 'EOA',
    });
    const now = new Date().toISOString();
    const credsInput: EmbeddedWalletCredentialsInput = {
      entityType: 'EMBEDDED_WALLET_CREDS',
      walletAddress: bet.walletAddress.toLowerCase(),
      ...encrypted,
      signatureType: 'EOA',
      createdAt: now,
      updatedAt: now,
    };
    await cacheEmbeddedWalletCredentials(credsInput);
    log.info('Cached derived embedded wallet credentials');
  }

  // Determine actual stake (uses previous bet's payout for subsequent legs)
  const actualStake = await determineActualStake(bet);

  // Calculate order size using bigint arithmetic for precision
  // size = stake / price (number of shares to buy)
  const stakeMicro = toMicroUsdc(actualStake);
  const priceMicro = toMicroUsdc(bet.targetPrice);
  const sharesMicro = calculateShares(stakeMicro, priceMicro);
  const size = parseFloat(fromMicroUsdc(sharesMicro, 6)); // Use 6 decimals for precision

  log.info('Calculated order size', {
    betId: bet.betId,
    actualStake,
    targetPrice: bet.targetPrice,
    size,
  });

  // Place order using Turnkey signer
  const orderId = await placeOrder(signer, credentials, {
    tokenId: bet.tokenId,
    side: 'BUY',
    price: parseFloat(bet.targetPrice),
    size,
  });

  // Poll for fill confirmation and capture fill details
  const maxAttempts = 3;
  let filled = false;
  let fillPrice: string | undefined;
  let sharesAcquired: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await fetchOrderStatus(credentials, orderId);
    if (status.filled) {
      filled = true;
      fillPrice = status.fillPrice;
      sharesAcquired = status.filledSize;
      log.info('Order filled', {
        betId: bet.betId,
        orderId,
        fillPrice,
        sharesAcquired,
      });
      break;
    }
    if (attempt < maxAttempts) {
      await wait(500 * attempt);
    }
  }

  // Get current block number for timeboxing redemption lookups later
  let fillBlockNumber: number | undefined;
  if (filled) {
    try {
      const provider = new JsonRpcProvider(POLYGON_RPC_URL);
      fillBlockNumber = await provider.getBlockNumber();
    } catch (error) {
      log.warn('Failed to get block number for fill', { betId: bet.betId, error });
      // Non-fatal - we can still proceed without it
    }
  }

  return { orderId, filled, fillPrice, sharesAcquired, fillBlockNumber };
}

/**
 * Skip a closed market and advance to the next bet in the chain
 * Returns true if there was a next bet to advance to, false if this was the last bet
 */
async function skipClosedMarketAndContinue(
  bet: BetEntity,
  reason: string
): Promise<boolean> {
  log.info('Skipping closed market and checking for next bet', {
    betId: bet.betId,
    chainId: bet.chainId,
    sequence: bet.sequence,
    reason,
  });

  // Mark this bet as SKIPPED (market was closed)
  await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'MARKET_CLOSED');

  // Get the chain to know total legs
  const chain = await getChain(bet.chainId);
  if (!chain) {
    log.error('Chain not found when trying to skip bet', { chainId: bet.chainId });
    await updateUserChainStatus(bet.chainId, bet.walletAddress, 'FAILED', {
      completedLegs: bet.sequence - 1,
    });
    return false;
  }

  // Get user chain to track wonLegs and skippedLegs
  const userChain = await getUserChain(bet.chainId, bet.walletAddress);
  const currentWonLegs = userChain?.wonLegs ?? 0;
  const currentSkippedLegs = userChain?.skippedLegs ?? 0;
  const newSkippedLegs = currentSkippedLegs + 1; // Increment skipped count

  const isLastBet = bet.sequence === chain.legs.length;

  if (isLastBet) {
    // No more bets - chain completes but this bet was skipped
    // Mark as FAILED since we couldn't place the final bet
    log.info('Last bet in chain was skipped due to closed market', {
      chainId: bet.chainId,
      walletAddress: bet.walletAddress,
      wonLegs: currentWonLegs,
      skippedLegs: newSkippedLegs,
    });
    await updateUserChainStatus(bet.chainId, bet.walletAddress, 'FAILED', {
      completedLegs: bet.sequence - 1,
      wonLegs: currentWonLegs,
      skippedLegs: newSkippedLegs,
    });
    return false;
  }

  // There are more bets - mark the next one as READY
  const nextSequence = bet.sequence + 1;
  const nextBet = await getBet(bet.chainId, bet.walletAddress, nextSequence);

  if (!nextBet) {
    log.error('Next bet not found when trying to skip', {
      chainId: bet.chainId,
      walletAddress: bet.walletAddress,
      nextSequence,
    });
    await updateUserChainStatus(bet.chainId, bet.walletAddress, 'FAILED', {
      completedLegs: bet.sequence - 1,
      wonLegs: currentWonLegs,
      skippedLegs: newSkippedLegs,
    });
    return false;
  }

  // Update user chain to reflect we're moving to the next leg
  await updateUserChainStatus(bet.chainId, bet.walletAddress, 'ACTIVE', {
    completedLegs: bet.sequence, // Total processed (won + skipped) for backwards compat
    wonLegs: currentWonLegs, // No change - we skipped, didn't win
    skippedLegs: newSkippedLegs, // Incremented
    currentLegSequence: nextSequence,
  });

  // Mark next bet as READY - the stream will trigger execution
  await updateBetStatus(bet.chainId, bet.walletAddress, nextSequence, 'READY');

  log.info('Skipped closed market, advanced to next bet', {
    chainId: bet.chainId,
    skippedSequence: bet.sequence,
    nextSequence,
    wonLegs: currentWonLegs,
    skippedLegs: newSkippedLegs,
  });

  return true;
}

/**
 * Execute a bet - place order on Polymarket using embedded wallet
 */
async function executeBet(bet: BetEntity): Promise<void> {
  log.info('Executing bet', {
    betId: bet.betId,
    chainId: bet.chainId,
    walletAddress: bet.walletAddress,
    tokenId: bet.tokenId,
    side: bet.side,
    targetPrice: bet.targetPrice,
    stake: bet.stake,
  });

  try {
    // Check if market is still active before attempting to place order
    // This prevents wasted API calls and provides better error handling
    const marketCheck = await checkMarketIsActive(bet.conditionId);
    if (!marketCheck.isActive) {
      log.warn('Market is not active, cannot place bet', {
        betId: bet.betId,
        conditionId: bet.conditionId,
        reason: marketCheck.reason,
      });
      // Skip this bet and try to continue with the next one in the chain
      await skipClosedMarketAndContinue(bet, marketCheck.reason ?? 'Market closed');
      return; // Don't throw - we've handled it by skipping
    }

    // Mark bet as EXECUTING
    await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'EXECUTING');

    // Get user profile to get embedded wallet address
    const user = await getUser(bet.walletAddress);

    if (!user?.embeddedWalletAddress) {
      throw new Error('User does not have an embedded wallet - please re-authenticate');
    }

    // Execute using embedded wallet
    const fillDetails = await executeBetWithEmbeddedWallet(bet, user.embeddedWalletAddress);
    const { orderId, filled, fillPrice, sharesAcquired, fillBlockNumber } = fillDetails;

    log.info('Order placed', { betId: bet.betId, orderId });

    // Update bet status to PLACED with order ID
    const now = new Date().toISOString();
    await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'PLACED', {
      orderId,
      executedAt: now,
    });

    if (filled) {
      // Store fill details for accurate payout calculation during resolution
      await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'FILLED', {
        fillPrice: fillPrice ?? bet.targetPrice, // Fallback to target if fill price unavailable
        sharesAcquired: sharesAcquired ?? bet.potentialPayout, // Fallback to projected shares
        fillBlockNumber,
      });

      log.info('Bet filled with details', {
        betId: bet.betId,
        fillPrice: fillPrice ?? bet.targetPrice,
        sharesAcquired: sharesAcquired ?? bet.potentialPayout,
        fillBlockNumber,
      });
    } else {
      log.warn('Order not confirmed filled yet; leaving status PLACED', {
        betId: bet.betId,
        orderId,
      });
    }

    log.info('Bet execution complete', { betId: bet.betId });
  } catch (error) {
    log.errorWithStack('Bet execution failed', error, { betId: bet.betId });
    await handleExecutionFailure(bet, error);
    // Don't throw - we've handled the failure by marking statuses
    // The position-termination-handler will clean up via stream
  }
}

/**
 * Process a bet ready stream event
 */
async function processBetReady(record: DynamoDBRecord): Promise<void> {
  if (!record.dynamodb?.NewImage) {
    log.warn('No NewImage in record');
    return;
  }

  // Check if this is actually a transition to READY
  const oldImage = record.dynamodb.OldImage
    ? (unmarshall(record.dynamodb.OldImage as Record<string, AttributeValue>) as BetEntity)
    : null;

  const newImage = unmarshall(
    record.dynamodb.NewImage as Record<string, AttributeValue>
  ) as BetEntity;

  // Only process BET entities with status READY
  if (newImage.entityType !== 'BET' || newImage.status !== 'READY') {
    return;
  }

  // Only process if status actually changed to READY (not already READY)
  if (oldImage?.status === 'READY') {
    log.debug('Bet already was READY, skipping', { betId: newImage.betId });
    return;
  }

  await executeBet(newImage);
}

/**
 * Handler - processes DynamoDB Stream events for bets with status=READY
 */
export async function handler(event: DynamoDBStreamEvent): Promise<void> {
  // Initialize builder credentials for order attribution (cached after first call)
  await initBuilderCredentials();

  log.info('Processing bet records', { count: event.Records.length });

  for (const record of event.Records) {
    try {
      // Handle both INSERT (first bet) and MODIFY (subsequent bets)
      if (record.eventName === 'INSERT' || record.eventName === 'MODIFY') {
        await processBetReady(record);
      }
    } catch (error) {
      log.errorWithStack('Error processing bet record', error);
      throw error; // Re-throw to trigger DLQ/retry
    }
  }
}
