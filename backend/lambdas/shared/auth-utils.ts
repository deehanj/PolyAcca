/**
 * Shared auth utilities
 */

export const NONCE_MESSAGE_PREFIX = 'Sign this message to authenticate with PolyAcca:\n\nNonce: ';

/**
 * Build withdraw message for signing
 * This message includes the amount so users can verify what they're authorizing
 */
export function buildWithdrawMessage(amount: string, nonce: string): string {
  return `Withdraw ${amount} USDC from PolyAcca\n\nNonce: ${nonce}`;
}

/**
 * Validate Ethereum address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
