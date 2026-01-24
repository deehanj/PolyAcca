/**
 * TradingBalance - Header button showing USDC balance
 * Opens the DepositModal when clicked
 */

import { Loader2, Wallet } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useUserProfile } from '../hooks/useUserProfile';
import { useTradingBalance } from '../context/TradingBalanceContext';

export function TradingBalance() {
  const { isAuthenticated } = useAuth();
  const { safeWalletAddress, isLoading: profileLoading } = useUserProfile();
  const {
    tradingBalance,
    isLoading: contextLoading,
    openDepositModal,
  } = useTradingBalance();

  // Don't show if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Show loading state
  if (profileLoading || contextLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Loading...</span>
      </div>
    );
  }

  // Don't show if no Safe wallet yet
  if (!safeWalletAddress) {
    return null;
  }

  return (
    <button
      onClick={openDepositModal}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border hover:bg-muted transition-colors"
      title={`Trading wallet: ${safeWalletAddress}`}
    >
      <img
        src="https://assets.coingecko.com/coins/images/6319/small/usdc.png"
        alt="USDC"
        className="h-5 w-5 flex-shrink-0 rounded-full"
      />
      <span className="text-sm font-semibold">${tradingBalance}</span>
      <Wallet className="h-4 w-4 text-primary flex-shrink-0" />
    </button>
  );
}
