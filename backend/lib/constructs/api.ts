import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as cdk from 'aws-cdk-lib/core';
import * as path from 'path';
import { AuthConstruct } from './auth';
import type { CredentialsTableConstruct } from './credentials-table';

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
   * Credentials table construct (for user API key storage)
   */
  credentialsTable: CredentialsTableConstruct;
}

export class ApiConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly usersFunction: nodejs.NodejsFunction;
  public readonly chainsFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    const { table, auth, credentialsTable } = props;

    // Shared Lambda config
    const lambdaConfig = {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
        forceDockerBundling: false,
      },
    };

    // Users Lambda - profile and credentials management
    // Has access to both main table and credentials table
    this.usersFunction = new nodejs.NodejsFunction(this, 'UsersFunction', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/api/users/index.ts'),
      handler: 'handler',
      environment: {
        ...lambdaConfig.environment,
        CREDENTIALS_TABLE_NAME: credentialsTable.table.tableName,
        KMS_KEY_ARN: credentialsTable.encryptionKey.keyArn,
      },
    });

    // Chains Lambda - chain management
    this.chainsFunction = new nodejs.NodejsFunction(this, 'ChainsFunction', {
      ...lambdaConfig,
      entry: path.join(__dirname, '../../lambdas/api/chains/index.ts'),
      handler: 'handler',
    });

    // Grant DynamoDB permissions (scoped by Lambda function needs)
    table.grantReadWriteData(this.usersFunction);
    table.grantReadWriteData(this.chainsFunction);

    // Grant credentials table access to Users Lambda only
    credentialsTable.grantReadWrite(this.usersFunction);

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
        allowHeaders: ['Content-Type', 'Authorization'],
      },
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
    const credentialsResource = meResource.addResource('credentials');

    meResource.addMethod('GET', new apigateway.LambdaIntegration(this.usersFunction), protectedMethodOptions);
    meResource.addMethod('PUT', new apigateway.LambdaIntegration(this.usersFunction), protectedMethodOptions);
    credentialsResource.addMethod('PUT', new apigateway.LambdaIntegration(this.usersFunction), protectedMethodOptions);
    credentialsResource.addMethod('DELETE', new apigateway.LambdaIntegration(this.usersFunction), protectedMethodOptions);

    // Chains endpoints
    const chainsResource = this.api.root.addResource('chains');
    const chainIdResource = chainsResource.addResource('{chainId}');
    const chainUsersResource = chainIdResource.addResource('users');

    chainsResource.addMethod('GET', new apigateway.LambdaIntegration(this.chainsFunction), protectedMethodOptions);
    chainsResource.addMethod('POST', new apigateway.LambdaIntegration(this.chainsFunction), protectedMethodOptions);
    chainIdResource.addMethod('GET', new apigateway.LambdaIntegration(this.chainsFunction), protectedMethodOptions);
    chainIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(this.chainsFunction), protectedMethodOptions);
    chainUsersResource.addMethod('GET', new apigateway.LambdaIntegration(this.chainsFunction), protectedMethodOptions);

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway URL',
    });
  }
}
