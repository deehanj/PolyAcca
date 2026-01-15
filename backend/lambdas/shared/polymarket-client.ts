/**
 * Polymarket CLOB client wrapper
 *
 * Handles credential management and order execution
 */

import { ClobClient, Side, OrderType, type TickSize } from '@polymarket/clob-client';
import type { PolymarketCredentials, UserCredsEntity } from './types';
import { encryptValue, decryptValue } from './kms-client';
import { createLogger } from './logger';

const logger = createLogger('polymarket-client');

const POLYMARKET_HOST = 'https://clob.polymarket.com';
const POLYGON_CHAIN_ID = 137;

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
 * Create an authenticated ClobClient instance
 */
function createClient(credentials?: PolymarketCredentials): ClobClient {
  if (!credentials) {
    return new ClobClient(POLYMARKET_HOST, POLYGON_CHAIN_ID);
  }

  return new ClobClient(
    POLYMARKET_HOST,
    POLYGON_CHAIN_ID,
    undefined,
    { key: credentials.apiKey, secret: credentials.apiSecret, passphrase: credentials.passphrase }
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
    await client.getApiKeys();
    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (
      message.includes('401') ||
      message.includes('Unauthorized') ||
      message.includes('UNAUTHORIZED') ||
      message.includes('Invalid API key') ||
      message.includes('invalid signature')
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

export interface OrderResult {
  orderId: string;
  status: 'PLACED' | 'FILLED' | 'REJECTED';
  filledSize?: number;
  avgPrice?: number;
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
 * Get order status from Polymarket
 */
export async function getOrderStatus(
  credentials: PolymarketCredentials,
  orderId: string
): Promise<OrderResult> {
  const client = createClient(credentials);

  try {
    const order = await client.getOrder(orderId);
    return {
      orderId: order.id,
      status: order.status === 'MATCHED' ? 'FILLED' : 'PLACED',
      filledSize: parseFloat(order.size_matched ?? '0'),
      avgPrice: parseFloat(order.price ?? '0'),
    };
  } catch (error) {
    logger.errorWithStack('Failed to get order status', error, { orderId });
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

/**
 * Get market price for a token (no authentication required)
 */
export async function getMarketPrice(
  tokenId: string
): Promise<{ bid: number; ask: number; mid: number }> {
  const client = createClient();

  try {
    const book = await client.getOrderBook(tokenId);
    const bestBid = book.bids?.[0]?.price ? parseFloat(book.bids[0].price) : 0;
    const bestAsk = book.asks?.[0]?.price ? parseFloat(book.asks[0].price) : 1;
    return { bid: bestBid, ask: bestAsk, mid: (bestBid + bestAsk) / 2 };
  } catch (error) {
    logger.errorWithStack('Failed to get market price', error, { tokenId });
    throw error;
  }
}
