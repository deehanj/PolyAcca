import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';

// Constructs
import { SecretsConstruct } from './constructs/secrets';
import { DatabaseConstruct } from './constructs/database';
import { AuthConstruct } from './constructs/auth';
import { ApiConstruct } from './constructs/api';
import { BetManagementConstruct } from './constructs/bet-management';
import { AlchemyConstruct } from './constructs/alchemy';

export interface BackendStackProps extends cdk.StackProps {
  /**
   * Environment name (e.g., 'dev', 'prod')
   * @default 'dev'
   */
  environment?: string;
}

export class BackendStack extends cdk.Stack {
  public readonly secrets: SecretsConstruct;
  public readonly database: DatabaseConstruct;
  public readonly auth: AuthConstruct;
  public readonly api: ApiConstruct;
  public readonly betManagement: BetManagementConstruct;
  public readonly alchemy: AlchemyConstruct;

  constructor(scope: Construct, id: string, props?: BackendStackProps) {
    super(scope, id, props);

    const environment = props?.environment ?? 'dev';
    const isProd = environment === 'prod';

    // ==========================================================================
    // Secrets (platform-level)
    // ==========================================================================
    this.secrets = new SecretsConstruct(this, 'Secrets', {
      secretNamePrefix: `polyacca/${environment}`,
    });

    // ==========================================================================
    // Database (single-table DynamoDB with streams)
    // ==========================================================================
    this.database = new DatabaseConstruct(this, 'Database', {
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ==========================================================================
    // Auth (wallet-based authentication)
    // ==========================================================================
    this.auth = new AuthConstruct(this, 'Auth', {
      table: this.database.table,
      jwtSecretArn: this.secrets.jwtSecretArn,
      tokenExpiryHours: 24,
    });

    // ==========================================================================
    // API (REST API Gateway with Lambda handlers)
    // ==========================================================================
    this.api = new ApiConstruct(this, 'Api', {
      table: this.database.table,
      encryptionKey: this.database.encryptionKey,
      auth: this.auth,
    });

    // ==========================================================================
    // Bet Management (stream handlers and bet executor)
    // ==========================================================================
    this.betManagement = new BetManagementConstruct(this, 'BetManagement', {
      table: this.database.table,
      encryptionKey: this.database.encryptionKey,
    });

    // ==========================================================================
    // Alchemy (webhook for on-chain events)
    // ==========================================================================
    this.alchemy = new AlchemyConstruct(this, 'Alchemy', {
      table: this.database.table,
      api: this.api.api,
    });

    // ==========================================================================
    // Outputs
    // ==========================================================================
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.api.url,
      description: 'API Gateway Endpoint',
    });

    new cdk.CfnOutput(this, 'Environment', {
      value: environment,
      description: 'Deployment Environment',
    });
  }
}
