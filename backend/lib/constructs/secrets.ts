import { Construct } from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib/core';

export interface SecretsConstructProps {
  /**
   * Optional prefix for secret names
   * @default 'polyacca'
   */
  secretNamePrefix?: string;
}

/**
 * Platform-level secrets for PolyAcca
 *
 * Note: User-level Polymarket credentials are stored per-user in DynamoDB,
 * encrypted with KMS. This construct only handles platform secrets.
 */
export class SecretsConstruct extends Construct {
  /**
   * JWT signing secret for authentication tokens
   */
  public readonly jwtSecret: secretsmanager.Secret;

  /**
   * ARN of the JWT secret (for Lambda environment variables)
   */
  public readonly jwtSecretArn: string;

  constructor(scope: Construct, id: string, props?: SecretsConstructProps) {
    super(scope, id);

    const prefix = props?.secretNamePrefix ?? 'polyacca';

    // JWT Signing Secret - auto-generated secure random string
    this.jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      secretName: `${prefix}/jwt-secret`,
      description: 'JWT signing secret for PolyAcca authentication',
      generateSecretString: {
        excludePunctuation: false,
        passwordLength: 64,
      },
    });

    this.jwtSecretArn = this.jwtSecret.secretArn;

    // Output for reference
    new cdk.CfnOutput(this, 'JwtSecretArn', {
      value: this.jwtSecretArn,
      description: 'JWT Secret ARN',
    });
  }

  /**
   * Grant read access to the JWT secret
   */
  public grantJwtSecretRead(grantee: iam.IGrantable): void {
    this.jwtSecret.grantRead(grantee);
  }
}
