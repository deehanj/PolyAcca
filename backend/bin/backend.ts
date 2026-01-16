#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { BackendStack } from '../lib/backend-stack';
import { FrontendStack } from '../lib/frontend-stack';

// =============================================================================
// Required Environment Variables
// Set these before deploying, or hard-code values here for local development
// =============================================================================
process.env.TURNKEY_ORGANIZATION_ID ??= 'af05ad7f-6d97-4bd6-9161-2cca55e2cb45';

const app = new cdk.App();

// Backend stack (API, Database, Auth, Processing)
const backend = new BackendStack(app, 'BackendStack', {
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});

// Frontend stack (S3 + CloudFront)
new FrontendStack(app, 'FrontendStack', {
  // env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
});
