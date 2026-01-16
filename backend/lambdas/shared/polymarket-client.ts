/**
 * Polymarket CLOB client wrapper
 *
 * Handles credential management and order execution.
 * Supports builder attribution for RevShare (when verified).
 */

import { ClobClient, Side, OrderType, type TickSize } from '@polymarket/clob-client';
import { BuilderConfig } from '@polymarket/builder-signing-sdk';
import type { PolymarketCredentials, UserCredsEntity, BuilderCredentials } from './types';
import { encryptValue, decryptValue } from './kms-client';
import { createLogger } from './logger';

const logger = createLogger('polymarket-client');

const POLYMARKET_HOST = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;

// Builder credentials - loaded from environment/Secrets Manager
let cachedBuilderConfig: BuilderConfig | undefined;

// =============================================================================
// Builder Attribution
// =============================================================================

/**
 * Set builder credentials for order attribution
 */
export function setBuilderCredentials(creds: BuilderCredentials): void {
  cachedBuilderConfig = new BuilderConfig({
    localBuilderCreds: {
      key: creds.apiKey,
      secret: creds.apiSecret,
      passphrase: creds.passphrase,
    },
  });
}

/**
 * Check if builder credentials are configured
 */
export function hasBuilderCredentials(): boolean {
  return cachedBuilderConfig !== undefined;
}

// =============================================================================
// Credential Encryption/Decryption
// =============================================================================

/**
 * Encrypt Polymarket credentials for storage
 */
export async function encryptCredentials(
  creds: PolymarketCredentials
): Promise<Pick<UserCredsEntity, 'encryptedApiKey' | 'encryptedApiSecret' | 'encryptedPassphrase'>> {
  const [encryptedApiKey, encryptedApiSecret, encryptedPassphrase] = await Promise.all([
    encryptValue(creds.apiKey),
    encryptValue(creds.apiSecret),
    encryptValue(creds.passphrase),
  ]);

  return { encryptedApiKey, encryptedApiSecret, encryptedPassphrase };
}

/**
 * Decrypt Polymarket credentials from storage
 */
export async function decryptCredentials(
  encrypted: Pick<UserCredsEntity, 'encryptedApiKey' | 'encryptedApiSecret' | 'encryptedPassphrase' | 'signatureType'>
): Promise<PolymarketCredentials> {
  const [apiKey, apiSecret, passphrase] = await Promise.all([
    decryptValue(encrypted.encryptedApiKey),
    decryptValue(encrypted.encryptedApiSecret),
    decryptValue(encrypted.encryptedPassphrase),
  ]);

  return { apiKey, apiSecret, passphrase, signatureType: encrypted.signatureType };
}

// =============================================================================
// Client Factory
// =============================================================================

/**
 * Create an authenticated ClobClient instance with optional builder attribution
 */
function createClient(credentials?: PolymarketCredentials): ClobClient {
  if (!credentials) {
    return new ClobClient(POLYMARKET_HOST, POLYGON_CHAIN_ID);
  }

  // ClobClient constructor: host, chainId, signer, creds, signatureType, funderAddress, geoBlockToken, useServerTime, builderConfig
  return new ClobClient(
    POLYMARKET_HOST,
    POLYGON_CHAIN_ID,
    undefined, // signer
    { key: credentials.apiKey, secret: credentials.apiSecret, passphrase: credentials.passphrase },
    undefined, // signatureType
    undefined, // funderAddress
    undefined, // geoBlockToken
    undefined, // useServerTime
    cachedBuilderConfig // builderConfig - for order attribution
  );
}

// =============================================================================
// Credential Validation
// =============================================================================

/**
 * Validate Polymarket credentials by calling an authenticated endpoint
 */
export async function validateCredentials(
  creds: Pick<PolymarketCredentials, 'apiKey' | 'apiSecret' | 'passphrase'>
): Promise<{ valid: boolean; error?: string }> {
  try {
    const client = createClient(creds as PolymarketCredentials);
    // Use getOpenOrders - it's authenticated with API creds and doesn't require a signer
    await client.getOpenOrders();
    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const fullError = JSON.stringify(error);

    if (
      message.includes('401') ||
      message.includes('Unauthorized') ||
      message.includes('UNAUTHORIZED') ||
      message.includes('Invalid API key') ||
      message.includes('invalid signature') ||
      fullError.includes('401') ||
      fullError.includes('Unauthorized')
    ) {
      return { valid: false, error: 'Invalid Polymarket credentials' };
    }

    logger.errorWithStack('Unexpected error validating credentials', error);
    return { valid: false, error: `Validation failed: ${message}` };
  }
}

// =============================================================================
// Order Execution
// =============================================================================

export interface OrderParams {
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  tickSize?: TickSize;
}

/**
 * Place an order on Polymarket CLOB
 */
export async function placeOrder(
  credentials: PolymarketCredentials,
  params: OrderParams
): Promise<string> {
  const client = createClient(credentials);

  logger.info('Placing order', {
    tokenId: params.tokenId,
    side: params.side,
    price: params.price,
    size: params.size,
  });

  try {
    const order = await client.createAndPostOrder(
      {
        tokenID: params.tokenId,
        price: params.price,
        side: params.side === 'BUY' ? Side.BUY : Side.SELL,
        size: params.size,
      },
      { tickSize: params.tickSize ?? '0.01' },
      OrderType.GTC
    );

    const orderId = order.id ?? order.orderID ?? order.order_id;
    logger.info('Order placed', { orderId, tokenId: params.tokenId });
    return orderId;
  } catch (error) {
    logger.errorWithStack('Failed to place order', error, { tokenId: params.tokenId, side: params.side });
    throw error;
  }
}

/**
 * Cancel an order on Polymarket
 */
export async function cancelOrder(
  credentials: PolymarketCredentials,
  orderId: string
): Promise<boolean> {
  const client = createClient(credentials);

  logger.info('Cancelling order', { orderId });

  try {
    await client.cancelOrder({ orderID: orderId });
    logger.info('Order cancelled', { orderId });
    return true;
  } catch (error) {
    logger.errorWithStack('Failed to cancel order', error, { orderId });
    throw error;
  }
}
