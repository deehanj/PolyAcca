/**
 * DepositModal - Smart deposit modal that adapts based on user situation
 *
 * Shows different primary actions based on:
 * - Has Polygon USDC: Deposit form front and center
 * - Has no USDC: "Buy USDC" button prominently
 * - Has shortfall: Shows deficit messaging with smart suggestions
 */

import { useState, useEffect } from 'react';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { erc20Abi, parseUnits, formatUnits } from 'viem';
import { Loader2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useTradingBalance } from '../../context/TradingBalanceContext';
import { Dialog, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { SUPPORTED_CHAINS } from '../../lib/wagmi';
import { MoreOptions } from './MoreOptions';
import { WithdrawTab } from './WithdrawTab';

const USDC_DECIMALS = 6;

type ModalState = 'idle' | 'waiting' | 'success';

function formatBalance(balance: bigint | undefined): string {
  if (!balance) return '0.00';
  return Number(formatUnits(balance, USDC_DECIMALS)).toFixed(2);
}

export function DepositModal() {
  const { address: connectedAddress } = useAccount();
  const { safeWalletAddress } = useUserProfile();
  const {
    tradingBalance,
    tradingBalanceRaw,
    isDepositModalOpen,
    closeDepositModal,
    pendingBetAmount,
    shortfall,
    clearPendingBet,
    refetchBalance,
  } = useTradingBalance();

  const [modalState, setModalState] = useState<ModalState>('idle');
  const [previousBalanceRaw, setPreviousBalanceRaw] = useState<bigint | null>(null);
  const [depositedAmount, setDepositedAmount] = useState<string | null>(null);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');

  // Track raw balance for detecting deposits (using bigint for precision)
  useEffect(() => {
    if (isDepositModalOpen && modalState === 'idle' && tradingBalanceRaw !== undefined) {
      setPreviousBalanceRaw(tradingBalanceRaw);
    }
  }, [isDepositModalOpen, modalState, tradingBalanceRaw]);

  // Detect balance increase while waiting (using bigint comparison for precision)
  useEffect(() => {
    if (modalState === 'waiting' && previousBalanceRaw !== null && tradingBalanceRaw !== undefined) {
      if (tradingBalanceRaw > previousBalanceRaw) {
        const diff = tradingBalanceRaw - previousBalanceRaw;
        setDepositedAmount(formatBalance(diff));
        setModalState('success');
      }
    }
  }, [modalState, previousBalanceRaw, tradingBalanceRaw]);

  // USDC on Polygon (connected wallet)
  const { data: polygonUsdcBalance } = useReadContract({
    address: SUPPORTED_CHAINS.polygon.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    chainId: SUPPORTED_CHAINS.polygon.id,
    query: { enabled: !!connectedAddress && isDepositModalOpen },
  });

  const polygonUsdc = formatBalance(polygonUsdcBalance);
  const hasPolygonUsdc = parseFloat(polygonUsdc) > 0;

  const handleClose = () => {
    closeDepositModal();
    clearPendingBet();
    setModalState('idle');
    setPreviousBalanceRaw(null);
    setDepositedAmount(null);
    setMoreOptionsOpen(false);
    setActiveTab('deposit');
  };

  const handleBuyUsdc = () => {
    // Open Polymarket's deposit page - they have MoonPay integrated
    // Since we use Polymarket's Safe infrastructure, funds go to the same wallet
    window.open('https://polymarket.com/deposit', '_blank');
    setModalState('waiting');
  };

  const handlePlaceBet = () => {
    handleClose();
    // The bet will be placed by the sidebar when it detects sufficient balance
  };

  return (
    <Dialog open={isDepositModalOpen} onClose={handleClose}>
      {modalState === 'success' ? (
        <DepositSuccess
          amount={depositedAmount || '0'}
          newBalance={tradingBalance}
          pendingBetAmount={pendingBetAmount}
          onPlaceBet={handlePlaceBet}
          onClose={handleClose}
        />
      ) : modalState === 'waiting' ? (
        <WaitingForDeposit balance={tradingBalance} />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-4 p-1 rounded-lg bg-muted">
            <button
              onClick={() => setActiveTab('deposit')}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'deposit'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Deposit
            </button>
            <button
              onClick={() => setActiveTab('withdraw')}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'withdraw'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Withdraw
            </button>
          </div>

          {activeTab === 'deposit' ? (
            <DepositOptions
              tradingBalance={tradingBalance}
              pendingBetAmount={pendingBetAmount}
              shortfall={shortfall}
              polygonUsdc={polygonUsdc}
              polygonUsdcBalance={polygonUsdcBalance}
              hasPolygonUsdc={hasPolygonUsdc}
              safeWalletAddress={safeWalletAddress}
              onBuyUsdc={handleBuyUsdc}
              moreOptionsOpen={moreOptionsOpen}
              setMoreOptionsOpen={setMoreOptionsOpen}
              setModalState={setModalState}
              refetchBalance={refetchBalance}
            />
          ) : (
            <WithdrawTab />
          )}
        </>
      )}
    </Dialog>
  );
}

// Sub-components defined below...

interface DepositSuccessProps {
  amount: string;
  newBalance: string;
  pendingBetAmount: number | null;
  onPlaceBet: () => void;
  onClose: () => void;
}

function DepositSuccess({ amount, newBalance, pendingBetAmount, onPlaceBet, onClose }: DepositSuccessProps) {
  return (
    <div className="text-center py-6">
      <div className="text-5xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold text-foreground mb-2">
        ${amount} added!
      </h2>
      <p className="text-muted-foreground mb-6">
        New balance: ${newBalance}
      </p>
      {pendingBetAmount && (
        <Button
          onClick={onPlaceBet}
          className="w-full mb-3"
          size="lg"
        >
          Place ${pendingBetAmount.toFixed(2)} Bet
        </Button>
      )}
      <button
        onClick={onClose}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        or continue browsing
      </button>
    </div>
  );
}

function WaitingForDeposit({ balance }: { balance: string }) {
  return (
    <div className="text-center py-8">
      <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
      <h2 className="text-lg font-semibold text-foreground mb-2">
        Waiting for deposit...
      </h2>
      <p className="text-sm text-muted-foreground mb-4">
        Balance: ${balance}
      </p>
      <p className="text-xs text-muted-foreground">
        Funds typically arrive in 1-5 minutes
      </p>
    </div>
  );
}

interface DepositOptionsProps {
  tradingBalance: string;
  pendingBetAmount: number | null;
  shortfall: number | null;
  polygonUsdc: string;
  polygonUsdcBalance: bigint | undefined;
  hasPolygonUsdc: boolean;
  safeWalletAddress: string | undefined;
  onBuyUsdc: () => void;
  moreOptionsOpen: boolean;
  setMoreOptionsOpen: (open: boolean) => void;
  setModalState: (state: ModalState) => void;
  refetchBalance: () => void;
}

function DepositOptions({
  tradingBalance,
  pendingBetAmount,
  shortfall,
  polygonUsdc,
  polygonUsdcBalance,
  hasPolygonUsdc,
  safeWalletAddress,
  onBuyUsdc,
  moreOptionsOpen,
  setMoreOptionsOpen,
  setModalState,
  refetchBalance,
}: DepositOptionsProps) {
  const [depositAmount, setDepositAmount] = useState('');
  const [polygonExpanded, setPolygonExpanded] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Direct deposit transaction
  const { writeContract, data: txHash, isPending: isWritePending, error: writeError, reset: resetWrite } = useWriteContract();
  const { isLoading: isTxPending, isSuccess: isTxSuccess, isError: isTxError, error: txError } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Reset error state when user modifies input
  useEffect(() => {
    if (writeError || txError) {
      resetWrite();
    }
    setValidationError(null);
  }, [depositAmount]);

  useEffect(() => {
    if (isTxSuccess) {
      refetchBalance();
      setModalState('waiting');
    }
  }, [isTxSuccess, refetchBalance, setModalState]);

  // Validate deposit amount
  const validateDeposit = (): boolean => {
    // Check if amount is provided
    if (!depositAmount || depositAmount.trim() === '') {
      setValidationError('Please enter an amount');
      return false;
    }

    // Check if amount is a valid number
    const amount = parseFloat(depositAmount);
    if (isNaN(amount)) {
      setValidationError('Please enter a valid number');
      return false;
    }

    // Check if amount is positive
    if (amount <= 0) {
      setValidationError('Amount must be greater than 0');
      return false;
    }

    // Check if amount exceeds Polygon USDC balance
    if (polygonUsdcBalance !== undefined) {
      try {
        const depositAmountRaw = parseUnits(depositAmount, USDC_DECIMALS);
        if (depositAmountRaw > polygonUsdcBalance) {
          setValidationError(`Insufficient balance. You have $${polygonUsdc} USDC`);
          return false;
        }
      } catch {
        setValidationError('Invalid amount format');
        return false;
      }
    }

    setValidationError(null);
    return true;
  };

  const handleDirectDeposit = () => {
    if (!safeWalletAddress) return;

    // Validate before proceeding
    if (!validateDeposit()) return;

    const amount = parseUnits(depositAmount, USDC_DECIMALS);
    writeContract({
      address: SUPPORTED_CHAINS.polygon.usdc,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [safeWalletAddress as `0x${string}`, amount],
      chainId: SUPPORTED_CHAINS.polygon.id,
    });
  };

  const isDepositing = isWritePending || isTxPending;
  const hasError = !!writeError || isTxError || !!validationError;
  const errorMessage = validationError || writeError?.message || txError?.message || 'Transaction failed';

  return (
    <>
      {/* Header with deficit messaging */}
      {shortfall !== null ? (
        <div className="mb-6">
          <DialogTitle>You need ${shortfall.toFixed(2)} more</DialogTitle>
          <div className="text-sm text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Trading balance</span>
              <span>${tradingBalance}</span>
            </div>
            <div className="flex justify-between">
              <span>Bet amount</span>
              <span>${pendingBetAmount?.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-destructive font-medium">
              <span>Shortfall</span>
              <span>-${shortfall.toFixed(2)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <DialogTitle>Deposit to Trading Wallet</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Balance: ${tradingBalance}
          </p>
        </div>
      )}

      {/* Primary options */}
      <div className="space-y-3">
        {/* Buy USDC - always shown, prominent when no Polygon USDC */}
        <button
          onClick={onBuyUsdc}
          className={`w-full p-4 rounded-lg border text-left transition-colors ${
            !hasPolygonUsdc
              ? 'border-primary bg-primary/5 hover:bg-primary/10'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">💳</span>
              <div>
                <div className="font-medium text-foreground">Buy USDC on Polygon</div>
                <div className="text-xs text-muted-foreground">
                  Card, Apple Pay, Bank transfer via Polymarket
                </div>
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </div>
        </button>

        {/* Deposit from Polygon */}
        <div
          className={`rounded-lg border transition-colors ${
            hasPolygonUsdc
              ? 'border-primary bg-primary/5'
              : 'border-border'
          }`}
        >
          <button
            onClick={() => hasPolygonUsdc && setPolygonExpanded(!polygonExpanded)}
            className={`w-full p-4 text-left ${!hasPolygonUsdc ? 'opacity-60' : ''}`}
            disabled={!hasPolygonUsdc}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-sm font-bold">
                  P
                </div>
                <div>
                  <div className="font-medium text-foreground">
                    Deposit from Polygon
                  </div>
                  <div className="text-xs text-muted-foreground">
                    You have ${polygonUsdc} USDC
                    {hasPolygonUsdc && ' ✓'}
                  </div>
                </div>
              </div>
              {hasPolygonUsdc && (
                polygonExpanded ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )
              )}
            </div>
          </button>

          {polygonExpanded && hasPolygonUsdc && (
            <div className="px-4 pb-4 pt-0 border-t border-border/50">
              <div className="pt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Amount (USDC)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                      min="0"
                      step="0.01"
                      max={polygonUsdc}
                      disabled={isDepositing}
                    />
                    <button
                      onClick={() => setDepositAmount(polygonUsdc)}
                      className="px-3 py-2 text-xs border border-border rounded-md hover:bg-muted"
                    >
                      Max
                    </button>
                  </div>
                </div>

                <Button
                  onClick={handleDirectDeposit}
                  disabled={!depositAmount || parseFloat(depositAmount) <= 0 || isDepositing}
                  className="w-full"
                >
                  {isDepositing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {isTxPending ? 'Confirming...' : 'Approve in wallet...'}
                    </>
                  ) : (
                    `Deposit $${depositAmount || '0.00'}`
                  )}
                </Button>

                {/* Error display */}
                {hasError && (
                  <div className="text-sm text-destructive mt-2">
                    {errorMessage}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* More options toggle */}
      <button
        onClick={() => setMoreOptionsOpen(!moreOptionsOpen)}
        className="w-full mt-4 py-2 text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
      >
        {moreOptionsOpen ? (
          <>
            <ChevronUp className="h-4 w-4" />
            Less options
          </>
        ) : (
          <>
            <ChevronDown className="h-4 w-4" />
            More options
          </>
        )}
      </button>

      {/* More options content - Bridge and manual deposit */}
      {moreOptionsOpen && (
        <div className="mt-4">
          <MoreOptions
            safeWalletAddress={safeWalletAddress}
            onStartWaiting={() => setModalState('waiting')}
          />
        </div>
      )}
    </>
  );
}
