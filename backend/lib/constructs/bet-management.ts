import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as cdk from 'aws-cdk-lib/core';
import * as path from 'path';
import type { WebSocketConstruct } from './websocket';
import type { AdminWebSocketConstruct } from './admin-websocket';
import type { CredentialsTableConstruct } from './credentials-table';

export interface BetManagementConstructProps {
  /**
   * DynamoDB table with streams enabled
   */
  table: dynamodb.ITable;
  /**
   * Credentials table construct (for reading Polymarket API keys)
   */
  credentialsTable: CredentialsTableConstruct;
  /**
   * WebSocket construct for granting notification permissions
   */
  websocket?: WebSocketConstruct;
  /**
   * Admin WebSocket construct for granting admin notification permissions
   */
  adminWebsocket?: AdminWebSocketConstruct;
}

/**
 * Bet Management Construct
 *
 * Event-driven bet processing with stream handlers:
 *
 * Flow 1: New Chain (first bet)
 *   API creates chain + bets (first bet status=READY) →
 *   DDB Stream INSERT → BetExecutor
 *
 * Flow 2: Market Resolution
 *   Webhook updates market → MarketResolutionHandler → Settle bets →
 *   Mark next bet READY → DDB Stream MODIFY → BetExecutor
 *   Or: Payout (last bet won) / Mark chain LOST
 *
 * Flow 3: Bet Notifications
 *   User creates chain position → DDB Stream INSERT (USER_CHAIN) →
 *   BetNotificationHandler → Broadcast to WebSocket clients
 */
export class BetManagementConstruct extends Construct {
  public readonly marketResolutionHandler: nodejs.NodejsFunction;
  public readonly betExecutor: nodejs.NodejsFunction;
  public readonly positionTerminationHandler: nodejs.NodejsFunction;
  public readonly betNotificationHandler: nodejs.NodejsFunction;
  public readonly adminNotificationHandler: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: BetManagementConstructProps) {
    super(scope, id);

    const { table, credentialsTable, websocket, adminWebsocket } = props;

    // Shared Lambda config
    const lambdaConfig = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      environment: {
        TABLE_NAME: table.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    };

    // Config for lambdas that need credentials access
    const credentialsLambdaEnv = {
      CREDENTIALS_TABLE_NAME: credentialsTable.table.tableName,
      KMS_KEY_ARN: credentialsTable.encryptionKey.keyArn,
    };

    // =========================================================================
    // Bet Executor - Places orders on Polymarket CLOB
    // Triggered by: Stream (bet status → READY) or direct invocation
    // =========================================================================
    this.betExecutor = new nodejs.NodejsFunction(this, 'BetExecutor', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/streams/bet-executor/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(120),
      description: 'Executes bets on Polymarket CLOB (stream + direct invocation)',
      environment: {
        ...lambdaConfig.environment,
        ...credentialsLambdaEnv,
      },
    });

    // =========================================================================
    // Market Resolution Handler - Triggers on market status → RESOLVED
    // =========================================================================
    this.marketResolutionHandler = new nodejs.NodejsFunction(this, 'MarketResolutionHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/streams/market-resolution-handler/index.ts'),
      handler: 'handler',
      description: 'Handles market resolution, settles bets, triggers next actions',
    });

    // =========================================================================
    // Position Termination Handler - Triggers on UserChain LOST/CANCELLED/FAILED
    // Voids remaining bets and cancels orders on Polymarket
    // =========================================================================
    this.positionTerminationHandler = new nodejs.NodejsFunction(this, 'PositionTerminationHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/streams/position-termination-handler/index.ts'),
      handler: 'handler',
      description: 'Handles position termination, voids bets, cancels orders',
      environment: {
        ...lambdaConfig.environment,
        ...credentialsLambdaEnv,
      },
    });

    // =========================================================================
    // Bet Notification Handler - Broadcasts new bets to WebSocket clients
    // Triggered by: Stream (USER_CHAIN INSERT)
    // =========================================================================
    this.betNotificationHandler = new nodejs.NodejsFunction(this, 'BetNotificationHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/streams/bet-notification-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      description: 'Broadcasts new bet notifications to WebSocket clients',
      environment: {
        ...lambdaConfig.environment,
        WEBSOCKET_ENDPOINT: websocket?.webSocketEndpoint || '',
      },
    });

    // =========================================================================
    // Admin Notification Handler - Broadcasts updates to admin dashboard
    // Triggered by: Stream (CHAIN, BET, USER_CHAIN status changes)
    // =========================================================================
    this.adminNotificationHandler = new nodejs.NodejsFunction(this, 'AdminNotificationHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/streams/admin-notification-handler/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      description: 'Broadcasts admin dashboard updates to admin WebSocket clients',
      environment: {
        ...lambdaConfig.environment,
        ADMIN_WEBSOCKET_ENDPOINT: adminWebsocket?.webSocketEndpoint || '',
      },
    });

    // =========================================================================
    // Permissions
    // =========================================================================

    // DynamoDB read/write for all handlers
    table.grantReadWriteData(this.marketResolutionHandler);
    table.grantReadWriteData(this.betExecutor);
    table.grantReadWriteData(this.positionTerminationHandler);
    table.grantReadWriteData(this.betNotificationHandler);
    table.grantReadWriteData(this.adminNotificationHandler);

    // Stream read access for stream handlers
    table.grantStreamRead(this.marketResolutionHandler);
    table.grantStreamRead(this.betExecutor);
    table.grantStreamRead(this.positionTerminationHandler);
    table.grantStreamRead(this.betNotificationHandler);
    table.grantStreamRead(this.adminNotificationHandler);

    // Credentials table read access (for Polymarket API keys)
    // Only betExecutor and positionTerminationHandler need this
    credentialsTable.grantRead(this.betExecutor);
    credentialsTable.grantRead(this.positionTerminationHandler);

    // WebSocket permission for notification handler
    if (websocket) {
      websocket.grantManageConnections(this.betNotificationHandler);
    }

    // Admin WebSocket permission for admin notification handler
    if (adminWebsocket) {
      adminWebsocket.grantManageConnections(this.adminNotificationHandler);
    }

    // =========================================================================
    // Stream Event Sources
    // =========================================================================

    // Market Resolution Handler: Market status changes to RESOLVED
    this.marketResolutionHandler.addEventSource(
      new eventsources.DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        bisectBatchOnError: true,
        retryAttempts: 3,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('MODIFY'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('MARKET') },
                status: { S: lambda.FilterRule.isEqual('RESOLVED') },
              },
            },
          }),
        ],
      })
    );

    // Bet Executor: Bet with status=READY (INSERT for first bet, MODIFY for subsequent)
    this.betExecutor.addEventSource(
      new eventsources.DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        bisectBatchOnError: true,
        retryAttempts: 3,
        filters: [
          // First bet: INSERT with status=READY
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('INSERT'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('BET') },
                status: { S: lambda.FilterRule.isEqual('READY') },
              },
            },
          }),
          // Subsequent bets: MODIFY to status=READY
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('MODIFY'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('BET') },
                status: { S: lambda.FilterRule.isEqual('READY') },
              },
            },
          }),
        ],
      })
    );

    // Position Termination Handler: USER_CHAIN status changes to LOST/CANCELLED/FAILED
    this.positionTerminationHandler.addEventSource(
      new eventsources.DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        bisectBatchOnError: true,
        retryAttempts: 3,
        filters: [
          // USER_CHAIN status changed to LOST
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('MODIFY'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('USER_CHAIN') },
                status: { S: lambda.FilterRule.isEqual('LOST') },
              },
            },
          }),
          // USER_CHAIN status changed to CANCELLED
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('MODIFY'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('USER_CHAIN') },
                status: { S: lambda.FilterRule.isEqual('CANCELLED') },
              },
            },
          }),
          // USER_CHAIN status changed to FAILED
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('MODIFY'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('USER_CHAIN') },
                status: { S: lambda.FilterRule.isEqual('FAILED') },
              },
            },
          }),
        ],
      })
    );

    // Bet Notification Handler: USER_CHAIN INSERT (new user joins a chain)
    this.betNotificationHandler.addEventSource(
      new eventsources.DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        bisectBatchOnError: true,
        retryAttempts: 2,
        filters: [
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('INSERT'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('USER_CHAIN') },
              },
            },
          }),
        ],
      })
    );

    // Admin Notification Handler: CHAIN/BET/USER_CHAIN INSERT and MODIFY
    // Broadcasts all relevant entity changes to admin dashboard
    this.adminNotificationHandler.addEventSource(
      new eventsources.DynamoEventSource(table, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        bisectBatchOnError: true,
        retryAttempts: 2,
        filters: [
          // CHAIN INSERT (new chain created)
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('INSERT'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('CHAIN') },
              },
            },
          }),
          // CHAIN MODIFY (totalValue, status changes)
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('MODIFY'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('CHAIN') },
              },
            },
          }),
          // BET INSERT (new bet created)
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('INSERT'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('BET') },
              },
            },
          }),
          // BET MODIFY (status changes: READY, PLACED, WON, LOST, etc.)
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('MODIFY'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('BET') },
              },
            },
          }),
          // USER_CHAIN INSERT (new user position)
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('INSERT'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('USER_CHAIN') },
              },
            },
          }),
          // USER_CHAIN MODIFY (status changes: ACTIVE, LOST, WON, etc.)
          lambda.FilterCriteria.filter({
            eventName: lambda.FilterRule.isEqual('MODIFY'),
            dynamodb: {
              NewImage: {
                entityType: { S: lambda.FilterRule.isEqual('USER_CHAIN') },
              },
            },
          }),
        ],
      })
    );
  }
}
