import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib/core';
import * as path from 'path';
import { AuthConstruct } from './auth';

export interface ApiConstructProps {
  /**
   * DynamoDB table
   */
  table: dynamodb.ITable;
  /**
   * Auth construct with authorizer
   */
  auth: AuthConstruct;
  /**
   * Turnkey secret ARN (for wallet operations)
   */
  turnkeySecretArn: string;
  /**
   * Turnkey organization ID
   */
  turnkeyOrganizationId: string;
  /**
   * Platform wallet address for funding gas on withdrawals
   */
  platformWalletAddress: string;
}

export class ApiConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly usersFunction: nodejs.NodejsFunction;
  public readonly chainsFunction: nodejs.NodejsFunction;
  public readonly marketsFunction: nodejs.NodejsFunction;
  public readonly walletFunction: nodejs.NodejsFunction;
  public readonly chainImagesBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    const { table, auth, turnkeySecretArn, turnkeyOrganizationId, platformWalletAddress } = props;

    // Shared Lambda config
    const lambdaConfig = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      environment: {
        MONOTABLE_NAME: table.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    };

    // Users Lambda - profile management
    // Note: Credentials are now handled automatically via embedded wallets in bet-executor
    this.usersFunction = new nodejs.NodejsFunction(this, 'UsersFunction', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/api/users/index.ts'),
      handler: 'handler',
    });

    // S3 bucket for chain images (used by chains Lambda)
    this.chainImagesBucket = new s3.Bucket(this, 'ChainImagesBucket', {
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        ignorePublicAcls: false,
        blockPublicPolicy: false,
        restrictPublicBuckets: false,
      }),
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          maxAge: 3000,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Make bucket publicly readable for serving images
    this.chainImagesBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${this.chainImagesBucket.bucketArn}/*`],
      principals: [new iam.AnyPrincipal()],
    }));

    // Chains Lambda - chain management
    this.chainsFunction = new nodejs.NodejsFunction(this, 'ChainsFunction', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/api/chains/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30), // Allow time for Rekognition + S3 upload
      environment: {
        MONOTABLE_NAME: table.tableName,
        CHAIN_IMAGES_BUCKET: this.chainImagesBucket.bucketName,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    // Markets Lambda - public market listing (no auth required)
    this.marketsFunction = new nodejs.NodejsFunction(this, 'MarketsFunction', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/api/markets/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(15), // Shorter timeout for external API calls
    });

    // Wallet Lambda - embedded wallet operations (signature-based auth)
    this.walletFunction = new nodejs.NodejsFunction(this, 'WalletFunction', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/api/wallet/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60), // Longer timeout for blockchain transactions
      environment: {
        MONOTABLE_NAME: table.tableName,
        TURNKEY_SECRET_ARN: turnkeySecretArn,
        TURNKEY_ORGANIZATION_ID: turnkeyOrganizationId,
        PLATFORM_WALLET_ADDRESS: platformWalletAddress,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    // Grant DynamoDB permissions
    table.grantReadWriteData(this.usersFunction);
    table.grantReadWriteData(this.chainsFunction);
    table.grantReadWriteData(this.walletFunction);

    // Grant chains function S3 and Rekognition permissions (for image upload)
    this.chainImagesBucket.grantPut(this.chainsFunction);
    this.chainsFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['rekognition:DetectModerationLabels'],
      resources: ['*'],
    }));

    // Grant wallet function access to Turnkey secret
    this.walletFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [turnkeySecretArn],
    }));

    // REST API
    this.api = new apigateway.RestApi(this, 'PolyAccaApi', {
      restApiName: 'PolyAcca API',
      description: 'PolyAcca Chain Betting API',
      deployOptions: {
        stageName: 'v1',
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
        allowCredentials: false,
      },
    });

    // Add CORS headers to Gateway error responses (authorizer failures, etc.)
    const corsHeaders = {
      'Access-Control-Allow-Origin': "'*'",
      'Access-Control-Allow-Headers': "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
    };

    this.api.addGatewayResponse('UnauthorizedResponse', {
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: corsHeaders,
    });

    this.api.addGatewayResponse('AccessDeniedResponse', {
      type: apigateway.ResponseType.ACCESS_DENIED,
      responseHeaders: corsHeaders,
    });

    this.api.addGatewayResponse('Default4xxResponse', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: corsHeaders,
    });

    this.api.addGatewayResponse('Default5xxResponse', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: corsHeaders,
    });

    // Auth endpoints (public - no authorizer)
    const authResource = this.api.root.addResource('auth');
    const nonceResource = authResource.addResource('nonce');
    const verifyResource = authResource.addResource('verify');

    nonceResource.addMethod('POST', new apigateway.LambdaIntegration(auth.nonceFunction));
    verifyResource.addMethod('POST', new apigateway.LambdaIntegration(auth.verifyFunction));

    // Protected endpoints (require JWT)
    const protectedMethodOptions: apigateway.MethodOptions = {
      authorizer: auth.authorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    };

    // Users endpoints
    const usersResource = this.api.root.addResource('users');
    const meResource = usersResource.addResource('me');

    meResource.addMethod('GET', new apigateway.LambdaIntegration(this.usersFunction), protectedMethodOptions);
    meResource.addMethod('PUT', new apigateway.LambdaIntegration(this.usersFunction), protectedMethodOptions);

    // Chains endpoints
    const chainsResource = this.api.root.addResource('chains');
    const chainIdResource = chainsResource.addResource('{chainId}');
    const chainUsersResource = chainIdResource.addResource('users');

    chainsResource.addMethod('GET', new apigateway.LambdaIntegration(this.chainsFunction), protectedMethodOptions);
    chainsResource.addMethod('POST', new apigateway.LambdaIntegration(this.chainsFunction), protectedMethodOptions);
    chainIdResource.addMethod('GET', new apigateway.LambdaIntegration(this.chainsFunction), protectedMethodOptions);
    chainIdResource.addMethod('PUT', new apigateway.LambdaIntegration(this.chainsFunction), protectedMethodOptions);
    chainIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(this.chainsFunction), protectedMethodOptions);
    chainUsersResource.addMethod('GET', new apigateway.LambdaIntegration(this.chainsFunction), protectedMethodOptions);

    // Markets endpoints (public - no auth required)
    const marketsResource = this.api.root.addResource('markets');
    const marketIdResource = marketsResource.addResource('{marketId}');

    marketsResource.addMethod('GET', new apigateway.LambdaIntegration(this.marketsFunction));
    marketIdResource.addMethod('GET', new apigateway.LambdaIntegration(this.marketsFunction));

    // Wallet endpoints (signature-based auth - not JWT)
    // These endpoints verify a fresh wallet signature instead of JWT
    const walletResource = this.api.root.addResource('wallet');
    const withdrawResource = walletResource.addResource('withdraw');

    withdrawResource.addMethod('POST', new apigateway.LambdaIntegration(this.walletFunction));

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
    });
  }
}
