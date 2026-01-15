/**
 * Admin configuration
 *
 * Hard-coded list of admin wallet addresses
 */

// Add wallet addresses (lowercase) that should have admin access
const ADMIN_WALLETS: string[] = [
  // Add your admin wallet addresses here
  // '0x1234...'.toLowerCase(),
];

/**
 * Check if a wallet address has admin privileges
 */
export function isAdminWallet(walletAddress: string): boolean {
  return ADMIN_WALLETS.includes(walletAddress.toLowerCase());
}
