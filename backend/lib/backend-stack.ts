import * as cdk from 'aws-cdk-lib/core';
import { Aspects } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

// Constructs
import { SecretsConstruct } from './constructs/secrets';
import { DatabaseConstruct } from './constructs/database';
import { CredentialsTableConstruct } from './constructs/credentials-table';
import { AuthConstruct } from './constructs/auth';
import { ApiConstruct } from './constructs/api';
import { BetManagementConstruct } from './constructs/bet-management';
import { WebSocketConstruct } from './constructs/websocket';
import { AdminWebSocketConstruct } from './constructs/admin-websocket';
import { AlchemyConstruct } from './constructs/alchemy';
import { AlertsConstruct } from './constructs/alerts';

// Aspects
import { LambdaErrorAlertAspect } from './aspects/LambdaErrorAlertAspect';
import { SqsDlqAlertAspect } from './aspects/SqsDlqAlertAspect';
import { NodejsLambdaEnvValidationAspect } from './aspects/NodejsLambdaEnvValidationAspect';

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
  public readonly credentialsTable: CredentialsTableConstruct;
  public readonly auth: AuthConstruct;
  public readonly api: ApiConstruct;
  public readonly websocket: WebSocketConstruct;
  public readonly adminWebsocket: AdminWebSocketConstruct;
  public readonly betManagement: BetManagementConstruct;
  public readonly alchemy: AlchemyConstruct;
  public readonly alerts: AlertsConstruct;

  constructor(scope: Construct, id: string, props?: BackendStackProps) {
    super(scope, id, props);

    const environment = props?.environment ?? 'dev';
    const isProd = environment === 'prod';

    // ==========================================================================
    // Alerts (must be created first so aspects can reference the topic)
    // ==========================================================================
    this.alerts = new AlertsConstruct(this, 'Alerts', {
      environment,
    });

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
    // Credentials Table (isolated table for Polymarket API keys)
    // Only specific lambdas have access to this table
    // ==========================================================================
    this.credentialsTable = new CredentialsTableConstruct(this, 'CredentialsTable', {
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
      auth: this.auth,
      credentialsTable: this.credentialsTable,
    });

    // ==========================================================================
    // WebSocket (real-time bet notifications)
    // ==========================================================================
    this.websocket = new WebSocketConstruct(this, 'WebSocket', {
      table: this.database.table,
    });

    // ==========================================================================
    // Admin WebSocket (real-time dashboard updates)
    // ==========================================================================
    this.adminWebsocket = new AdminWebSocketConstruct(this, 'AdminWebSocket', {
      table: this.database.table,
      jwtSecretArn: this.secrets.jwtSecretArn,
    });

    // Grant JWT secret access to admin authorizer handler
    this.secrets.grantJwtSecretRead(this.adminWebsocket.authorizerHandler);

    // ==========================================================================
    // Bet Management (stream handlers and bet executor)
    // ==========================================================================
    this.betManagement = new BetManagementConstruct(this, 'BetManagement', {
      table: this.database.table,
      credentialsTable: this.credentialsTable,
      secrets: this.secrets,
      websocket: this.websocket,
      adminWebsocket: this.adminWebsocket,
    });

    // ==========================================================================
    // Alchemy (webhook for on-chain events)
    // ==========================================================================
    this.alchemy = new AlchemyConstruct(this, 'Alchemy', {
      table: this.database.table,
      api: this.api.api,
    });

    // ==========================================================================
    // Aspects (applied after all constructs are created)
    // ==========================================================================

    // Validate environment variables at synth time
    Aspects.of(this).add(
      new NodejsLambdaEnvValidationAspect({
        rootDir: path.join(__dirname, '../..'),
      })
    );

    // Add error monitoring to all Lambda functions
    Aspects.of(this).add(
      new LambdaErrorAlertAspect({
        alertsTopic: this.alerts.alertsTopic,
        alarmNamePrefix: `PolyAcca-${environment}`,
      })
    );

    // Add DLQ monitoring to all Dead Letter Queues
    Aspects.of(this).add(
      new SqsDlqAlertAspect({
        alertsTopic: this.alerts.alertsTopic,
        alarmNamePrefix: `PolyAcca-${environment}`,
      })
    );

    // ==========================================================================
    // Outputs
    // ==========================================================================
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.api.url,
      description: 'API Gateway Endpoint',
    });

    new cdk.CfnOutput(this, 'WebSocketEndpoint', {
      value: this.websocket.webSocketStage.url,
      description: 'WebSocket Endpoint',
    });

    new cdk.CfnOutput(this, 'AdminWebSocketEndpoint', {
      value: this.adminWebsocket.webSocketStage.url,
      description: 'Admin WebSocket Endpoint',
    });

    new cdk.CfnOutput(this, 'Environment', {
      value: environment,
      description: 'Deployment Environment',
    });
  }
}
