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
 * - GRAPHQL: Custom GraphQL query results
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

const secretsClient = new SecretsManagerClient({});

let cachedSigningKey: string | null = null;

// Polymarket CTF contract addresses (Polygon)
const POLYMARKET_CTF_ADDRESS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'.toLowerCase();
const POLYMARKET_NEG_RISK_CTF = '0xC5d563A36AE78145C45a50134d48A1215220f80a'.toLowerCase();

// Alchemy webhook event types
interface AlchemyWebhookEvent {
  webhookId: string;
  id: string;
  createdAt: string;
  type: 'ADDRESS_ACTIVITY' | 'MINED_TRANSACTION' | 'DROPPED_TRANSACTION' | 'GRAPHQL';
  event: {
    network: string;
    activity?: AlchemyActivity[];
    transaction?: AlchemyTransaction;
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

  const secretArn = process.env.WEBHOOK_SECRET_ARN;
  if (!secretArn) {
    throw new Error('WEBHOOK_SECRET_ARN environment variable not set');
  }

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn })
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
 * Handle market resolution event
 * Updates market status in DynamoDB which triggers MarketResolutionHandler
 */
async function handleMarketResolution(
  conditionId: string,
  outcome: 'YES' | 'NO'
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
 * Looks for Polymarket settlement transactions
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
    // The ConditionResolution event has signature:
    // ConditionResolution(bytes32 indexed conditionId, uint256[] payoutNumerators)
    if (activity.log?.topics) {
      const eventSignature = activity.log.topics[0];
      // ConditionResolution event signature
      const CONDITION_RESOLUTION_SIG = '0xb3a1afa09f29b3e9b7d5d1f9a4e8e9b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9'; // Placeholder

      if (eventSignature === CONDITION_RESOLUTION_SIG) {
        const conditionId = activity.log.topics[1]; // indexed conditionId
        // Parse payout from data to determine outcome
        // This is a placeholder - actual parsing would depend on event structure
        const outcome: 'YES' | 'NO' = 'YES'; // Placeholder

        await handleMarketResolution(conditionId, outcome);
      }
    }
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
    const signature = event.headers['x-alchemy-signature'];
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
      case 'ADDRESS_ACTIVITY':
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
