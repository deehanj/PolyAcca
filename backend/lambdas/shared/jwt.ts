/**
 * JWT utilities for PolyAcca authentication
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { createHmac } from 'crypto';
import type { JwtPayload } from './types';

const secretsClient = new SecretsManagerClient({});

let cachedSecret: string | null = null;

/**
 * Get JWT secret from Secrets Manager (cached)
 */
async function getJwtSecret(): Promise<string> {
  if (cachedSecret) {
    return cachedSecret;
  }

  const secretArn = process.env.JWT_SECRET_ARN;
  if (!secretArn) {
    throw new Error('JWT_SECRET_ARN environment variable not set');
  }

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  if (!response.SecretString) {
    throw new Error('JWT secret not found');
  }

  cachedSecret = response.SecretString;
  return response.SecretString;
}

/**
 * Base64URL encode
 */
function base64UrlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64URL decode
 */
function base64UrlDecode(data: string): string {
  const padded = data + '='.repeat((4 - (data.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

/**
 * Sign a JWT token
 */
export async function signJwt(payload: JwtPayload): Promise<string> {
  const secret = await getJwtSecret();

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const message = `${headerEncoded}.${payloadEncoded}`;

  const signature = createHmac('sha256', secret)
    .update(message)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${message}.${signature}`;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyJwt(token: string): Promise<JwtPayload> {
  const secret = await getJwtSecret();

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }

  const [headerEncoded, payloadEncoded, signatureProvided] = parts;
  const message = `${headerEncoded}.${payloadEncoded}`;

  // Verify signature
  const expectedSignature = createHmac('sha256', secret)
    .update(message)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  if (signatureProvided !== expectedSignature) {
    throw new Error('Invalid signature');
  }

  // Decode payload
  const payload: JwtPayload = JSON.parse(base64UrlDecode(payloadEncoded));

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error('Token expired');
  }

  return payload;
}

/**
 * Create a JWT token for a wallet address
 */
export async function createToken(walletAddress: string): Promise<string> {
  const expiryHours = parseInt(process.env.TOKEN_EXPIRY_HOURS || '24', 10);
  const now = Math.floor(Date.now() / 1000);

  const payload: JwtPayload = {
    sub: walletAddress.toLowerCase(),
    iat: now,
    exp: now + expiryHours * 60 * 60,
  };

  return signJwt(payload);
}

/**
 * Extract wallet address from a verified token
 */
export async function getWalletFromToken(token: string): Promise<string> {
  const payload = await verifyJwt(token);
  return payload.sub;
}
