/**
 * Alchemy Webhook Handler
 *
 * Receives webhook notifications from Alchemy for on-chain events.
 * Detects market resolutions and updates market status in DynamoDB,
 * which triggers the MarketResolutionHandler via DynamoDB Streams.
 *
 * Webhook types:
 * - ADDRESS_ACTIVITY: Token transfers, contract interactions
 * - MINED_TRANSACTION: Transaction confirmations
 * - DROPPED_TRANSACTION: Failed/dropped transactions
 * - GRAPHQL: Custom GraphQL query results (used for ConditionResolution events)
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createHmac } from 'crypto';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import {
  getMarket,
  updateMarketStatus,
} from '../../shared/dynamo-client';
import { requireEnvVar } from '../../utils/envVars';

// Environment variables - validated at module load time
const WEBHOOK_SECRET_ARN = requireEnvVar('WEBHOOK_SECRET_ARN');

const secretsClient = new SecretsManagerClient({});

let cachedSigningKey: string | null = null;

// Polymarket CTF contract addresses (Polygon)
const POLYMARKET_CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'.toLowerCase();
const POLYMARKET_NEG_RISK_CTF = '0xC5d563A36AE78145C45a50134d48A1215220f80a'.toLowerCase();

/**
 * ConditionResolution event signature from Gnosis Conditional Tokens contract
 * event ConditionResolution(
 *   bytes32 indexed conditionId,
 *   address indexed oracle,
 *   bytes32 indexed questionId,
 *   uint outcomeSlotCount,
 *   uint256[] payoutNumerators
 * )
 * Topic hash: keccak256("ConditionResolution(bytes32,address,bytes32,uint256,uint256[])")
 */
const CONDITION_RESOLUTION_TOPIC = '0xb44d84d3289691f71497564b85d4233648d9dbae8cbdea4b9eeca8be75c83ecb';

// Alchemy webhook event types
interface AlchemyWebhookEvent {
  webhookId: string;
  id: string;
  createdAt: string;
  type: 'ADDRESS_ACTIVITY' | 'MINED_TRANSACTION' | 'DROPPED_TRANSACTION' | 'GRAPHQL';
  event: {
    network?: string;
    activity?: AlchemyActivity[];
    transaction?: AlchemyTransaction;
    // GRAPHQL custom webhook format
    data?: {
      block: {
        number?: number;
        hash?: string;
        logs: AlchemyGraphQLLog[];
      };
    };
  };
}

// Log format from GRAPHQL custom webhooks
interface AlchemyGraphQLLog {
  topics: string[];
  data: string;
  address?: string;
  blockNumber?: string;
  transactionHash?: string;
  transaction?: {
    hash: string;
  };
}

interface AlchemyActivity {
  fromAddress: string;
  toAddress: string;
  blockNum: string;
  hash: string;
  value: number;
  asset: string;
  category: 'external' | 'internal' | 'erc20' | 'erc721' | 'erc1155';
  rawContract: {
    rawValue: string;
    address: string;
    decimals: number;
  };
  log?: {
    topics: string[];
    data: string;
  };
}

interface AlchemyTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  blockNumber: string;
  blockHash: string;
  input?: string;
}

/**
 * Get webhook signing key from Secrets Manager
 */
async function getSigningKey(): Promise<string> {
  if (cachedSigningKey) {
    return cachedSigningKey;
  }

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: WEBHOOK_SECRET_ARN })
  );

  if (!response.SecretString) {
    throw new Error('Webhook signing key not found');
  }

  const secret = JSON.parse(response.SecretString);
  cachedSigningKey = secret.signingKey;

  if (!cachedSigningKey) {
    throw new Error('signingKey not set in secret');
  }

  return cachedSigningKey;
}

/**
 * Verify Alchemy webhook signature
 */
async function verifySignature(body: string, signature: string): Promise<boolean> {
  const signingKey = await getSigningKey();

  const expectedSignature = createHmac('sha256', signingKey)
    .update(body)
    .digest('hex');

  return signature === expectedSignature;
}

/**
 * Check if activity is related to Polymarket CTF contracts
 */
function isPolymarketActivity(activity: AlchemyActivity): boolean {
  const contractAddress = activity.rawContract?.address?.toLowerCase();
  return (
    contractAddress === POLYMARKET_CTF_ADDRESS ||
    contractAddress === POLYMARKET_NEG_RISK_CTF
  );
}

/**
 * Parsed ConditionResolution event data
 */
interface ConditionResolutionEvent {
  conditionId: string;
  oracle: string;
  questionId: string;
  outcomeSlotCount: number;
  payoutNumerators: bigint[];
}

/**
 * Parse ConditionResolution event from log topics and data
 *
 * Event signature:
 * ConditionResolution(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint outcomeSlotCount, uint256[] payoutNumerators)
 *
 * Topics:
 * [0] = event signature hash
 * [1] = conditionId (indexed, bytes32)
 * [2] = oracle address (indexed, address padded to bytes32)
 * [3] = questionId (indexed, bytes32)
 *
 * Data (ABI encoded):
 * - outcomeSlotCount (uint256)
 * - payoutNumerators offset (uint256) - points to array
 * - payoutNumerators length (uint256)
 * - payoutNumerators values (uint256[])
 */
function parseConditionResolutionEvent(
  topics: string[],
  data: string
): ConditionResolutionEvent | null {
  // Validate we have the right event
  if (topics.length < 4 || topics[0].toLowerCase() !== CONDITION_RESOLUTION_TOPIC) {
    return null;
  }

  // Parse indexed parameters from topics
  const conditionId = topics[1]; // bytes32
  const oracle = '0x' + topics[2].slice(-40); // address is last 20 bytes (40 hex chars)
  const questionId = topics[3]; // bytes32

  // Parse non-indexed parameters from data
  // Remove '0x' prefix for easier parsing
  const dataHex = data.startsWith('0x') ? data.slice(2) : data;

  // Each uint256 is 32 bytes = 64 hex chars
  // Data layout:
  // [0-64]: outcomeSlotCount
  // [64-128]: offset to payoutNumerators array (should be 64 = 0x40)
  // [128-192]: length of payoutNumerators array
  // [192+]: array elements

  if (dataHex.length < 128) {
    console.error('Data too short for ConditionResolution event');
    return null;
  }

  const outcomeSlotCount = parseInt(dataHex.slice(0, 64), 16);
  const arrayLength = parseInt(dataHex.slice(128, 192), 16);

  const payoutNumerators: bigint[] = [];
  for (let i = 0; i < arrayLength; i++) {
    const start = 192 + i * 64;
    const end = start + 64;
    if (dataHex.length >= end) {
      payoutNumerators.push(BigInt('0x' + dataHex.slice(start, end)));
    }
  }

  return {
    conditionId,
    oracle,
    questionId,
    outcomeSlotCount,
    payoutNumerators,
  };
}

/**
 * Determine market outcome from payout numerators
 *
 * For binary markets (2 outcomes):
 * - [X, 0] where X > 0 = YES wins (outcome index 0)
 * - [0, X] where X > 0 = NO wins (outcome index 1)
 * - [X, X] or other distributions = VOID (split/invalid resolution)
 *
 * For non-binary markets:
 * - Treated as VOID since we only support binary markets
 *
 * Note: Polymarket uses YES=index 0, NO=index 1 for binary markets
 */
function determineOutcome(payoutNumerators: bigint[]): 'YES' | 'NO' | 'VOID' {
  if (payoutNumerators.length !== 2) {
    console.warn('Non-binary market detected, treating as VOID. Payouts:', payoutNumerators.map(String));
    // Non-binary markets are not supported - mark as VOID so chains can be properly terminated
    return 'VOID';
  }

  const [yesPayout, noPayout] = payoutNumerators;

  if (yesPayout > 0n && noPayout === 0n) {
    return 'YES';
  } else if (noPayout > 0n && yesPayout === 0n) {
    return 'NO';
  } else {
    // Split resolution, all-zero, or invalid distribution - treat as VOID
    console.warn('Split/invalid payout distribution, treating as VOID:', { yes: String(yesPayout), no: String(noPayout) });
    return 'VOID';
  }
}

/**
 * Handle market resolution event
 * Updates market status in DynamoDB which triggers MarketResolutionHandler
 */
async function handleMarketResolution(
  conditionId: string,
  outcome: 'YES' | 'NO' | 'VOID'
): Promise<void> {
  console.log('Processing market resolution:', { conditionId, outcome });

  // Check if market exists in our database
  const market = await getMarket(conditionId);

  if (!market) {
    console.log('Market not found in database, skipping:', conditionId);
    return;
  }

  if (market.status === 'RESOLVED') {
    console.log('Market already resolved:', conditionId);
    return;
  }

  // Update market status to RESOLVED
  // This will trigger the MarketResolutionHandler via DynamoDB Streams
  await updateMarketStatus(conditionId, 'RESOLVED', {
    outcome,
    resolutionDate: new Date().toISOString(),
  });

  console.log('Market status updated to RESOLVED:', { conditionId, outcome });
}

/**
 * Process ADDRESS_ACTIVITY events
 * Looks for Polymarket ConditionResolution events
 */
async function handleAddressActivity(activities: AlchemyActivity[]): Promise<void> {
  for (const activity of activities) {
    console.log('Address activity:', {
      from: activity.fromAddress,
      to: activity.toAddress,
      asset: activity.asset,
      category: activity.category,
      hash: activity.hash,
    });

    // Check if this is Polymarket-related
    if (!isPolymarketActivity(activity)) {
      continue;
    }

    console.log('Polymarket activity detected:', activity.hash);

    // Parse event logs to detect resolution
    if (activity.log?.topics && activity.log.data) {
      const resolution = parseConditionResolutionEvent(activity.log.topics, activity.log.data);

      if (resolution) {
        console.log('ConditionResolution event detected:', {
          conditionId: resolution.conditionId,
          oracle: resolution.oracle,
          outcomeSlotCount: resolution.outcomeSlotCount,
          payoutNumerators: resolution.payoutNumerators.map(String),
        });

        const outcome = determineOutcome(resolution.payoutNumerators);
        await handleMarketResolution(resolution.conditionId, outcome);
      }
    }
  }
}

/**
 * Process GRAPHQL custom webhook events
 * This is the preferred method for listening to ConditionResolution events
 */
async function handleGraphQLWebhook(logs: AlchemyGraphQLLog[]): Promise<void> {
  console.log(`Processing ${logs.length} logs from GRAPHQL webhook`);

  for (const log of logs) {
    // Check if this is a ConditionResolution event
    if (!log.topics || log.topics.length < 4) {
      continue;
    }

    if (log.topics[0].toLowerCase() !== CONDITION_RESOLUTION_TOPIC) {
      continue;
    }

    const txHash = log.transaction?.hash || log.transactionHash || 'unknown';
    console.log('ConditionResolution event found in tx:', txHash);

    const resolution = parseConditionResolutionEvent(log.topics, log.data);

    if (!resolution) {
      console.error('Failed to parse ConditionResolution event');
      continue;
    }

    console.log('Parsed ConditionResolution:', {
      conditionId: resolution.conditionId,
      oracle: resolution.oracle,
      questionId: resolution.questionId,
      outcomeSlotCount: resolution.outcomeSlotCount,
      payoutNumerators: resolution.payoutNumerators.map(String),
    });

    const outcome = determineOutcome(resolution.payoutNumerators);
    await handleMarketResolution(resolution.conditionId, outcome);
  }
}

/**
 * Process MINED_TRANSACTION events
 */
async function handleMinedTransaction(transaction: AlchemyTransaction): Promise<void> {
  console.log('Mined transaction:', {
    hash: transaction.hash,
    from: transaction.from,
    to: transaction.to,
    blockNumber: transaction.blockNumber,
  });

  // Check if transaction is to Polymarket contracts
  const toAddress = transaction.to?.toLowerCase();
  if (toAddress === POLYMARKET_CTF_ADDRESS || toAddress === POLYMARKET_NEG_RISK_CTF) {
    console.log('Polymarket transaction mined:', transaction.hash);
    // Transaction confirmation - could be order placement, redemption, etc.
  }
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const headers = {
    'Content-Type': 'application/json',
  };

  try {
    // Verify request has a body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    // Verify webhook signature
    // API Gateway REST API preserves header case - check both
    const signature = event.headers['x-alchemy-signature'] || event.headers['X-Alchemy-Signature'];
    if (!signature) {
      console.warn('Missing Alchemy signature header');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing signature' }),
      };
    }

    const isValid = await verifySignature(event.body, signature);
    if (!isValid) {
      console.warn('Invalid Alchemy webhook signature');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid signature' }),
      };
    }

    // Parse webhook payload
    const webhookEvent: AlchemyWebhookEvent = JSON.parse(event.body);

    console.log('Received Alchemy webhook:', {
      webhookId: webhookEvent.webhookId,
      type: webhookEvent.type,
      network: webhookEvent.event.network,
    });

    // Process based on event type
    switch (webhookEvent.type) {
      case 'GRAPHQL':
        // Custom webhook for ConditionResolution events (preferred method)
        if (webhookEvent.event.data?.block?.logs) {
          await handleGraphQLWebhook(webhookEvent.event.data.block.logs);
        } else {
          console.warn('GRAPHQL webhook received but no logs found in payload');
        }
        break;

      case 'ADDRESS_ACTIVITY':
        // Fallback method - also supports ConditionResolution detection
        if (webhookEvent.event.activity) {
          await handleAddressActivity(webhookEvent.event.activity);
        }
        break;

      case 'MINED_TRANSACTION':
        if (webhookEvent.event.transaction) {
          await handleMinedTransaction(webhookEvent.event.transaction);
        }
        break;

      case 'DROPPED_TRANSACTION':
        console.log('Dropped transaction:', webhookEvent.event.transaction?.hash);
        // Could retry bet placement or mark as failed
        break;

      default:
        console.log('Unhandled webhook type:', webhookEvent.type);
    }

    // Acknowledge receipt
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ received: true }),
    };
  } catch (error) {
    console.error('Webhook processing error:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
