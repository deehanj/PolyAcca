# Deposit UX Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the deposit modal to be Polygon-first, preventing users from accidentally depositing to wrong chains, with smart adaptive UI based on user situation.

**Architecture:** Refactor monolithic TradingBalance.tsx into smaller components. Add pending bet context for deficit-based messaging. Enable fast polling when modal is open. Integrate AppKit's OnRampProviders for buying USDC.

**Tech Stack:** React, TypeScript, wagmi, viem, @reown/appkit, Tailwind CSS

---

## Task 1: Extend TradingBalanceContext with Pending Bet State

**Files:**
- Modify: `frontend/src/context/TradingBalanceContext.tsx`

**Step 1: Add new state and functions to context interface**

Add to the `TradingBalanceContextValue` interface:

```typescript
interface TradingBalanceContextValue {
  // ... existing fields ...

  /** Amount needed for pending bet (null if not mid-bet) */
  pendingBetAmount: number | null;
  /** Shortfall amount (pendingBetAmount - tradingBalance, or null) */
  shortfall: number | null;
  /** Set pending bet info when opening modal mid-bet */
  setPendingBet: (amount: number) => void;
  /** Clear pending bet info */
  clearPendingBet: () => void;
}
```

**Step 2: Implement the new state in the provider**

Add state and callbacks inside `TradingBalanceProvider`:

```typescript
const [pendingBetAmount, setPendingBetAmountState] = useState<number | null>(null);

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
```

**Step 3: Update refetchInterval for fast polling when modal is open**

Change the useReadContract query:

```typescript
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
```

**Step 4: Add new values to context provider**

```typescript
<TradingBalanceContext.Provider
  value={{
    // ... existing values ...
    pendingBetAmount,
    shortfall,
    setPendingBet,
    clearPendingBet,
  }}
>
```

**Step 5: Verify build passes**

Run: `npm run build --prefix frontend`
Expected: Build succeeds with no errors

**Step 6: Commit**

```bash
git add frontend/src/context/TradingBalanceContext.tsx
git commit -m "feat(deposit): add pending bet state to TradingBalanceContext

- Add pendingBetAmount and shortfall to context
- Add setPendingBet and clearPendingBet callbacks
- Enable 5s polling when deposit modal is open"
```

---

## Task 2: Update AccumulatorSidebar to Pass Bet Amount

**Files:**
- Modify: `frontend/src/components/AccumulatorSidebar.tsx`

**Step 1: Import setPendingBet from context**

Update the destructuring from useTradingBalance:

```typescript
const { hasSufficientBalance, openDepositModal, setPendingBet } = useTradingBalance();
```

**Step 2: Set pending bet before opening modal**

In `handlePlaceBet`, update the insufficient balance check:

```typescript
// Check if user has sufficient balance
if (!hasSufficientBalance(stakeAmount)) {
  setPendingBet(stakeAmount);
  openDepositModal();
  return;
}
```

**Step 3: Verify build passes**

Run: `npm run build --prefix frontend`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/components/AccumulatorSidebar.tsx
git commit -m "feat(deposit): pass bet amount when opening deposit modal

Sets pending bet amount in context before opening modal,
enabling deficit-based messaging in the deposit flow."
```

---

## Task 3: Create Deposit Modal Component Structure

**Files:**
- Create: `frontend/src/components/deposit/DepositModal.tsx`
- Create: `frontend/src/components/deposit/index.ts`

**Step 1: Create the deposit directory**

Run: `mkdir -p frontend/src/components/deposit`

**Step 2: Create the main DepositModal component**

Create `frontend/src/components/deposit/DepositModal.tsx`:

```typescript
/**
 * DepositModal - Smart deposit modal that adapts based on user situation
 *
 * Shows different primary actions based on:
 * - Has Polygon USDC: Deposit form front and center
 * - Has no USDC: "Buy USDC" button prominently
 * - Has shortfall: Shows deficit messaging with smart suggestions
 */

import { useState, useEffect, useMemo } from 'react';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { erc20Abi, parseUnits, formatUnits } from 'viem';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useUserProfile } from '../../hooks/useUserProfile';
import { useTradingBalance } from '../../context/TradingBalanceContext';
import { Dialog, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { SUPPORTED_CHAINS } from '../../lib/wagmi';

const USDC_DECIMALS = 6;

type ModalState = 'idle' | 'waiting' | 'success';

function formatBalance(balance: bigint | undefined): string {
  if (!balance) return '0.00';
  return Number(formatUnits(balance, USDC_DECIMALS)).toFixed(2);
}

export function DepositModal() {
  const { open: openAppKit } = useAppKit();
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
  const [previousBalance, setPreviousBalance] = useState<string | null>(null);
  const [depositedAmount, setDepositedAmount] = useState<string | null>(null);
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);

  // Track balance for detecting deposits
  useEffect(() => {
    if (isDepositModalOpen && modalState === 'idle') {
      setPreviousBalance(tradingBalance);
    }
  }, [isDepositModalOpen, modalState, tradingBalance]);

  // Detect balance increase while waiting
  useEffect(() => {
    if (modalState === 'waiting' && previousBalance !== null) {
      const prev = parseFloat(previousBalance);
      const current = parseFloat(tradingBalance);
      if (current > prev) {
        const deposited = (current - prev).toFixed(2);
        setDepositedAmount(deposited);
        setModalState('success');
      }
    }
  }, [modalState, previousBalance, tradingBalance]);

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
    setPreviousBalance(null);
    setDepositedAmount(null);
    setMoreOptionsOpen(false);
  };

  const handleBuyUsdc = () => {
    openAppKit({ view: 'OnRampProviders' });
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
        <DepositOptions
          tradingBalance={tradingBalance}
          pendingBetAmount={pendingBetAmount}
          shortfall={shortfall}
          polygonUsdc={polygonUsdc}
          hasPolygonUsdc={hasPolygonUsdc}
          safeWalletAddress={safeWalletAddress}
          connectedAddress={connectedAddress}
          onBuyUsdc={handleBuyUsdc}
          moreOptionsOpen={moreOptionsOpen}
          setMoreOptionsOpen={setMoreOptionsOpen}
          setModalState={setModalState}
          refetchBalance={refetchBalance}
        />
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
  hasPolygonUsdc: boolean;
  safeWalletAddress: string | null;
  connectedAddress: `0x${string}` | undefined;
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
  hasPolygonUsdc,
  safeWalletAddress,
  connectedAddress,
  onBuyUsdc,
  moreOptionsOpen,
  setMoreOptionsOpen,
  setModalState,
  refetchBalance,
}: DepositOptionsProps) {
  const [depositAmount, setDepositAmount] = useState('');
  const [polygonExpanded, setPolygonExpanded] = useState(false);

  // Direct deposit transaction
  const { writeContract, data: txHash, isPending: isWritePending, reset } = useWriteContract();
  const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  useEffect(() => {
    if (isTxSuccess) {
      refetchBalance();
      setModalState('waiting');
    }
  }, [isTxSuccess, refetchBalance, setModalState]);

  const handleDirectDeposit = () => {
    if (!depositAmount || !safeWalletAddress) return;
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
          <div className="flex items-center gap-3">
            <span className="text-2xl">💳</span>
            <div>
              <div className="font-medium text-foreground">Buy USDC</div>
              <div className="text-xs text-muted-foreground">
                Card, Apple Pay, Bank transfer
              </div>
            </div>
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

      {/* More options content - to be expanded in Task 5 */}
      {moreOptionsOpen && (
        <div className="mt-4 p-4 rounded-lg border border-border bg-muted/30">
          <p className="text-sm text-muted-foreground">
            Bridge from Ethereum/Base and manual deposit options coming in next task...
          </p>
        </div>
      )}
    </>
  );
}
```

**Step 3: Create the index export**

Create `frontend/src/components/deposit/index.ts`:

```typescript
export { DepositModal } from './DepositModal';
```

**Step 4: Verify build passes**

Run: `npm run build --prefix frontend`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/components/deposit/
git commit -m "feat(deposit): create new DepositModal component structure

- Smart adaptive UI based on user situation
- Deficit-based messaging when opened mid-bet
- Buy USDC via AppKit OnRampProviders
- Direct Polygon deposit with expandable form
- Waiting and success states with balance polling"
```

---

## Task 4: Integrate DepositModal and Simplify TradingBalance

**Files:**
- Modify: `frontend/src/components/TradingBalance.tsx`
- Modify: `frontend/src/App.tsx`

**Step 1: Simplify TradingBalance to just the header button**

Replace the entire `TradingBalance.tsx` with a minimal version:

```typescript
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
```

**Step 2: Add DepositModal to App.tsx**

Import and add the DepositModal inside the providers:

```typescript
import { DepositModal } from './components/deposit';

// In the App component, add DepositModal after AccumulatorProvider:
function App() {
  return (
    <Web3Provider>
      <AuthProvider>
        <TradingBalanceProvider>
          <BrowserRouter>
            <AccumulatorProvider>
              <AppContent />
              <DepositModal />
              <Toaster position="bottom-right" theme="dark" richColors />
            </AccumulatorProvider>
          </BrowserRouter>
        </TradingBalanceProvider>
      </AuthProvider>
    </Web3Provider>
  );
}
```

**Step 3: Verify build passes**

Run: `npm run build --prefix frontend`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/components/TradingBalance.tsx frontend/src/App.tsx
git commit -m "feat(deposit): integrate DepositModal, simplify TradingBalance

- TradingBalance now just a header button (removed modal code)
- DepositModal rendered at app root level
- Modal controlled via TradingBalanceContext"
```

---

## Task 5: Add More Options Section (Bridge & Manual Deposit)

**Files:**
- Create: `frontend/src/components/deposit/MoreOptions.tsx`
- Modify: `frontend/src/components/deposit/DepositModal.tsx`

**Step 1: Create MoreOptions component**

Create `frontend/src/components/deposit/MoreOptions.tsx`:

```typescript
/**
 * MoreOptions - Collapsed section for bridge and manual deposit
 * Shows other chain balances with warnings about gas fees
 */

import { useState, useEffect } from 'react';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useBalance, useSwitchChain } from 'wagmi';
import { erc20Abi, parseUnits, formatUnits } from 'viem';
import { AlertTriangle, Copy, Check, ExternalLink, Loader2 } from 'lucide-react';
import { SUPPORTED_CHAINS } from '../../lib/wagmi';
import { Button } from '../ui/Button';

const USDC_DECIMALS = 6;
const POLYMARKET_BRIDGE_API = 'https://bridge.polymarket.com/deposit';

interface DepositAddresses {
  evm: string;
  svm: string;
  btc: string;
}

function formatBalance(balance: bigint | undefined): string {
  if (!balance) return '0.00';
  return Number(formatUnits(balance, USDC_DECIMALS)).toFixed(2);
}

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

interface MoreOptionsProps {
  safeWalletAddress: string | null;
  onStartWaiting: () => void;
}

export function MoreOptions({ safeWalletAddress, onStartWaiting }: MoreOptionsProps) {
  const { address: connectedAddress } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const [depositAddresses, setDepositAddresses] = useState<DepositAddresses | null>(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [selectedBridgeChain, setSelectedBridgeChain] = useState<'base' | 'ethereum' | null>(null);
  const [bridgeAmount, setBridgeAmount] = useState('');
  const [copiedAddress, setCopiedAddress] = useState(false);

  // Fetch deposit addresses
  useEffect(() => {
    async function fetchAddresses() {
      if (!safeWalletAddress || depositAddresses) return;
      setIsLoadingAddresses(true);
      try {
        const response = await fetch(POLYMARKET_BRIDGE_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: safeWalletAddress }),
        });
        if (response.ok) {
          const data = await response.json();
          setDepositAddresses(data.address);
        }
      } catch (error) {
        console.error('Failed to fetch deposit addresses:', error);
      } finally {
        setIsLoadingAddresses(false);
      }
    }
    fetchAddresses();
  }, [safeWalletAddress, depositAddresses]);

  // Other chain balances
  const { data: baseUsdcBalance } = useReadContract({
    address: SUPPORTED_CHAINS.base.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    chainId: SUPPORTED_CHAINS.base.id,
    query: { enabled: !!connectedAddress },
  });

  const { data: ethereumUsdcBalance } = useReadContract({
    address: SUPPORTED_CHAINS.ethereum.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    chainId: SUPPORTED_CHAINS.ethereum.id,
    query: { enabled: !!connectedAddress },
  });

  const { data: baseEthBalance } = useBalance({
    address: connectedAddress,
    chainId: SUPPORTED_CHAINS.base.id,
    query: { enabled: !!connectedAddress },
  });

  const { data: ethereumEthBalance } = useBalance({
    address: connectedAddress,
    chainId: SUPPORTED_CHAINS.ethereum.id,
    query: { enabled: !!connectedAddress },
  });

  const baseUsdc = formatBalance(baseUsdcBalance);
  const ethereumUsdc = formatBalance(ethereumUsdcBalance);
  const hasBaseUsdc = parseFloat(baseUsdc) > 0;
  const hasEthereumUsdc = parseFloat(ethereumUsdc) > 0;
  const hasOtherChainUsdc = hasBaseUsdc || hasEthereumUsdc;
  const hasBaseGas = baseEthBalance && baseEthBalance.value > 0n;
  const hasEthereumGas = ethereumEthBalance && ethereumEthBalance.value > 0n;

  // Bridge transaction
  const { writeContract, isPending: isWritePending } = useWriteContract();
  const isDepositing = isWritePending || isSwitchingChain;

  const handleBridgeTransfer = async () => {
    if (!bridgeAmount || !depositAddresses?.evm || !selectedBridgeChain) return;

    const chainInfo = selectedBridgeChain === 'base' ? SUPPORTED_CHAINS.base : SUPPORTED_CHAINS.ethereum;
    const amount = parseUnits(bridgeAmount, USDC_DECIMALS);

    try {
      switchChain({ chainId: chainInfo.id });
    } catch {
      return;
    }

    writeContract({
      address: chainInfo.usdc,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [depositAddresses.evm as `0x${string}`, amount],
      chainId: chainInfo.id,
    });

    onStartWaiting();
  };

  const handleCopyAddress = async () => {
    if (depositAddresses?.evm) {
      await navigator.clipboard.writeText(depositAddresses.evm);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const getSelectedChainBalance = () => {
    if (selectedBridgeChain === 'base') return baseUsdc;
    if (selectedBridgeChain === 'ethereum') return ethereumUsdc;
    return '0';
  };

  const selectedChainHasGas = () => {
    if (selectedBridgeChain === 'base') return hasBaseGas;
    if (selectedBridgeChain === 'ethereum') return hasEthereumGas;
    return true;
  };

  return (
    <div className="space-y-4">
      {/* Bridge from other chains */}
      {hasOtherChainUsdc && (
        <div className="rounded-lg border border-border p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-foreground">
                Bridge from another chain
              </h4>
              <p className="text-xs text-amber-500">
                Gas fees may be $5-15. Consider buying fresh on Polygon instead.
              </p>
            </div>
          </div>

          {!selectedBridgeChain ? (
            <div className="space-y-2">
              {hasEthereumUsdc && (
                <button
                  onClick={() => setSelectedBridgeChain('ethereum')}
                  className="w-full p-3 rounded-md border border-border hover:border-primary/50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold">
                      Ξ
                    </div>
                    <span className="text-sm">Ethereum</span>
                  </div>
                  <span className="text-sm text-muted-foreground">${ethereumUsdc}</span>
                </button>
              )}
              {hasBaseUsdc && (
                <button
                  onClick={() => setSelectedBridgeChain('base')}
                  className="w-full p-3 rounded-md border border-border hover:border-primary/50 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                      B
                    </div>
                    <span className="text-sm">Base</span>
                  </div>
                  <span className="text-sm text-muted-foreground">${baseUsdc}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  {selectedBridgeChain === 'ethereum' ? 'Ethereum' : 'Base'}
                </span>
                <button
                  onClick={() => {
                    setSelectedBridgeChain(null);
                    setBridgeAmount('');
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Change
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="0.00"
                  value={bridgeAmount}
                  onChange={(e) => setBridgeAmount(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                  max={getSelectedChainBalance()}
                />
                <button
                  onClick={() => setBridgeAmount(getSelectedChainBalance())}
                  className="px-3 py-2 text-xs border border-border rounded-md hover:bg-muted"
                >
                  Max
                </button>
              </div>

              {!selectedChainHasGas() && (
                <p className="text-xs text-amber-500">
                  You need ETH on {selectedBridgeChain === 'base' ? 'Base' : 'Ethereum'} for gas
                </p>
              )}

              <Button
                onClick={handleBridgeTransfer}
                disabled={!bridgeAmount || parseFloat(bridgeAmount) <= 0 || isDepositing || !selectedChainHasGas()}
                className="w-full"
                variant="outline"
              >
                {isDepositing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  'Bridge to Polygon'
                )}
              </Button>
            </div>
          )}

          {/* Alternative bridges */}
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">
              Or try a cheaper bridge:
            </p>
            <div className="flex gap-2">
              <a
                href="https://jumper.exchange"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Jumper <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://portal.polygon.technology/bridge"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Polygon Portal <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Manual deposit */}
      <div className="rounded-lg border border-border p-4">
        <h4 className="text-sm font-medium text-foreground mb-2">
          Manual deposit
        </h4>
        <p className="text-xs text-muted-foreground mb-3">
          Send USDC from any wallet or exchange
        </p>

        {isLoadingAddresses ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : depositAddresses?.evm ? (
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
            <code className="flex-1 text-xs font-mono truncate">
              {truncateAddress(depositAddresses.evm)}
            </code>
            <button
              onClick={handleCopyAddress}
              className="p-1.5 hover:bg-muted rounded"
            >
              {copiedAddress ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Unable to load deposit address
          </p>
        )}

        <p className="text-xs text-muted-foreground mt-2">
          Supported: Polygon, Ethereum, Base, Solana, Bitcoin (auto-converted)
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Update DepositModal to use MoreOptions**

In `DepositModal.tsx`, import and use the MoreOptions component:

Add import:
```typescript
import { MoreOptions } from './MoreOptions';
```

Replace the placeholder "More options" content in DepositOptions:

```typescript
{moreOptionsOpen && (
  <div className="mt-4">
    <MoreOptions
      safeWalletAddress={safeWalletAddress}
      onStartWaiting={() => setModalState('waiting')}
    />
  </div>
)}
```

**Step 3: Update index.ts**

```typescript
export { DepositModal } from './DepositModal';
export { MoreOptions } from './MoreOptions';
```

**Step 4: Verify build passes**

Run: `npm run build --prefix frontend`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/components/deposit/
git commit -m "feat(deposit): add More Options section with bridge and manual deposit

- Bridge from Ethereum/Base with gas fee warnings
- Alternative bridge links (Jumper, Polygon Portal)
- Manual deposit address copy
- Tip about buying fresh vs bridging small amounts"
```

---

## Task 6: Add Withdraw Tab

**Files:**
- Create: `frontend/src/components/deposit/WithdrawTab.tsx`
- Modify: `frontend/src/components/deposit/DepositModal.tsx`

**Step 1: Create WithdrawTab component**

Create `frontend/src/components/deposit/WithdrawTab.tsx`:

```typescript
/**
 * WithdrawTab - Withdraw USDC from trading wallet to connected wallet
 */

import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { Loader2, Send } from 'lucide-react';
import { useTradingBalance } from '../../context/TradingBalanceContext';
import { Button } from '../ui/Button';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

function buildWithdrawMessage(amount: string, nonce: string): string {
  return `Withdraw ${amount} USDC from PolyAcca\n\nNonce: ${nonce}`;
}

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

export function WithdrawTab() {
  const { address: connectedAddress } = useAccount();
  const { tradingBalance, refetchBalance } = useTradingBalance();
  const { signMessageAsync } = useSignMessage();

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null);

  const handleWithdraw = async () => {
    if (!withdrawAmount || !connectedAddress) return;

    setIsWithdrawing(true);
    setWithdrawError(null);
    setWithdrawSuccess(null);

    try {
      // Get nonce
      const nonceRes = await fetch(`${API_URL}/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: connectedAddress }),
      });

      if (!nonceRes.ok) throw new Error('Failed to get nonce');
      const nonceData = await nonceRes.json();
      if (!nonceData.success) throw new Error(nonceData.error || 'Failed to get nonce');

      // Sign message
      const formattedAmount = parseFloat(withdrawAmount).toFixed(2);
      const message = buildWithdrawMessage(formattedAmount, nonceData.data.nonce);
      const signature = await signMessageAsync({ message });

      // Execute withdraw
      const withdrawRes = await fetch(`${API_URL}/wallet/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: connectedAddress,
          amount: formattedAmount,
          signature,
        }),
      });

      const withdrawData = await withdrawRes.json();
      if (!withdrawRes.ok || !withdrawData.success) {
        throw new Error(withdrawData.error || 'Withdraw failed');
      }

      setWithdrawSuccess(withdrawData.data.txHash);
      setWithdrawAmount('');
      setTimeout(() => refetchBalance(), 3000);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Withdraw failed';
      if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
        setWithdrawError('Signature rejected');
      } else {
        setWithdrawError(errorMessage);
      }
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Trading wallet balance */}
      <div className="rounded-lg border border-border bg-muted/50 p-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
          Trading Wallet Balance
        </p>
        <div className="flex items-center gap-2">
          <img
            src="https://assets.coingecko.com/coins/images/6319/small/usdc.png"
            alt="USDC"
            className="h-6 w-6 rounded-full"
          />
          <span className="text-2xl font-bold">${tradingBalance}</span>
        </div>
      </div>

      {/* Withdraw form */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          Withdraw Amount (USDC)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="0.00"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            min="0"
            step="0.01"
            max={tradingBalance}
            disabled={isWithdrawing}
          />
          <button
            onClick={() => setWithdrawAmount(tradingBalance)}
            className="px-3 py-2 text-xs border border-border rounded-md hover:bg-muted"
            disabled={isWithdrawing}
          >
            Max
          </button>
        </div>
      </div>

      {/* Destination info */}
      <div className="rounded-lg bg-muted/50 border border-border p-3">
        <p className="text-xs text-muted-foreground">
          Funds will be sent to your connected wallet on Polygon:
        </p>
        <code className="text-xs font-mono text-foreground mt-1 block">
          {connectedAddress ? truncateAddress(connectedAddress) : 'No wallet connected'}
        </code>
      </div>

      {/* Error/Success messages */}
      {withdrawError && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {withdrawError}
        </div>
      )}

      {withdrawSuccess && (
        <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-500">
          Withdrawal successful!
          <a
            href={`https://polygonscan.com/tx/${withdrawSuccess}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block mt-1 text-xs underline"
          >
            View on Polygonscan
          </a>
        </div>
      )}

      {/* Withdraw button */}
      <Button
        onClick={handleWithdraw}
        disabled={
          !withdrawAmount ||
          parseFloat(withdrawAmount) <= 0 ||
          parseFloat(withdrawAmount) > parseFloat(tradingBalance) ||
          isWithdrawing ||
          !connectedAddress
        }
        className="w-full"
      >
        {isWithdrawing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Processing...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Withdraw to Wallet
          </>
        )}
      </Button>
    </div>
  );
}
```

**Step 2: Add tabs to DepositModal**

Update `DepositModal.tsx` to include tabs for Deposit/Withdraw:

Add import:
```typescript
import { WithdrawTab } from './WithdrawTab';
```

Add state and tab UI in the main DepositModal component (update the Dialog content):

```typescript
const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');

// Reset tab when modal closes
const handleClose = () => {
  closeDepositModal();
  clearPendingBet();
  setModalState('idle');
  setPreviousBalance(null);
  setDepositedAmount(null);
  setMoreOptionsOpen(false);
  setActiveTab('deposit');
};

// In the Dialog, wrap content with tabs (only show tabs in 'idle' state):
{modalState === 'idle' && (
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
      <DepositOptions ... />
    ) : (
      <WithdrawTab />
    )}
  </>
)}
```

**Step 3: Update index.ts**

```typescript
export { DepositModal } from './DepositModal';
export { MoreOptions } from './MoreOptions';
export { WithdrawTab } from './WithdrawTab';
```

**Step 4: Verify build passes**

Run: `npm run build --prefix frontend`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/components/deposit/
git commit -m "feat(deposit): add withdraw tab to deposit modal

- Signature-based withdraw flow
- Shows trading wallet balance
- Destination address display
- Success/error states with Polygonscan link"
```

---

## Task 7: Final Polish and Cleanup

**Files:**
- Delete unused code from old TradingBalance.tsx if any remains
- Test the full flow manually

**Step 1: Verify all imports are correct**

Run: `npm run build --prefix frontend`
Expected: Build succeeds with no errors

**Step 2: Run dev server and test manually**

Run: `npm run dev --prefix frontend`

Test scenarios:
1. Click balance button → modal opens
2. Try to place bet with insufficient funds → modal opens with deficit
3. Click "Buy USDC" → AppKit OnRampProviders opens
4. Expand "Deposit from Polygon" → form works
5. Click "More options" → shows bridge options and manual deposit
6. Switch to Withdraw tab → form works
7. Close modal → state resets

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore(deposit): final cleanup and polish

Complete deposit UX redesign with:
- Polygon-first approach
- Smart adaptive UI
- AppKit onramp integration
- Bridge with warnings
- Withdraw functionality"
```

---

## Summary

| Task | Description | Key Changes |
|------|-------------|-------------|
| 1 | Extend context | Add pending bet state, fast polling |
| 2 | Update sidebar | Pass bet amount to context |
| 3 | Create modal structure | New DepositModal with states |
| 4 | Integrate modal | Simplify TradingBalance, add to App |
| 5 | Add More Options | Bridge and manual deposit |
| 6 | Add Withdraw | Signature-based withdraw flow |
| 7 | Polish | Final testing and cleanup |

**Total commits:** 7 incremental commits, each building on the previous.
