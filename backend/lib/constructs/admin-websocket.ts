import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib/core';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { WebSocketLambdaAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as path from 'path';

export interface AdminWebSocketConstructProps {
  /**
   * DynamoDB table for storing connections and reading data
   */
  table: dynamodb.ITable;
  /**
   * JWT secret ARN for token verification
   */
  jwtSecretArn: string;
}

/**
 * Admin WebSocket API for real-time dashboard updates
 *
 * Routes:
 * - $connect: Verify admin, store connection, send initial state
 * - $disconnect: Remove connection
 *
 * Broadcasts chain/bet status updates to admin connections
 */
export class AdminWebSocketConstruct extends Construct {
  public readonly webSocketApi: apigwv2.WebSocketApi;
  public readonly webSocketStage: apigwv2.WebSocketStage;
  public readonly authorizerHandler: nodejs.NodejsFunction;
  public readonly connectHandler: nodejs.NodejsFunction;
  public readonly disconnectHandler: nodejs.NodejsFunction;
  public readonly webSocketEndpoint: string;

  constructor(scope: Construct, id: string, props: AdminWebSocketConstructProps) {
    super(scope, id);

    const { table, jwtSecretArn } = props;

    // Shared Lambda config
    const lambdaConfig = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        MONOTABLE_NAME: table.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
      },
    };

    // Authorizer handler - validates JWT and checks admin wallet
    this.authorizerHandler = new nodejs.NodejsFunction(this, 'AdminAuthorizerHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/websocket/admin-authorizer/index.ts'),
      handler: 'handler',
      description: 'Admin WebSocket authorizer - validates JWT and admin status',
      environment: {
        ...lambdaConfig.environment,
        JWT_SECRET_ARN: jwtSecretArn,
      },
    });

    // $connect handler - stores connection and sends initial state
    this.connectHandler = new nodejs.NodejsFunction(this, 'AdminConnectHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/websocket/admin-connect/index.ts'),
      handler: 'handler',
      description: 'Admin WebSocket $connect - stores connection and sends initial state',
    });

    // $disconnect handler - removes connection
    this.disconnectHandler = new nodejs.NodejsFunction(this, 'AdminDisconnectHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/websocket/admin-disconnect/index.ts'),
      handler: 'handler',
      description: 'Admin WebSocket $disconnect - removes connection',
    });

    // Grant DynamoDB permissions
    table.grantReadWriteData(this.connectHandler);
    table.grantReadWriteData(this.disconnectHandler);

    // Create authorizer
    const authorizer = new WebSocketLambdaAuthorizer('AdminAuthorizer', this.authorizerHandler, {
      identitySource: ['route.request.querystring.token'],
    });

    // WebSocket API
    this.webSocketApi = new apigwv2.WebSocketApi(this, 'AdminDashboardApi', {
      apiName: 'PolyAcca Admin Dashboard',
      description: 'Real-time admin dashboard WebSocket API',
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('AdminConnectIntegration', this.connectHandler),
        authorizer,
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('AdminDisconnectIntegration', this.disconnectHandler),
      },
    });

    // WebSocket Stage
    this.webSocketStage = new apigwv2.WebSocketStage(this, 'AdminProdStage', {
      webSocketApi: this.webSocketApi,
      stageName: 'admin',
      autoDeploy: true,
    });

    // Build the WebSocket endpoint URL for API Gateway Management API
    this.webSocketEndpoint = `https://${this.webSocketApi.apiId}.execute-api.${cdk.Stack.of(this).region}.amazonaws.com/${this.webSocketStage.stageName}`;

    // Add WEBSOCKET_ENDPOINT to connect handler (needs to send initial state)
    this.connectHandler.addEnvironment('WEBSOCKET_ENDPOINT', this.webSocketEndpoint);

    // Grant connect handler permission to post back to connection (for initial state)
    this.grantManageConnections(this.connectHandler);

    // Outputs
    new cdk.CfnOutput(this, 'AdminWebSocketUrl', {
      value: this.webSocketStage.url,
      description: 'Admin WebSocket URL for dashboard',
    });

    new cdk.CfnOutput(this, 'AdminWebSocketEndpoint', {
      value: this.webSocketEndpoint,
      description: 'Endpoint for admin PostToConnection API calls',
    });
  }

  /**
   * Grant a Lambda function permission to send messages to WebSocket connections
   */
  public grantManageConnections(grantee: iam.IGrantable): void {
    grantee.grantPrincipal.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'],
        resources: [
          `arn:aws:execute-api:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:${this.webSocketApi.apiId}/${this.webSocketStage.stageName}/POST/@connections/*`,
        ],
      })
    );
  }
}
