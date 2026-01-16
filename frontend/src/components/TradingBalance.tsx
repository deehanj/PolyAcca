/**
 * TradingBalance - Displays the USDC balance of the embedded trading wallet
 *
 * Shows in the header to let users know their available funds for betting.
 */

import { useReadContract } from 'wagmi';
import { erc20Abi } from 'viem';
import { Wallet, Loader2 } from 'lucide-react';
import { useUserProfile } from '../hooks/useUserProfile';
import { useAuth } from '../hooks/useAuth';

// USDC.e on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' as const;
const POLYGON_CHAIN_ID = 137;

export function TradingBalance() {
  const { isAuthenticated } = useAuth();
  const { embeddedWalletAddress, isLoading: profileLoading } = useUserProfile();

  const { data: balance, isLoading: balanceLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: embeddedWalletAddress ? [embeddedWalletAddress as `0x${string}`] : undefined,
    chainId: POLYGON_CHAIN_ID,
    query: {
      enabled: !!embeddedWalletAddress,
      refetchInterval: 30000, // Refresh every 30 seconds
    },
  });

  // Don't show if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Show loading state
  if (profileLoading || (embeddedWalletAddress && balanceLoading)) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  // Don't show if no embedded wallet yet
  if (!embeddedWalletAddress) {
    return null;
  }

  // Format balance (USDC has 6 decimals)
  const formattedBalance = balance ? (Number(balance) / 1e6).toFixed(2) : '0.00';

  return (
    <div
      className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
      title={`Trading wallet: ${embeddedWalletAddress}`}
    >
      <Wallet className="h-4 w-4 text-primary" />
      <span className="font-medium">${formattedBalance}</span>
      <span className="text-muted-foreground">USDC</span>
    </div>
  );
}
