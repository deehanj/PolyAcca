import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib/core';
import * as path from 'path';

export interface AuthConstructProps {
  /**
   * DynamoDB table for storing nonces
   */
  table: dynamodb.ITable;
  /**
   * ARN of the JWT signing secret
   */
  jwtSecretArn: string;
  /**
   * JWT token expiry in hours
   * @default 24
   */
  tokenExpiryHours?: number;
}

export class AuthConstruct extends Construct {
  public readonly nonceFunction: nodejs.NodejsFunction;
  public readonly verifyFunction: nodejs.NodejsFunction;
  public readonly authorizerFunction: nodejs.NodejsFunction;
  public readonly authorizer: apigateway.RequestAuthorizer;

  constructor(scope: Construct, id: string, props: AuthConstructProps) {
    super(scope, id);

    const { table, jwtSecretArn, tokenExpiryHours = 24 } = props;

    // Shared Lambda environment
    const commonEnv = {
      TABLE_NAME: table.tableName,
      JWT_SECRET_ARN: jwtSecretArn,
      TOKEN_EXPIRY_HOURS: tokenExpiryHours.toString(),
      NODE_OPTIONS: '--enable-source-maps',
    };

    // Nonce Lambda - generates nonce for wallet signing
    this.nonceFunction = new nodejs.NodejsFunction(this, 'NonceFunction', {
      entry: path.join(__dirname, '../../lambdas/auth/nonce/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: commonEnv,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    // Verify Lambda - verifies wallet signature, issues JWT
    this.verifyFunction = new nodejs.NodejsFunction(this, 'VerifyFunction', {
      entry: path.join(__dirname, '../../lambdas/auth/verify/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: commonEnv,
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    // Authorizer Lambda - validates JWT tokens
    this.authorizerFunction = new nodejs.NodejsFunction(this, 'AuthorizerFunction', {
      entry: path.join(__dirname, '../../lambdas/authorizer/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        JWT_SECRET_ARN: jwtSecretArn,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    });

    // Grant DynamoDB permissions (least privilege)
    // Nonce function: write nonces
    table.grant(this.nonceFunction, 'dynamodb:PutItem');

    // Verify function: read and delete nonces, create users
    table.grant(this.verifyFunction,
      'dynamodb:GetItem',
      'dynamodb:DeleteItem',
      'dynamodb:PutItem'
    );

    // Grant Secrets Manager read access for JWT secret
    const secretsPolicy = new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [jwtSecretArn],
    });
    this.nonceFunction.addToRolePolicy(secretsPolicy);
    this.verifyFunction.addToRolePolicy(secretsPolicy);
    this.authorizerFunction.addToRolePolicy(secretsPolicy);

    // API Gateway Lambda Authorizer (no caching - each request invokes authorizer)
    this.authorizer = new apigateway.RequestAuthorizer(this, 'WalletAuthorizer', {
      handler: this.authorizerFunction,
      identitySources: [apigateway.IdentitySource.header('Authorization')],
      resultsCacheTtl: cdk.Duration.seconds(0),
    });
  }
}
