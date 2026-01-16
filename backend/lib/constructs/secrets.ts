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
 * Non-custodial model: Users link their own Polymarket accounts.
 * Builder credentials are used for order attribution (RevShare when verified).
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

  /**
   * Polymarket Builder API credentials for order attribution
   * Structure: { apiKey, apiSecret, passphrase }
   * Used to attribute orders to PolyAcca for RevShare (when verified)
   */
  public readonly builderSecret: secretsmanager.Secret;

  /**
   * ARN of the Builder secret
   */
  public readonly builderSecretArn: string;

  /**
   * Turnkey API credentials for embedded wallet management
   * Structure: { apiPublicKey, apiPrivateKey }
   */
  public readonly turnkeySecret: secretsmanager.Secret;

  /**
   * ARN of the Turnkey secret
   */
  public readonly turnkeySecretArn: string;

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

    // Polymarket Builder API credentials for order attribution
    // Seeded with placeholder structure - replace values after deployment
    this.builderSecret = new secretsmanager.Secret(this, 'BuilderSecret', {
      secretName: `${prefix}/builder`,
      description: 'Polymarket Builder API credentials for order attribution',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          apiKey: 'REPLACE_ME',
          apiSecret: 'REPLACE_ME',
        }),
        generateStringKey: 'passphrase',
        excludePunctuation: true,
      },
    });

    this.builderSecretArn = this.builderSecret.secretArn;

    // Turnkey API credentials for embedded wallet management
    // Seeded with placeholder structure - replace values after deployment
    this.turnkeySecret = new secretsmanager.Secret(this, 'TurnkeySecret', {
      secretName: `${prefix}/turnkey`,
      description: 'Turnkey API credentials for embedded wallet management',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          apiPublicKey: 'REPLACE_ME',
          apiPrivateKey: 'REPLACE_ME',
        }),
        generateStringKey: '_placeholder', // Required but unused
        excludePunctuation: true,
      },
    });

    this.turnkeySecretArn = this.turnkeySecret.secretArn;

    // Outputs for reference
    new cdk.CfnOutput(this, 'JwtSecretArn', {
      value: this.jwtSecretArn,
      description: 'JWT Secret ARN',
    });

    new cdk.CfnOutput(this, 'BuilderSecretArn', {
      value: this.builderSecretArn,
      description: 'Builder Secret ARN (replace REPLACE_ME values with actual credentials)',
    });

    new cdk.CfnOutput(this, 'TurnkeySecretArn', {
      value: this.turnkeySecretArn,
      description: 'Turnkey Secret ARN (replace REPLACE_ME values with actual credentials)',
    });
  }

  /**
   * Grant read access to the JWT secret
   */
  public grantJwtSecretRead(grantee: iam.IGrantable): void {
    this.jwtSecret.grantRead(grantee);
  }

  /**
   * Grant read access to Builder credentials (for order attribution)
   */
  public grantBuilderSecretRead(grantee: iam.IGrantable): void {
    this.builderSecret.grantRead(grantee);
  }

  /**
   * Grant read access to Turnkey credentials (for embedded wallet management)
   */
  public grantTurnkeySecretRead(grantee: iam.IGrantable): void {
    this.turnkeySecret.grantRead(grantee);
  }
}
