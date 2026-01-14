import { Construct } from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface PolymarketSecretsProps {
  /**
   * Optional prefix for the secret name
   */
  secretNamePrefix?: string;
}

export class PolymarketSecrets extends Construct {
  public readonly builderSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: PolymarketSecretsProps) {
    super(scope, id);

    const prefix = props?.secretNamePrefix ?? 'polyacca';

    // Polymarket Builder Secrets
    this.builderSecret = new secretsmanager.Secret(this, 'PolymarketBuilderSecret', {
      secretName: `${prefix}/polymarket/builder`,
      description: 'Polymarket builder API credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          apiKey: 'PLACEHOLDER_API_KEY',
          apiSecret: 'PLACEHOLDER_API_SECRET',
          passphrase: 'PLACEHOLDER_PASSPHRASE',
        }),
        generateStringKey: 'generatedField',
      },
    });
  }
}
