// Jest setup file
// Set default environment variables for testing
process.env.MONOTABLE_NAME = 'test-table';
process.env.CREDENTIALS_TABLE_NAME = 'test-credentials-table';
process.env.KMS_KEY_ARN = 'arn:aws:kms:us-east-1:123456789:key/test-key';
process.env.BUILDER_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123456789:secret:test-secret';
process.env.WEBHOOK_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123456789:secret:test-webhook';

// Increase timeout for async tests
jest.setTimeout(10000);
