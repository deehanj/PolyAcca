/**
 * Polymarket CLOB client wrapper
 *
 * Handles credential management and order execution.
 * Supports builder attribution for RevShare (when verified).
 *
 * Uses embedded wallets (Turnkey) for signing. Credentials are derived
 * from Polymarket on first use and cached in the credentials table.
 */

import { ClobClient, Side, OrderType, type TickSize } from '@polymarket/clob-client';
import { SignatureType as PolymarketSignatureType } from '@polymarket/order-utils';
import { BuilderConfig } from '@polymarket/builder-signing-sdk';
import type { Signer } from 'ethers';
import type { PolymarketCredentials, EmbeddedWalletCredentialsEntity, BuilderCredentials } from './types';
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
// Embedded Wallet Credential Encryption/Decryption
// =============================================================================

/**
 * Encrypt embedded wallet credentials for storage
 */
export async function encryptEmbeddedWalletCredentials(
  creds: PolymarketCredentials
): Promise<Pick<EmbeddedWalletCredentialsEntity, 'encryptedApiKey' | 'encryptedApiSecret' | 'encryptedPassphrase'>> {
  const [encryptedApiKey, encryptedApiSecret, encryptedPassphrase] = await Promise.all([
    encryptValue(creds.apiKey),
    encryptValue(creds.apiSecret),
    encryptValue(creds.passphrase),
  ]);

  return { encryptedApiKey, encryptedApiSecret, encryptedPassphrase };
}

/**
 * Decrypt embedded wallet credentials from storage
 */
export async function decryptEmbeddedWalletCredentials(
  encrypted: Pick<EmbeddedWalletCredentialsEntity, 'encryptedApiKey' | 'encryptedApiSecret' | 'encryptedPassphrase' | 'signatureType'>
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
// Order Execution
// =============================================================================

export interface OrderParams {
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  tickSize?: TickSize;
}

export interface OrderStatusResult {
  status?: string;
  filled: boolean;
}

function parseOrderStatus(order: any): OrderStatusResult {
  const rawStatus = order?.status ?? order?.state ?? order?.orderStatus ?? order?.order_state;
  const normalized = typeof rawStatus === 'string' ? rawStatus.toUpperCase() : undefined;
  const filledStatuses = new Set(['FILLED', 'EXECUTED', 'MATCHED']);

  const filledSize = Number(order?.filledSize ?? order?.filled_size ?? order?.sizeFilled ?? order?.filled);
  const totalSize = Number(order?.size ?? order?.totalSize ?? order?.orderSize ?? order?.quantity);
  const sizeMatches = Number.isFinite(filledSize) && Number.isFinite(totalSize) && totalSize > 0
    ? filledSize >= totalSize
    : false;

  return {
    status: normalized,
    filled: (normalized ? filledStatuses.has(normalized) : false) || sizeMatches,
  };
}

async function callOrderStatusGetter(client: ClobClient, orderId: string): Promise<any> {
  const getter =
    (client as any).getOrder ||
    (client as any).getOrderById ||
    (client as any).getOrderStatus;

  if (!getter) {
    logger.warn('Order status lookup not supported by client');
    return null;
  }

  try {
    return await getter.call(client, { orderID: orderId });
  } catch (error) {
    try {
      return await getter.call(client, { orderId });
    } catch {
      return await getter.call(client, orderId);
    }
  }
}

/**
 * Fetch order status from Polymarket CLOB.
 */
export async function fetchOrderStatus(
  credentials: Pick<PolymarketCredentials, 'apiKey' | 'apiSecret' | 'passphrase'>,
  orderId: string
): Promise<OrderStatusResult> {
  const client = createClient(credentials);

  try {
    const order = await callOrderStatusGetter(client, orderId);
    if (!order) {
      return { filled: false };
    }
    return parseOrderStatus(order);
  } catch (error) {
    logger.errorWithStack('Failed to fetch order status', error, { orderId });
    throw error;
  }
}

/**
 * Cancel an order on Polymarket (uses API credentials only, no signer needed)
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

// =============================================================================
// Embedded Wallet Support (Turnkey)
// =============================================================================

/**
 * Create a ClobClient with an ethers Signer for embedded wallet operations
 *
 * @param signer - ethers Signer from Turnkey
 * @param credentials - Optional pre-derived API credentials
 * @param signatureType - Signature type (default: EOA)
 */
function createClientWithSigner(
  signer: Signer,
  credentials?: Pick<PolymarketCredentials, 'apiKey' | 'apiSecret' | 'passphrase'>,
  signatureType: PolymarketSignatureType = PolymarketSignatureType.EOA
): ClobClient {
  return new ClobClient(
    POLYMARKET_HOST,
    POLYGON_CHAIN_ID,
    signer as any, // ClobClient expects Wallet | JsonRpcSigner but Signer is compatible
    credentials ? { key: credentials.apiKey, secret: credentials.apiSecret, passphrase: credentials.passphrase } : undefined,
    signatureType,
    undefined, // funderAddress
    undefined, // geoBlockToken
    undefined, // useServerTime
    cachedBuilderConfig // builderConfig - for order attribution
  );
}

/**
 * Derive API credentials for an embedded wallet
 *
 * This creates or retrieves API credentials from Polymarket for the given signer.
 * The credentials are used for authenticated API calls.
 *
 * @param signer - ethers Signer from Turnkey
 * @returns API credentials for the wallet
 */
export async function deriveApiCredentials(
  signer: Signer
): Promise<Pick<PolymarketCredentials, 'apiKey' | 'apiSecret' | 'passphrase'>> {
  const walletAddress = await signer.getAddress();
  logger.info('Deriving API credentials for embedded wallet', { walletAddress });

  try {
    // Create client with signer only (no credentials yet)
    const client = createClientWithSigner(signer);

    // Derive or create API credentials
    const creds = await client.createOrDeriveApiKey();

    logger.info('API credentials derived for embedded wallet', { walletAddress });

    return {
      apiKey: creds.key,
      apiSecret: creds.secret,
      passphrase: creds.passphrase,
    };
  } catch (error) {
    logger.errorWithStack('Failed to derive API credentials', error, { walletAddress });
    throw error;
  }
}

/**
 * Place an order on Polymarket CLOB using embedded wallet
 *
 * @param signer - ethers Signer from Turnkey
 * @param credentials - Pre-derived API credentials
 * @param params - Order parameters
 * @returns Order ID
 */
export async function placeOrder(
  signer: Signer,
  credentials: Pick<PolymarketCredentials, 'apiKey' | 'apiSecret' | 'passphrase'>,
  params: OrderParams
): Promise<string> {
  const client = createClientWithSigner(signer, credentials, PolymarketSignatureType.EOA);

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
    logger.errorWithStack('Failed to place order', error, {
      tokenId: params.tokenId,
      side: params.side,
    });
    throw error;
  }
}
