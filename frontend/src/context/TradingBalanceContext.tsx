import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useReadContract } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import { useUserProfile } from '../hooks/useUserProfile';
import { useAuth } from '../hooks/useAuth';
import { SUPPORTED_CHAINS } from '../lib/wagmi';

const USDC_DECIMALS = 6;

interface TradingBalanceContextValue {
  /** Formatted trading balance as a string (e.g., "123.45") */
  tradingBalance: string;
  /** Raw trading balance in wei */
  tradingBalanceRaw: bigint | undefined;
  /** Whether the balance is loading */
  isLoading: boolean;
  /** Open the deposit modal */
  openDepositModal: () => void;
  /** Close the deposit modal */
  closeDepositModal: () => void;
  /** Whether the deposit modal is open */
  isDepositModalOpen: boolean;
  /** Refetch the trading balance */
  refetchBalance: () => void;
  /** Check if user has sufficient balance for a given amount */
  hasSufficientBalance: (amount: number) => boolean;
  /** Amount needed for pending bet (null if not mid-bet) */
  pendingBetAmount: number | null;
  /** Shortfall amount (pendingBetAmount - tradingBalance, or null) */
  shortfall: number | null;
  /** Set pending bet info when opening modal mid-bet */
  setPendingBet: (amount: number) => void;
  /** Clear pending bet info */
  clearPendingBet: () => void;
}

const TradingBalanceContext = createContext<TradingBalanceContextValue | null>(null);

function formatBalance(balance: bigint | undefined): string {
  if (!balance) return '0.00';
  return Number(formatUnits(balance, USDC_DECIMALS)).toFixed(2);
}

export function TradingBalanceProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { safeWalletAddress, isLoading: profileLoading } = useUserProfile();
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [pendingBetAmount, setPendingBetAmountState] = useState<number | null>(null);

  const { data: tradingBalanceRaw, isLoading: balanceLoading, refetch } = useReadContract({
    address: SUPPORTED_CHAINS.polygon.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: safeWalletAddress ? [safeWalletAddress as `0x${string}`] : undefined,
    chainId: SUPPORTED_CHAINS.polygon.id,
    query: {
      enabled: !!safeWalletAddress && isAuthenticated,
      refetchInterval: isDepositModalOpen ? 5000 : 30000, // Fast poll when modal open
    },
  });

  const tradingBalance = formatBalance(tradingBalanceRaw);
  const isLoading = profileLoading || balanceLoading;

  const shortfall = useMemo(() => {
    if (pendingBetAmount === null) return null;
    const balance = parseFloat(tradingBalance);
    const deficit = pendingBetAmount - balance;
    return deficit > 0 ? deficit : null;
  }, [pendingBetAmount, tradingBalance]);

  const setPendingBet = useCallback((amount: number) => {
    setPendingBetAmountState(amount);
  }, []);

  const clearPendingBet = useCallback(() => {
    setPendingBetAmountState(null);
  }, []);

  const openDepositModal = useCallback(() => {
    setIsDepositModalOpen(true);
  }, []);

  const closeDepositModal = useCallback(() => {
    setIsDepositModalOpen(false);
  }, []);

  const refetchBalance = useCallback(() => {
    refetch();
  }, [refetch]);

  const hasSufficientBalance = useCallback((amount: number): boolean => {
    const balance = parseFloat(tradingBalance);
    return balance >= amount;
  }, [tradingBalance]);

  return (
    <TradingBalanceContext.Provider
      value={{
        tradingBalance,
        tradingBalanceRaw,
        isLoading,
        openDepositModal,
        closeDepositModal,
        isDepositModalOpen,
        refetchBalance,
        hasSufficientBalance,
        pendingBetAmount,
        shortfall,
        setPendingBet,
        clearPendingBet,
      }}
    >
      {children}
    </TradingBalanceContext.Provider>
  );
}

export function useTradingBalance() {
  const context = useContext(TradingBalanceContext);
  if (!context) {
    throw new Error('useTradingBalance must be used within a TradingBalanceProvider');
  }
  return context;
}
