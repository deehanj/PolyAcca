import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cdk from 'aws-cdk-lib/core';

export interface DatabaseConstructProps {
  /**
   * Removal policy for the table
   * @default RETAIN
   */
  removalPolicy?: cdk.RemovalPolicy;
}

/**
 * Single-table DynamoDB design for PolyAcca
 *
 * Entity patterns:
 * | Entity      | PK                  | SK                    |
 * |-------------|---------------------|-----------------------|
 * | User        | USER#<address>      | PROFILE               |
 * | UserCreds   | USER#<address>      | CREDS#polymarket      |
 * | Nonce       | NONCE#<address>     | NONCE                 |
 * | Chain       | CHAIN#<chainId>     | DEFINITION            |
 * | UserChain   | CHAIN#<chainId>     | USER#<address>        |
 * | Bet         | CHAIN#<chainId>     | BET#<address>#<seq>   |
 *
 * GSI1 (by status):
 * | Entity      | GSI1PK              | GSI1SK                |
 * |-------------|---------------------|-----------------------|
 * | UserChain   | STATUS#<status>     | <createdAt>           |
 * | Bet         | BETSTATUS#<status>  | <createdAt>           |
 */
export class DatabaseConstruct extends Construct {
  public readonly table: dynamodb.Table;
  public readonly encryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props?: DatabaseConstructProps) {
    super(scope, id);

    const removalPolicy = props?.removalPolicy ?? cdk.RemovalPolicy.RETAIN;

    // KMS key for encrypting sensitive data (user credentials)
    this.encryptionKey = new kms.Key(this, 'EncryptionKey', {
      description: 'PolyAcca encryption key for user credentials',
      enableKeyRotation: true,
      removalPolicy,
    });

    // Single-table DynamoDB
    this.table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      timeToLiveAttribute: 'TTL',
    });

    // GSI1: Query by status (for active chains, pending bets)
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: Query bets by market token ID (for settlement processing)
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Outputs
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB Table Name',
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'DynamoDB Table ARN',
    });

    new cdk.CfnOutput(this, 'StreamArn', {
      value: this.table.tableStreamArn!,
      description: 'DynamoDB Stream ARN',
    });
  }
}
