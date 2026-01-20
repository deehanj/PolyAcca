#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { BackendStack } from '../lib/backend-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { AustraliaProxyStack } from '../lib/australia-proxy-stack';

// =============================================================================
// Required Environment Variables
// Set these before deploying, or hard-code values here for local development
// =============================================================================
process.env.TURNKEY_ORGANIZATION_ID ??= 'af05ad7f-6d97-4bd6-9161-2cca55e2cb45';

process.env.COMMISSION_WALLET_ADDRESS = "0x338ea503bEfFC48aE4418851145836Bc780102b8"

const app = new cdk.App();

// Determine environment (default to 'dev')
const environment = process.env.ENVIRONMENT ?? 'dev';
const account = process.env.CDK_DEFAULT_ACCOUNT;

// Backend stack (API, Database, Auth, Processing) - us-east-1
const backend = new BackendStack(app, 'BackendStack', {
  environment,
  env: { account, region: 'us-east-1' },
});

// Frontend stack (S3 + CloudFront) - us-east-1
new FrontendStack(app, 'FrontendStack', {
  env: { account, region: 'us-east-1' },
});

// Australia Proxy stack (HTTP proxy for Polymarket geo-blocking bypass) - eu-north-1 (Stockholm, Sweden)
new AustraliaProxyStack(app, 'AustraliaProxyStack', {
  environment,
  env: { account, region: 'eu-north-1' },
});
