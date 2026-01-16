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

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import {
  updateBetStatus,
  updateUserChainStatus,
  getUser,
} from '../../shared/dynamo-client';
import {
  getEmbeddedWalletCredentials,
  cacheEmbeddedWalletCredentials,
  type EmbeddedWalletCredentialsInput,
} from '../../shared/embedded-wallet-credentials';
import {
  decryptEmbeddedWalletCredentials,
  placeOrder,
  deriveApiCredentials,
  encryptEmbeddedWalletCredentials,
  setBuilderCredentials,
  hasBuilderCredentials,
} from '../../shared/polymarket-client';
import { createSigner } from '../../shared/turnkey-client';
import { createLogger } from '../../shared/logger';
import type { BetEntity, BetStatus, BuilderCredentials } from '../../shared/types';

const log = createLogger('bet-executor');

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

  // Credential issues
  if (message.includes('credential') || message.includes('api key') ||
      message.includes('unauthorized') || code === 'unauthorized') {
    return 'NO_CREDENTIALS';
  }

  // Missing embedded wallet
  if (message.includes('embedded wallet') || message.includes('no wallet')) {
    return 'NO_CREDENTIALS';
  }

  // Liquidity issues
  if (message.includes('liquidity') || message.includes('insufficient') ||
      message.includes('not enough')) {
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
 * Execute a bet using embedded wallet (Turnkey signer)
 *
 * Credentials are stored in CREDENTIALS_TABLE_NAME (the dedicated credentials table).
 * On first execution, we derive API credentials from Polymarket and cache them.
 */
async function executeBetWithEmbeddedWallet(
  bet: BetEntity,
  embeddedWalletAddress: string
): Promise<string> {
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

  // Place order using Turnkey signer
  const orderId = await placeOrder(signer, credentials, {
    tokenId: bet.tokenId,
    side: 'BUY',
    price: parseFloat(bet.targetPrice),
    size: parseFloat(bet.stake) / parseFloat(bet.targetPrice),
  });

  return orderId;
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
    // Mark bet as EXECUTING
    await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'EXECUTING');

    // Get user profile to get embedded wallet address
    const user = await getUser(bet.walletAddress);

    if (!user?.embeddedWalletAddress) {
      throw new Error('User does not have an embedded wallet - please re-authenticate');
    }

    // Execute using embedded wallet
    const orderId = await executeBetWithEmbeddedWallet(bet, user.embeddedWalletAddress);

    log.info('Order placed', { betId: bet.betId, orderId });

    // Update bet status to PLACED with order ID
    const now = new Date().toISOString();
    await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'PLACED', {
      orderId,
      executedAt: now,
    });

    // For now, assume order fills immediately and update to FILLED
    // In production, you'd monitor order status via Polymarket API or webhooks
    await updateBetStatus(bet.chainId, bet.walletAddress, bet.sequence, 'FILLED');

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
