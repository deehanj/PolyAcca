import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cdk from 'aws-cdk-lib/core';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface CredentialsTableConstructProps {
  /**
   * Removal policy for the table
   * @default RETAIN
   */
  removalPolicy?: cdk.RemovalPolicy;
}

/**
 * Separate DynamoDB table for storing Polymarket API credentials
 *
 * This table is isolated from the main table for security:
 * - Only specific lambdas are granted access
 * - Uses customer-managed KMS key for encryption
 * - Contains only credential data, no other entities
 *
 * Entity pattern:
 * | Entity      | PK                  | SK                    |
 * |-------------|---------------------|-----------------------|
 * | UserCreds   | USER#<address>      | CREDS#polymarket      |
 */
export class CredentialsTableConstruct extends Construct {
  public readonly table: dynamodb.Table;
  public readonly encryptionKey: kms.Key;

  constructor(scope: Construct, id: string, props?: CredentialsTableConstructProps) {
    super(scope, id);

    const removalPolicy = props?.removalPolicy ?? cdk.RemovalPolicy.RETAIN;

    // Customer-managed KMS key for encrypting credentials
    // This key is used both for DynamoDB encryption and field-level encryption
    this.encryptionKey = new kms.Key(this, 'CredentialsEncryptionKey', {
      description: 'PolyAcca encryption key for Polymarket API credentials',
      enableKeyRotation: true,
      removalPolicy,
      alias: 'polyacca/credentials',
    });

    // Separate credentials table with KMS encryption
    this.table = new dynamodb.Table(this, 'CredentialsTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.encryptionKey,
      timeToLiveAttribute: 'TTL',
    });

    // Outputs
    new cdk.CfnOutput(this, 'CredentialsTableName', {
      value: this.table.tableName,
      description: 'Credentials DynamoDB Table Name',
    });

    new cdk.CfnOutput(this, 'CredentialsTableArn', {
      value: this.table.tableArn,
      description: 'Credentials DynamoDB Table ARN',
    });
  }

  /**
   * Grant read access to a Lambda function (for bet execution)
   */
  grantRead(grantee: iam.IGrantable): void {
    this.table.grantReadData(grantee);
    this.encryptionKey.grantDecrypt(grantee);
  }

  /**
   * Grant read/write access to a Lambda function (for credentials management)
   */
  grantReadWrite(grantee: iam.IGrantable): void {
    this.table.grantReadWriteData(grantee);
    this.encryptionKey.grantEncryptDecrypt(grantee);
  }
}
