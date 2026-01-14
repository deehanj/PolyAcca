import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as cdk from 'aws-cdk-lib/core';
import * as path from 'path';

export interface BetManagementConstructProps {
  /**
   * DynamoDB table with streams enabled
   */
  table: dynamodb.ITable;
  /**
   * KMS key for decrypting user credentials
   */
  encryptionKey: kms.IKey;
}

/**
 * Bet Management Construct
 *
 * Event-driven bet processing with stream handlers:
 *
 * Flow 1: New Accumulator (first bet)
 *   API creates accumulator + bets (first bet status=READY) →
 *   DDB Stream INSERT → BetExecutor
 *
 * Flow 2: Market Resolution
 *   Webhook updates market → MarketResolutionHandler → Settle bets →
 *   Mark next bet READY → DDB Stream MODIFY → BetExecutor
 *   Or: Payout (last bet won) / Mark accumulator LOST
 */
export class BetManagementConstruct extends Construct {
  public readonly marketResolutionHandler: nodejs.NodejsFunction;
  public readonly betExecutor: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: BetManagementConstructProps) {
    super(scope, id);

    const { table, encryptionKey } = props;

    // Shared Lambda config
    const lambdaConfig = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(60),
      environment: {
        TABLE_NAME: table.tableName,
        KMS_KEY_ARN: encryptionKey.keyArn,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
      },
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
    // Permissions
    // =========================================================================

    // DynamoDB read/write for all handlers
    table.grantReadWriteData(this.marketResolutionHandler);
    table.grantReadWriteData(this.betExecutor);

    // Stream read access for stream handlers
    table.grantStreamRead(this.marketResolutionHandler);
    table.grantStreamRead(this.betExecutor);

    // KMS decrypt for reading user credentials
    encryptionKey.grantDecrypt(this.marketResolutionHandler);
    encryptionKey.grantDecrypt(this.betExecutor);

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
  }
}
