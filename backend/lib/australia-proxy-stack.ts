import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';

export interface AustraliaProxyStackProps extends cdk.StackProps {
  /**
   * Environment name (e.g., 'dev', 'prod')
   */
  environment: string;
}

/**
 * Australia Proxy Stack
 *
 * Deploys a lightweight HTTP proxy Lambda to ap-southeast-2 (Sydney)
 * to bypass Cloudflare's blocking of US datacenter IPs.
 *
 * This Lambda is invoked cross-region by the bet-executor in us-east-1.
 * It simply forwards HTTP requests and returns responses - no business logic.
 */
export class AustraliaProxyStack extends cdk.Stack {
  public readonly httpProxyFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: AustraliaProxyStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // =========================================================================
    // HTTP Proxy Lambda - Forwards requests from Sydney IP
    // =========================================================================
    this.httpProxyFunction = new nodejs.NodejsFunction(this, 'HttpProxy', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      functionName: `polyacca-${environment}-http-proxy`,
      description: 'HTTP proxy in Sydney for bypassing Cloudflare geo-blocking',
      entry: path.join(__dirname, '../lambdas/cross-region/http-proxy/index.ts'),
      handler: 'handler',
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        // No external modules - keep it lightweight
        externalModules: [],
        forceDockerBundling: false,
      },
    });

    // =========================================================================
    // Outputs
    // =========================================================================
    new cdk.CfnOutput(this, 'HttpProxyFunctionArn', {
      value: this.httpProxyFunction.functionArn,
      description: 'ARN of the HTTP Proxy Lambda in Sydney',
    });

    new cdk.CfnOutput(this, 'HttpProxyFunctionName', {
      value: this.httpProxyFunction.functionName,
      description: 'Name of the HTTP Proxy Lambda in Sydney',
    });
  }
}
