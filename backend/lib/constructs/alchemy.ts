import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib/core';
import * as path from 'path';

export interface AlchemyConstructProps {
  /**
   * DynamoDB table for storing/querying bet data
   */
  table: dynamodb.ITable;
  /**
   * Existing API Gateway to add webhook endpoint to (optional)
   * If not provided, creates a standalone webhook API
   */
  api?: apigateway.RestApi;
}

/**
 * Alchemy Webhook Construct
 *
 * Receives webhook notifications from Alchemy for on-chain events.
 * Used to detect market resolutions and settlement events on Polymarket.
 */
export class AlchemyConstruct extends Construct {
  public readonly webhookFunction: nodejs.NodejsFunction;
  public readonly webhookSigningSecret: secretsmanager.Secret;
  public readonly webhookEndpoint: string;

  constructor(scope: Construct, id: string, props: AlchemyConstructProps) {
    super(scope, id);

    const { table, api } = props;

    // Secret for Alchemy webhook signing key (to verify webhook authenticity)
    this.webhookSigningSecret = new secretsmanager.Secret(this, 'WebhookSigningSecret', {
      secretName: 'polyacca/alchemy/webhook-signing-key',
      description: 'Alchemy webhook signing key for verifying webhook requests',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ signingKey: '' }),
        generateStringKey: 'placeholder',
      },
    });

    // Webhook handler Lambda
    this.webhookFunction = new nodejs.NodejsFunction(this, 'WebhookFunction', {
      entry: path.join(__dirname, '../../lambdas/webhooks/alchemy/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        WEBHOOK_SECRET_ARN: this.webhookSigningSecret.secretArn,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
      },
      description: 'Processes Alchemy webhook notifications for on-chain events',
    });

    // Grant permissions
    table.grantReadWriteData(this.webhookFunction);
    this.webhookSigningSecret.grantRead(this.webhookFunction);

    // Add webhook endpoint to existing API or create standalone
    if (api) {
      const webhooksResource = api.root.addResource('webhooks');
      const alchemyResource = webhooksResource.addResource('alchemy');

      alchemyResource.addMethod('POST', new apigateway.LambdaIntegration(this.webhookFunction));

      this.webhookEndpoint = `${api.url}webhooks/alchemy`;
    } else {
      // Create standalone webhook API
      const webhookApi = new apigateway.RestApi(this, 'AlchemyWebhookApi', {
        restApiName: 'PolyAcca Alchemy Webhooks',
        description: 'Webhook endpoint for Alchemy notifications',
        deployOptions: {
          stageName: 'v1',
        },
      });

      webhookApi.root.addMethod('POST', new apigateway.LambdaIntegration(this.webhookFunction));

      this.webhookEndpoint = webhookApi.url;
    }

    // Outputs
    new cdk.CfnOutput(this, 'WebhookEndpoint', {
      value: this.webhookEndpoint,
      description: 'Alchemy Webhook Endpoint URL',
    });

    new cdk.CfnOutput(this, 'WebhookSecretArn', {
      value: this.webhookSigningSecret.secretArn,
      description: 'ARN of the webhook signing secret (update with Alchemy signing key)',
    });
  }
}
