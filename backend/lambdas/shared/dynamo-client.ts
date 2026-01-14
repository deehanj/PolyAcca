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
  UserCredsEntity,
  NonceEntity,
  AccumulatorEntity,
  BetEntity,
  MarketEntity,
  AccumulatorStatus,
  BetStatus,
  MarketStatus,
} from './types';

// Initialize DynamoDB client
const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLE_NAME = process.env.TABLE_NAME!;

// =============================================================================
// Key Builders
// =============================================================================

export const keys = {
  user: (walletAddress: string) => ({
    PK: `USER#${walletAddress.toLowerCase()}`,
    SK: 'PROFILE',
  }),

  userCreds: (walletAddress: string) => ({
    PK: `USER#${walletAddress.toLowerCase()}`,
    SK: 'CREDS#polymarket',
  }),

  nonce: (walletAddress: string) => ({
    PK: `NONCE#${walletAddress.toLowerCase()}`,
    SK: 'NONCE',
  }),

  accumulator: (walletAddress: string, accumulatorId: string) => ({
    PK: `USER#${walletAddress.toLowerCase()}`,
    SK: `ACCA#${accumulatorId}`,
  }),

  bet: (accumulatorId: string, sequence: number) => ({
    PK: `ACCA#${accumulatorId}`,
    SK: `BET#${String(sequence).padStart(3, '0')}`,
  }),

  market: (conditionId: string) => ({
    PK: `MARKET#${conditionId}`,
    SK: 'MARKET',
  }),

  marketByToken: (tokenId: string) => ({
    PK: `TOKEN#${tokenId}`,
    SK: 'MARKET',
  }),
};

// =============================================================================
// GSI Key Builders
// =============================================================================

export const gsiKeys = {
  accumulatorByStatus: (status: AccumulatorStatus, createdAt: string) => ({
    GSI1PK: `STATUS#${status}`,
    GSI1SK: createdAt,
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
// Generic Operations
// =============================================================================

export async function getItem<T extends BaseEntity>(
  pk: string,
  sk: string
): Promise<T | null> {
  const params: GetCommandInput = {
    TableName: TABLE_NAME,
    Key: { PK: pk, SK: sk },
  };

  const result = await docClient.send(new GetCommand(params));
  return (result.Item as T) || null;
}

export async function putItem<T extends BaseEntity>(item: T): Promise<void> {
  const params: PutCommandInput = {
    TableName: TABLE_NAME,
    Item: item,
  };

  await docClient.send(new PutCommand(params));
}

export async function deleteItem(pk: string, sk: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
    })
  );
}

export async function queryItems<T extends BaseEntity>(
  pk: string,
  skPrefix?: string
): Promise<T[]> {
  const params: QueryCommandInput = {
    TableName: TABLE_NAME,
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
    TableName: TABLE_NAME,
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
// Entity-Specific Operations
// =============================================================================

// User operations
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

// User credentials operations
export async function getUserCreds(walletAddress: string): Promise<UserCredsEntity | null> {
  const { PK, SK } = keys.userCreds(walletAddress);
  return getItem<UserCredsEntity>(PK, SK);
}

export async function saveUserCreds(creds: UserCredsEntity): Promise<void> {
  await putItem(creds);

  // Update user's hasCredentials flag
  const { PK, SK } = keys.user(creds.walletAddress);
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: 'SET hasCredentials = :val, updatedAt = :now',
      ExpressionAttributeValues: {
        ':val': true,
        ':now': new Date().toISOString(),
      },
    })
  );
}

export async function deleteUserCreds(walletAddress: string): Promise<void> {
  const { PK, SK } = keys.userCreds(walletAddress);
  await deleteItem(PK, SK);

  // Update user's hasCredentials flag
  const userKeys = keys.user(walletAddress);
  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: userKeys.PK, SK: userKeys.SK },
      UpdateExpression: 'SET hasCredentials = :val, updatedAt = :now',
      ExpressionAttributeValues: {
        ':val': false,
        ':now': new Date().toISOString(),
      },
    })
  );
}

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

// Accumulator operations
export async function getAccumulator(
  walletAddress: string,
  accumulatorId: string
): Promise<AccumulatorEntity | null> {
  const { PK, SK } = keys.accumulator(walletAddress, accumulatorId);
  return getItem<AccumulatorEntity>(PK, SK);
}

export async function getUserAccumulators(walletAddress: string): Promise<AccumulatorEntity[]> {
  const pk = `USER#${walletAddress.toLowerCase()}`;
  return queryItems<AccumulatorEntity>(pk, 'ACCA#');
}

export async function saveAccumulator(accumulator: AccumulatorEntity): Promise<void> {
  await putItem(accumulator);
}

export async function updateAccumulatorStatus(
  walletAddress: string,
  accumulatorId: string,
  status: AccumulatorStatus,
  updates?: Partial<AccumulatorEntity>
): Promise<void> {
  const { PK, SK } = keys.accumulator(walletAddress, accumulatorId);
  const now = new Date().toISOString();

  let updateExpression = 'SET #status = :status, updatedAt = :now, GSI1PK = :gsi1pk, GSI1SK = :gsi1sk';
  const expressionValues: Record<string, unknown> = {
    ':status': status,
    ':now': now,
    ':gsi1pk': `STATUS#${status}`,
    ':gsi1sk': now,
  };
  const expressionNames: Record<string, string> = {
    '#status': 'status',
  };

  if (updates?.currentValue) {
    updateExpression += ', currentValue = :currentValue';
    expressionValues[':currentValue'] = updates.currentValue;
  }
  if (updates?.completedBets !== undefined) {
    updateExpression += ', completedBets = :completedBets';
    expressionValues[':completedBets'] = updates.completedBets;
  }
  if (updates?.currentBetSequence !== undefined) {
    updateExpression += ', currentBetSequence = :currentBetSequence';
    expressionValues[':currentBetSequence'] = updates.currentBetSequence;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
    })
  );
}

// Bet operations
export async function getBet(accumulatorId: string, sequence: number): Promise<BetEntity | null> {
  const { PK, SK } = keys.bet(accumulatorId, sequence);
  return getItem<BetEntity>(PK, SK);
}

export async function getAccumulatorBets(accumulatorId: string): Promise<BetEntity[]> {
  const pk = `ACCA#${accumulatorId}`;
  return queryItems<BetEntity>(pk, 'BET#');
}

export async function saveBet(bet: BetEntity): Promise<void> {
  await putItem(bet);
}

export async function deleteBet(accumulatorId: string, sequence: number): Promise<void> {
  const { PK, SK } = keys.bet(accumulatorId, sequence);
  await deleteItem(PK, SK);
}

export async function updateBetStatus(
  accumulatorId: string,
  sequence: number,
  status: BetStatus,
  updates?: Partial<BetEntity>
): Promise<void> {
  const { PK, SK } = keys.bet(accumulatorId, sequence);
  const now = new Date().toISOString();

  let updateExpression = 'SET #status = :status, updatedAt = :now, GSI1PK = :gsi1pk, GSI1SK = :gsi1sk';
  const expressionValues: Record<string, unknown> = {
    ':status': status,
    ':now': now,
    ':gsi1pk': `BETSTATUS#${status}`,
    ':gsi1sk': now,
  };
  const expressionNames: Record<string, string> = {
    '#status': 'status',
  };

  if (updates?.orderId) {
    updateExpression += ', orderId = :orderId';
    expressionValues[':orderId'] = updates.orderId;
  }
  if (updates?.executedAt) {
    updateExpression += ', executedAt = :executedAt';
    expressionValues[':executedAt'] = updates.executedAt;
  }
  if (updates?.settledAt) {
    updateExpression += ', settledAt = :settledAt';
    expressionValues[':settledAt'] = updates.settledAt;
  }
  if (updates?.outcome) {
    updateExpression += ', outcome = :outcome';
    expressionValues[':outcome'] = updates.outcome;
  }
  if (updates?.actualPayout) {
    updateExpression += ', actualPayout = :actualPayout';
    expressionValues[':actualPayout'] = updates.actualPayout;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
    })
  );
}

// Market operations
export async function getMarket(conditionId: string): Promise<MarketEntity | null> {
  const { PK, SK } = keys.market(conditionId);
  return getItem<MarketEntity>(PK, SK);
}

export async function getMarketByTokenId(tokenId: string): Promise<MarketEntity | null> {
  // Query GSI2 to find market by token ID
  const results = await queryByGSI<MarketEntity>('GSI2', 'GSI2PK', `TOKEN#${tokenId}`);
  return results[0] || null;
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

export async function getMarketsByStatus(status: MarketStatus): Promise<MarketEntity[]> {
  return queryByGSI<MarketEntity>('GSI1', 'GSI1PK', `MARKETSTATUS#${status}`);
}

export async function updateMarketStatus(
  conditionId: string,
  status: MarketStatus,
  updates?: Partial<MarketEntity>
): Promise<void> {
  const { PK, SK } = keys.market(conditionId);
  const now = new Date().toISOString();

  let updateExpression = 'SET #status = :status, updatedAt = :now, lastSyncedAt = :now, GSI1PK = :gsi1pk';
  const expressionValues: Record<string, unknown> = {
    ':status': status,
    ':now': now,
    ':gsi1pk': `MARKETSTATUS#${status}`,
  };
  const expressionNames: Record<string, string> = {
    '#status': 'status',
  };

  if (updates?.resolutionDate) {
    updateExpression += ', resolutionDate = :resolutionDate, GSI1SK = :gsi1sk';
    expressionValues[':resolutionDate'] = updates.resolutionDate;
    expressionValues[':gsi1sk'] = updates.resolutionDate;
  }
  if (updates?.outcome) {
    updateExpression += ', outcome = :outcome';
    expressionValues[':outcome'] = updates.outcome;
  }
  if (updates?.volume) {
    updateExpression += ', volume = :volume';
    expressionValues[':volume'] = updates.volume;
  }
  if (updates?.liquidity) {
    updateExpression += ', liquidity = :liquidity';
    expressionValues[':liquidity'] = updates.liquidity;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK, SK },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: expressionNames,
    })
  );
}

export async function getBetsByCondition(conditionId: string): Promise<BetEntity[]> {
  return queryByGSI<BetEntity>('GSI2', 'GSI2PK', `CONDITION#${conditionId}`, 'BET#');
}
