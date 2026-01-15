/**
 * Shared auth utilities
 */

export const NONCE_MESSAGE_PREFIX = 'Sign this message to authenticate with PolyAcca:\n\nNonce: ';

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
