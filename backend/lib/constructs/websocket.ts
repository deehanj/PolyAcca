import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib/core';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as path from 'path';

export interface WebSocketConstructProps {
  /**
   * DynamoDB table for storing connections
   */
  table: dynamodb.ITable;
}

/**
 * WebSocket API for real-time bet notifications
 *
 * Routes:
 * - $connect: Store connection ID in DynamoDB
 * - $disconnect: Remove connection ID from DynamoDB
 *
 * Broadcasts are sent from the BetNotificationHandler Lambda
 */
export class WebSocketConstruct extends Construct {
  public readonly webSocketApi: apigwv2.WebSocketApi;
  public readonly webSocketStage: apigwv2.WebSocketStage;
  public readonly connectHandler: nodejs.NodejsFunction;
  public readonly disconnectHandler: nodejs.NodejsFunction;
  public readonly defaultHandler: nodejs.NodejsFunction;
  public readonly webSocketEndpoint: string;

  constructor(scope: Construct, id: string, props: WebSocketConstructProps) {
    super(scope, id);

    const { table } = props;

    // Shared Lambda config
    const lambdaConfig = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
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

    // $connect handler - stores connection in DynamoDB
    this.connectHandler = new nodejs.NodejsFunction(this, 'ConnectHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/websocket/connect/index.ts'),
      handler: 'handler',
      description: 'WebSocket $connect handler - stores connection ID',
    });

    // $disconnect handler - removes connection from DynamoDB
    this.disconnectHandler = new nodejs.NodejsFunction(this, 'DisconnectHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/websocket/disconnect/index.ts'),
      handler: 'handler',
      description: 'WebSocket $disconnect handler - removes connection ID',
    });

    // $default handler - handles ping/pong and other messages
    this.defaultHandler = new nodejs.NodejsFunction(this, 'DefaultHandler', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/websocket/default/index.ts'),
      handler: 'handler',
      description: 'WebSocket $default handler - handles ping/pong',
    });

    // Grant DynamoDB permissions
    table.grantReadWriteData(this.connectHandler);
    table.grantReadWriteData(this.disconnectHandler);

    // WebSocket API
    this.webSocketApi = new apigwv2.WebSocketApi(this, 'BetNotificationsApi', {
      apiName: 'PolyAcca Bet Notifications',
      description: 'Real-time bet notification WebSocket API',
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration('ConnectIntegration', this.connectHandler),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('DisconnectIntegration', this.disconnectHandler),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration('DefaultIntegration', this.defaultHandler),
      },
    });

    // WebSocket Stage
    this.webSocketStage = new apigwv2.WebSocketStage(this, 'ProdStage', {
      webSocketApi: this.webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Build the WebSocket endpoint URL for API Gateway Management API
    // Format: https://{api-id}.execute-api.{region}.amazonaws.com/{stage}
    this.webSocketEndpoint = `https://${this.webSocketApi.apiId}.execute-api.${cdk.Stack.of(this).region}.amazonaws.com/${this.webSocketStage.stageName}`;

    // Grant default handler permission to send pong responses
    this.grantManageConnections(this.defaultHandler);

    // Outputs
    new cdk.CfnOutput(this, 'WebSocketUrl', {
      value: this.webSocketStage.url,
      description: 'WebSocket URL for clients to connect',
    });

    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.apiId,
      description: 'WebSocket API ID',
    });

    new cdk.CfnOutput(this, 'WebSocketManagementEndpoint', {
      value: this.webSocketEndpoint,
      description: 'Endpoint for PostToConnection API calls',
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
