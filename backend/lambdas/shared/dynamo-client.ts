/**
 * DynamoDB client utilities for PolyAcca
 *
 * Single-table design helpers and entity operations
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  UpdateCommand,
  type GetCommandInput,
  type PutCommandInput,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type {
  BaseEntity,
  UserEntity,
  NonceEntity,
  ChainEntity,
  UserChainEntity,
  BetEntity,
  MarketEntity,
  ConnectionEntity,
  UserChainStatus,
  BetStatus,
  MarketStatus,
} from './types';
import { requireEnvVar } from '../utils/envVars';

// Environment variables - validated at module load time
const MONOTABLE_NAME = requireEnvVar('MONOTABLE_NAME');

// Initialize DynamoDB client
const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// =============================================================================
// Key Builders
// =============================================================================

export const keys = {
  user: (walletAddress: string) => ({
    PK: `USER#${walletAddress.toLowerCase()}`,
    SK: 'PROFILE',
  }),

  // NOTE: embedded wallet credentials are in embedded-wallet-credentials.ts (separate CREDENTIALS_TABLE_NAME)

  nonce: (walletAddress: string) => ({
    PK: `NONCE#${walletAddress.toLowerCase()}`,
    SK: 'NONCE',
  }),

  // Chain definition
  chain: (chainId: string) => ({
    PK: `CHAIN#${chainId}`,
    SK: 'DEFINITION',
  }),

  // User's position on a chain
  userChain: (chainId: string, walletAddress: string) => ({
    PK: `CHAIN#${chainId}`,
    SK: `USER#${walletAddress.toLowerCase()}`,
  }),

  // User's bet within a position
  bet: (chainId: string, walletAddress: string, sequence: number) => ({
    PK: `CHAIN#${chainId}`,
    SK: `BET#${walletAddress.toLowerCase()}#${String(sequence).padStart(3, '0')}`,
  }),

  market: (conditionId: string) => ({
    PK: `MARKET#${conditionId}`,
    SK: 'MARKET',
  }),

  // WebSocket connection
  connection: (connectionId: string) => ({
    PK: `CONN#${connectionId}`,
    SK: 'CONN',
  }),

  // Admin WebSocket connection
  adminConnection: (connectionId: string) => ({
    PK: `ADMINCONN#${connectionId}`,
    SK: 'CONN',
  }),
};

// =============================================================================
// GSI Key Builders
// =============================================================================

export const gsiKeys = {
  // For listing user's chains
  userChainByUser: (walletAddress: string, chainId: string) => ({
    GSI1PK: `USER#${walletAddress.toLowerCase()}`,
    GSI1SK: `CHAIN#${chainId}`,
  }),

  betByStatus: (status: BetStatus, createdAt: string) => ({
    GSI1PK: `BETSTATUS#${status}`,
    GSI1SK: createdAt,
  }),

  betByCondition: (conditionId: string, betId: string) => ({
    GSI2PK: `CONDITION#${conditionId}`,
    GSI2SK: `BET#${betId}`,
  }),

  marketByStatus: (status: MarketStatus, endDate: string) => ({
    GSI1PK: `MARKETSTATUS#${status}`,
    GSI1SK: endDate,
  }),
};

// =============================================================================
// Update Expression Helpers
// =============================================================================

/**
 * Append optional fields to an UpdateExpression
 */
function appendUpdates(
  updates: Record<string, unknown> | undefined,
  fields: string[],
  expression: string,
  values: Record<string, unknown>
): string {
  if (!updates) return expression;

  for (const field of fields) {
    const value = updates[field as keyof typeof updates];
    if (value !== undefined) {
      expression += `, ${field} = :${field}`;
      values[`:${field}`] = value;
    }
  }
  return expression;
}

// =============================================================================
// Generic Operations
// =============================================================================

export async function getItem<T extends BaseEntity>(
  pk: string,
  sk: string
): Promise<T | null> {
  const params: GetCommandInput = {
    TableName: MONOTABLE_NAME,
    Key: { PK: pk, SK: sk },
  };

  const result = await docClient.send(new GetCommand(params));
  return (result.Item as T) || null;
}

export async function putItem<T extends BaseEntity>(item: T): Promise<void> {
  const params: PutCommandInput = {
    TableName: MONOTABLE_NAME,
    Item: item,
  };

  await docClient.send(new PutCommand(params));
}

export async function deleteItem(pk: string, sk: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: MONOTABLE_NAME,
      Key: { PK: pk, SK: sk },
    })
  );
}

export async function queryItems<T extends BaseEntity>(
  pk: string,
  skPrefix?: string
): Promise<T[]> {
  const params: QueryCommandInput = {
    TableName: MONOTABLE_NAME,
    KeyConditionExpression: skPrefix
      ? 'PK = :pk AND begins_with(SK, :sk)'
      : 'PK = :pk',
    ExpressionAttributeValues: skPrefix
      ? { ':pk': pk, ':sk': skPrefix }
      : { ':pk': pk },
  };

  const result = await docClient.send(new QueryCommand(params));
  return (result.Items as T[]) || [];
}

export async function queryByGSI<T extends BaseEntity>(
  indexName: string,
  pkName: string,
  pkValue: string,
  skPrefix?: string
): Promise<T[]> {
  const skName = pkName === 'GSI1PK' ? 'GSI1SK' : 'GSI2SK';

  const params: QueryCommandInput = {
    TableName: MONOTABLE_NAME,
    IndexName: indexName,
    KeyConditionExpression: skPrefix
      ? `${pkName} = :pk AND begins_with(${skName}, :sk)`
      : `${pkName} = :pk`,
    ExpressionAttributeValues: skPrefix
      ? { ':pk': pkValue, ':sk': skPrefix }
      : { ':pk': pkValue },
  };

  const result = await docClient.send(new QueryCommand(params));
  return (result.Items as T[]) || [];
}

// =============================================================================
// User Operations
// =============================================================================

export async function getUser(walletAddress: string): Promise<UserEntity | null> {
  const { PK, SK } = keys.user(walletAddress);
  return getItem<UserEntity>(PK, SK);
}

export async function createUser(walletAddress: string, displayName?: string): Promise<UserEntity> {
  const now = new Date().toISOString();
  const { PK, SK } = keys.user(walletAddress);

  const user: UserEntity = {
    PK,
    SK,
    entityType: 'USER',
    walletAddress: walletAddress.toLowerCase(),
    displayName,
    hasCredentials: false,
    createdAt: now,
    updatedAt: now,
  };

  await putItem(user);
  return user;
}

export async function getOrCreateUser(walletAddress: string): Promise<UserEntity> {
  const existing = await getUser(walletAddress);
  if (existing) {
    return existing;
  }
  return createUser(walletAddress);
}

/**
 * Update user with embedded wallet information
 */
export async function updateUserEmbeddedWallet(
  walletAddress: string,
  embeddedWallet: {
    turnkeyWalletId: string;
    embeddedWalletAddress: string;
  }
): Promise<void> {
  const { PK, SK } = keys.user(walletAddress);
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: MONOTABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: `
        SET turnkeyWalletId = :turnkeyWalletId,
            embeddedWalletAddress = :embeddedWalletAddress,
            updatedAt = :now
      `,
      ExpressionAttributeValues: {
        ':turnkeyWalletId': embeddedWallet.turnkeyWalletId,
        ':embeddedWalletAddress': embeddedWallet.embeddedWalletAddress.toLowerCase(),
        ':now': now,
      },
    })
  );
}

/**
 * Update user with Polymarket Safe address and mark credentials as ready
 */
export async function updateUserPolymarketSafe(
  walletAddress: string,
  polymarketSafeAddress: string
): Promise<void> {
  const { PK, SK } = keys.user(walletAddress);
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: MONOTABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: `
        SET polymarketSafeAddress = :safeAddress,
            hasCredentials = :hasCredentials,
            updatedAt = :now
      `,
      ExpressionAttributeValues: {
        ':safeAddress': polymarketSafeAddress.toLowerCase(),
        ':hasCredentials': true,
        ':now': now,
      },
    })
  );
}

/**
 * Mark user as having Polymarket credentials (EOA flow, no Safe address)
 */
export async function updateUserHasCredentials(walletAddress: string): Promise<void> {
  const { PK, SK } = keys.user(walletAddress);
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: MONOTABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: 'SET hasCredentials = :hasCredentials, updatedAt = :now',
      ExpressionAttributeValues: {
        ':hasCredentials': true,
        ':now': now,
      },
    })
  );
}

// NOTE: Embedded wallet credentials are in embedded-wallet-credentials.ts
// for security isolation. Only specific lambdas have access to that table.

// Nonce operations
export async function getNonce(walletAddress: string): Promise<NonceEntity | null> {
  const { PK, SK } = keys.nonce(walletAddress);
  return getItem<NonceEntity>(PK, SK);
}

export async function saveNonce(walletAddress: string, nonce: string): Promise<NonceEntity> {
  const now = new Date().toISOString();
  const { PK, SK } = keys.nonce(walletAddress);

  // TTL: 5 minutes from now
  const ttl = Math.floor(Date.now() / 1000) + 5 * 60;

  const entity: NonceEntity = {
    PK,
    SK,
    entityType: 'NONCE',
    walletAddress: walletAddress.toLowerCase(),
    nonce,
    TTL: ttl,
    createdAt: now,
    updatedAt: now,
  };

  await putItem(entity);
  return entity;
}

export async function deleteNonce(walletAddress: string): Promise<void> {
  const { PK, SK } = keys.nonce(walletAddress);
  await deleteItem(PK, SK);
}

// =============================================================================
// Chain Operations (shared chain definition)
// =============================================================================

export async function getChain(chainId: string): Promise<ChainEntity | null> {
  const { PK, SK } = keys.chain(chainId);
  return getItem<ChainEntity>(PK, SK);
}

/**
 * Upsert chain - creates if not exists, updates totalValue if exists
 */
export async function upsertChain(
  chain: ChainEntity,
  additionalStake: string
): Promise<void> {
  const { PK, SK } = keys.chain(chain.chainId);
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: MONOTABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: `
        SET chainId = if_not_exists(chainId, :chainId),
            entityType = if_not_exists(entityType, :entityType),
            #name = if_not_exists(#name, :name),
            description = if_not_exists(description, :description),
            imageUrl = if_not_exists(imageUrl, :imageUrl),
            chain = if_not_exists(chain, :chain),
            legs = if_not_exists(legs, :legs),
            #status = if_not_exists(#status, :status),
            createdAt = if_not_exists(createdAt, :createdAt),
            totalValue = if_not_exists(totalValue, :zero) + :additionalStake,
            updatedAt = :now
      `,
      ExpressionAttributeValues: {
        ':chainId': chain.chainId,
        ':entityType': 'CHAIN',
        ':name': chain.name,
        ':description': chain.description ?? null,
        ':imageUrl': chain.imageUrl ?? null,
        ':chain': chain.chain,
        ':legs': chain.legs,
        ':status': chain.status,
        ':createdAt': chain.createdAt,
        ':zero': 0,
        ':additionalStake': parseFloat(additionalStake),
        ':now': now,
      },
      ExpressionAttributeNames: {
        '#status': 'status',
        '#name': 'name',
      },
    })
  );
}

/**
 * Decrement chain totalValue (used when user cancels their position)
 */
export async function decrementChainTotalValue(
  chainId: string,
  amount: number
): Promise<void> {
  const { PK, SK } = keys.chain(chainId);
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: MONOTABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: 'SET totalValue = totalValue - :amount, updatedAt = :now',
      ExpressionAttributeValues: {
        ':amount': amount,
        ':now': now,
      },
    })
  );
}

// =============================================================================
// UserChain Operations (user's stake on a chain)
// =============================================================================

export async function getUserChain(
  chainId: string,
  walletAddress: string
): Promise<UserChainEntity | null> {
  const { PK, SK } = keys.userChain(chainId, walletAddress);
  return getItem<UserChainEntity>(PK, SK);
}

export async function getUserChains(walletAddress: string): Promise<UserChainEntity[]> {
  return queryByGSI<UserChainEntity>('GSI1', 'GSI1PK', `USER#${walletAddress.toLowerCase()}`, 'CHAIN#');
}

export async function getChainUsers(chainId: string): Promise<UserChainEntity[]> {
  const pk = `CHAIN#${chainId}`;
  return queryItems<UserChainEntity>(pk, 'USER#');
}

export async function saveUserChain(userChain: UserChainEntity): Promise<void> {
  await putItem(userChain);
}

export async function updateUserChainStatus(
  chainId: string,
  walletAddress: string,
  status: UserChainStatus,
  updates?: Partial<UserChainEntity>
): Promise<void> {
  const { PK, SK } = keys.userChain(chainId, walletAddress);
  const now = new Date().toISOString();

  const expressionValues: Record<string, unknown> = { ':status': status, ':now': now };
  const updateExpression = appendUpdates(
    updates,
    ['currentValue', 'completedLegs', 'currentLegSequence'],
    'SET #status = :status, updatedAt = :now',
    expressionValues
  );

  await docClient.send(
    new UpdateCommand({
      TableName: MONOTABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: { '#status': 'status' },
    })
  );
}

// =============================================================================
// Bet Operations (user's individual bet within a position)
// =============================================================================

export async function getBet(
  chainId: string,
  walletAddress: string,
  sequence: number
): Promise<BetEntity | null> {
  const { PK, SK } = keys.bet(chainId, walletAddress, sequence);
  return getItem<BetEntity>(PK, SK);
}

export async function getChainBets(
  chainId: string,
  walletAddress: string
): Promise<BetEntity[]> {
  const pk = `CHAIN#${chainId}`;
  const skPrefix = `BET#${walletAddress.toLowerCase()}#`;
  return queryItems<BetEntity>(pk, skPrefix);
}

export async function saveBet(bet: BetEntity): Promise<void> {
  await putItem(bet);
}

export async function updateBetStatus(
  chainId: string,
  walletAddress: string,
  sequence: number,
  status: BetStatus,
  updates?: Partial<BetEntity>
): Promise<void> {
  const { PK, SK } = keys.bet(chainId, walletAddress, sequence);
  const now = new Date().toISOString();

  const expressionValues: Record<string, unknown> = {
    ':status': status,
    ':now': now,
    ':gsi1pk': `BETSTATUS#${status}`,
    ':gsi1sk': now,
  };
  const updateExpression = appendUpdates(
    updates,
    ['orderId', 'executedAt', 'settledAt', 'outcome', 'actualPayout'],
    'SET #status = :status, updatedAt = :now, GSI1PK = :gsi1pk, GSI1SK = :gsi1sk',
    expressionValues
  );

  await docClient.send(
    new UpdateCommand({
      TableName: MONOTABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: { '#status': 'status' },
    })
  );
}

export async function getBetsByCondition(conditionId: string): Promise<BetEntity[]> {
  return queryByGSI<BetEntity>('GSI2', 'GSI2PK', `CONDITION#${conditionId}`, 'BET#');
}

// =============================================================================
// Market Operations
// =============================================================================

export async function getMarket(conditionId: string): Promise<MarketEntity | null> {
  const { PK, SK } = keys.market(conditionId);
  return getItem<MarketEntity>(PK, SK);
}

export async function saveMarket(market: MarketEntity): Promise<void> {
  // Save main market record
  await putItem(market);

  // Also save token ID lookups for quick access
  const yesTokenLookup: BaseEntity = {
    PK: `TOKEN#${market.yesTokenId}`,
    SK: 'MARKET',
    GSI2PK: `TOKEN#${market.yesTokenId}`,
    GSI2SK: `MARKET#${market.conditionId}`,
    createdAt: market.createdAt,
    updatedAt: market.updatedAt,
  };
  const noTokenLookup: BaseEntity = {
    PK: `TOKEN#${market.noTokenId}`,
    SK: 'MARKET',
    GSI2PK: `TOKEN#${market.noTokenId}`,
    GSI2SK: `MARKET#${market.conditionId}`,
    createdAt: market.createdAt,
    updatedAt: market.updatedAt,
  };

  await Promise.all([putItem(yesTokenLookup), putItem(noTokenLookup)]);
}

/**
 * Upsert market - creates if not exists (idempotent)
 * Used during chain creation to ensure markets exist for resolution handling
 */
export async function upsertMarket(market: MarketEntity): Promise<void> {
  const { PK, SK } = keys.market(market.conditionId);

  // Use conditional write - only create if doesn't exist
  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...market, PK, SK },
        ConditionExpression: 'attribute_not_exists(PK)',
      })
    );

    // Market was created - also create token lookups
    const yesTokenLookup: BaseEntity = {
      PK: `TOKEN#${market.yesTokenId}`,
      SK: 'MARKET',
      GSI2PK: `TOKEN#${market.yesTokenId}`,
      GSI2SK: `MARKET#${market.conditionId}`,
      createdAt: market.createdAt,
      updatedAt: market.updatedAt,
    };
    const noTokenLookup: BaseEntity = {
      PK: `TOKEN#${market.noTokenId}`,
      SK: 'MARKET',
      GSI2PK: `TOKEN#${market.noTokenId}`,
      GSI2SK: `MARKET#${market.conditionId}`,
      createdAt: market.createdAt,
      updatedAt: market.updatedAt,
    };

    await Promise.all([putItem(yesTokenLookup), putItem(noTokenLookup)]);
  } catch (err) {
    if ((err as Error).name === 'ConditionalCheckFailedException') {
      // Market already exists - that's fine, skip
      return;
    }
    throw err;
  }
}

export async function updateMarketStatus(
  conditionId: string,
  status: MarketStatus,
  updates?: Partial<MarketEntity>
): Promise<void> {
  const { PK, SK } = keys.market(conditionId);
  const now = new Date().toISOString();

  const expressionValues: Record<string, unknown> = {
    ':status': status,
    ':now': now,
    ':gsi1pk': `MARKETSTATUS#${status}`,
  };

  let baseExpression = 'SET #status = :status, updatedAt = :now, lastSyncedAt = :now, GSI1PK = :gsi1pk';

  // resolutionDate also updates GSI1SK
  if (updates?.resolutionDate) {
    baseExpression += ', resolutionDate = :resolutionDate, GSI1SK = :gsi1sk';
    expressionValues[':resolutionDate'] = updates.resolutionDate;
    expressionValues[':gsi1sk'] = updates.resolutionDate;
  }

  const updateExpression = appendUpdates(
    updates,
    ['outcome', 'volume', 'liquidity'],
    baseExpression,
    expressionValues
  );

  await docClient.send(
    new UpdateCommand({
      TableName: MONOTABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: { '#status': 'status' },
    })
  );
}

// =============================================================================
// Connection Operations (WebSocket connections)
// =============================================================================

export async function saveConnection(connectionId: string, walletAddress?: string): Promise<void> {
  const now = new Date().toISOString();
  const { PK, SK } = keys.connection(connectionId);

  // TTL: 24 hours from now
  const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

  const connection: ConnectionEntity = {
    PK,
    SK,
    entityType: 'CONNECTION',
    connectionId,
    walletAddress: walletAddress?.toLowerCase(),
    connectedAt: now,
    TTL: ttl,
    createdAt: now,
    updatedAt: now,
  };

  await putItem(connection);
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const { PK, SK } = keys.connection(connectionId);
  await deleteItem(PK, SK);
}

export async function getAllConnections(): Promise<ConnectionEntity[]> {
  // Scan for all connections (for broadcast notifications)
  // This works for moderate scale; for high scale, consider using a GSI
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const result = await docClient.send(
    new ScanCommand({
      TableName: MONOTABLE_NAME,
      FilterExpression: 'begins_with(PK, :pk)',
      ExpressionAttributeValues: { ':pk': 'CONN#' },
    })
  );

  return (result.Items as ConnectionEntity[]) || [];
}

// =============================================================================
// Admin Operations (for dashboard)
// =============================================================================

/**
 * Get all chains (admin only)
 */
export async function getAllChains(): Promise<ChainEntity[]> {
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const result = await docClient.send(
    new ScanCommand({
      TableName: MONOTABLE_NAME,
      FilterExpression: 'begins_with(PK, :pk) AND SK = :sk',
      ExpressionAttributeValues: { ':pk': 'CHAIN#', ':sk': 'DEFINITION' },
    })
  );

  return (result.Items as ChainEntity[]) || [];
}

/**
 * Get all bets for a chain across all users (admin only)
 */
export async function getAllChainBets(chainId: string): Promise<BetEntity[]> {
  const pk = `CHAIN#${chainId}`;
  return queryItems<BetEntity>(pk, 'BET#');
}

/**
 * Get all markets (admin only)
 */
export async function getAllMarkets(): Promise<MarketEntity[]> {
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const result = await docClient.send(
    new ScanCommand({
      TableName: MONOTABLE_NAME,
      FilterExpression: 'begins_with(PK, :pk) AND SK = :sk',
      ExpressionAttributeValues: { ':pk': 'MARKET#', ':sk': 'MARKET' },
    })
  );

  return (result.Items as MarketEntity[]) || [];
}

// =============================================================================
// Admin Connection Operations
// =============================================================================

interface AdminConnectionEntity extends BaseEntity {
  entityType: 'ADMIN_CONNECTION';
  connectionId: string;
  walletAddress: string;
  connectedAt: string;
  TTL: number;
}

export async function saveAdminConnection(connectionId: string, walletAddress: string): Promise<void> {
  const now = new Date().toISOString();
  const { PK, SK } = keys.adminConnection(connectionId);

  // TTL: 24 hours from now
  const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

  const connection: AdminConnectionEntity = {
    PK,
    SK,
    entityType: 'ADMIN_CONNECTION',
    connectionId,
    walletAddress: walletAddress.toLowerCase(),
    connectedAt: now,
    TTL: ttl,
    createdAt: now,
    updatedAt: now,
  };

  await putItem(connection);
}

export async function deleteAdminConnection(connectionId: string): Promise<void> {
  const { PK, SK } = keys.adminConnection(connectionId);
  await deleteItem(PK, SK);
}

export async function getAllAdminConnections(): Promise<AdminConnectionEntity[]> {
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const result = await docClient.send(
    new ScanCommand({
      TableName: MONOTABLE_NAME,
      FilterExpression: 'begins_with(PK, :pk)',
      ExpressionAttributeValues: { ':pk': 'ADMINCONN#' },
    })
  );

  return (result.Items as AdminConnectionEntity[]) || [];
}
