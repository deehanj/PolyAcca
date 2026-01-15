/**
 * KMS encryption utilities
 *
 * Generic encryption/decryption using AWS KMS for sensitive data storage
 */

import {
  KMSClient,
  DecryptCommand,
  EncryptCommand,
} from '@aws-sdk/client-kms';
import { requireEnvVar } from '../utils/envVars';

const KMS_KEY_ARN = requireEnvVar('KMS_KEY_ARN');
const kmsClient = new KMSClient({});

/**
 * Encrypt a string using KMS
 */
export async function encryptValue(plaintext: string): Promise<string> {
  const response = await kmsClient.send(
    new EncryptCommand({
      KeyId: KMS_KEY_ARN,
      Plaintext: Buffer.from(plaintext),
    })
  );

  if (!response.CiphertextBlob) {
    throw new Error('Encryption failed');
  }

  return Buffer.from(response.CiphertextBlob).toString('base64');
}

/**
 * Decrypt a string using KMS
 */
export async function decryptValue(ciphertext: string): Promise<string> {
  const response = await kmsClient.send(
    new DecryptCommand({
      KeyId: KMS_KEY_ARN,
      CiphertextBlob: Buffer.from(ciphertext, 'base64'),
    })
  );

  if (!response.Plaintext) {
    throw new Error('Decryption failed');
  }

  return Buffer.from(response.Plaintext).toString();
}
