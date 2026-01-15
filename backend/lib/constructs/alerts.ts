import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as cdk from 'aws-cdk-lib/core';
import * as path from 'path';

export interface AlertsConstructProps {
  /**
   * Environment name for naming resources
   */
  environment: string;
}

/**
 * Alerts Construct
 *
 * Sets up the alerting infrastructure:
 * - SNS topic for CloudWatch alarms
 * - Lambda function to forward alerts to Telegram
 * - Secrets Manager secret for Telegram credentials
 *
 * The aspects (LambdaErrorAlertAspect, SqsDlqAlertAspect) send alerts
 * to the SNS topic, which triggers the Lambda to send to Telegram.
 */
export class AlertsConstruct extends Construct {
  public readonly alertsTopic: sns.Topic;
  public readonly telegramSecret: secretsmanager.Secret;
  public readonly notificationFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: AlertsConstructProps) {
    super(scope, id);

    const { environment } = props;

    // SNS Topic for all alerts
    this.alertsTopic = new sns.Topic(this, 'AlertsTopic', {
      topicName: `polyacca-${environment}-alerts`,
      displayName: `PolyAcca ${environment} Alerts`,
    });

    // Secret for Telegram credentials
    // Users must manually set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in this secret
    this.telegramSecret = new secretsmanager.Secret(this, 'TelegramSecret', {
      secretName: `polyacca/${environment}/telegram`,
      description: 'Telegram bot credentials for PolyAcca alerts. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          TELEGRAM_BOT_TOKEN: 'YOUR_BOT_TOKEN_HERE',
          TELEGRAM_CHAT_ID: 'YOUR_CHAT_ID_HERE',
        }),
        generateStringKey: 'placeholder',
      },
    });

    // Lambda function to send notifications to Telegram
    this.notificationFunction = new nodejs.NodejsFunction(this, 'TelegramNotification', {
      entry: path.join(__dirname, '../../lambdas/notifications/telegram/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TELEGRAM_BOT_TOKEN: `{{resolve:secretsmanager:${this.telegramSecret.secretName}:SecretString:TELEGRAM_BOT_TOKEN}}`,
        TELEGRAM_CHAT_ID: `{{resolve:secretsmanager:${this.telegramSecret.secretName}:SecretString:TELEGRAM_CHAT_ID}}`,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
      description: 'Sends alert notifications to Telegram',
    });

    // Grant the Lambda permission to read the secret
    this.telegramSecret.grantRead(this.notificationFunction);

    // Subscribe the Lambda to the SNS topic
    this.alertsTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(this.notificationFunction)
    );

    // Outputs
    new cdk.CfnOutput(this, 'AlertsTopicArn', {
      value: this.alertsTopic.topicArn,
      description: 'SNS Topic ARN for alerts',
    });

    new cdk.CfnOutput(this, 'TelegramSecretArn', {
      value: this.telegramSecret.secretArn,
      description: 'Secret ARN for Telegram credentials (update with your bot token and chat ID)',
    });
  }
}
