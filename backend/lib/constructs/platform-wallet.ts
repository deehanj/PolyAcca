/**
 * Platform Wallet Construct
 *
 * Creates a platform wallet via Turnkey using a CloudFormation custom resource.
 * This wallet is used to fund new user embedded wallets with POL for gas.
 *
 * The wallet is created on first deployment and persists across updates/deletes.
 */

import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as cdk from 'aws-cdk-lib/core';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'path';
import { SecretsConstruct } from './secrets';

export interface PlatformWalletConstructProps {
  /**
   * Secrets construct for Turnkey credentials
   */
  secrets: SecretsConstruct;

  /**
   * Turnkey organization ID
   */
  turnkeyOrganizationId: string;
}

export class PlatformWalletConstruct extends Construct {
  /**
   * The platform wallet address (funded with POL for gas)
   */
  public readonly walletAddress: string;

  constructor(scope: Construct, id: string, props: PlatformWalletConstructProps) {
    super(scope, id);

    const { secrets, turnkeyOrganizationId } = props;

    // Lambda for the custom resource
    const providerFunction = new nodejs.NodejsFunction(this, 'ProviderFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.minutes(5), // Wallet creation can take time
      entry: path.join(__dirname, '../../lambdas/custom-resources/platform-wallet/index.ts'),
      handler: 'handler',
      environment: {
        TURNKEY_SECRET_ARN: secrets.turnkeySecretArn,
        TURNKEY_ORGANIZATION_ID: turnkeyOrganizationId,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    // Grant access to Turnkey secret
    secrets.grantTurnkeySecretRead(providerFunction);

    // Custom resource provider
    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler: providerFunction,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Custom resource
    const resource = new cdk.CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      // Add a property that changes if we need to force recreation
      properties: {
        Version: '1', // Increment to force update
      },
    });

    // Extract wallet address from custom resource output
    this.walletAddress = resource.getAttString('WalletAddress');

    // Output the wallet address
    new cdk.CfnOutput(this, 'PlatformWalletAddress', {
      value: this.walletAddress,
      description: 'Platform wallet address - fund this with POL on Polygon for gas funding',
    });
  }
}
