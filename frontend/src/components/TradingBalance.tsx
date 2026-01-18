/**
 * TradingBalance - Displays the USDC balance of the embedded trading wallet
 *
 * Shows in the header with a "Deposit" button. Opens a smart modal that:
 * - Detects user's USDC balances across chains (Polygon, Base, Ethereum)
 * - Shows appropriate deposit options based on their situation
 * - Fetches Polymarket deposit addresses for cross-chain bridging
 */

import { useState, useEffect } from 'react';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useBalance, useSwitchChain, useSignMessage } from 'wagmi';
import { erc20Abi, parseUnits, formatUnits } from 'viem';
import { Wallet, Loader2, Copy, Check, ArrowRight, Clock, RefreshCw, Send, CheckCircle2, AlertCircle } from 'lucide-react';
import { useUserProfile } from '../hooks/useUserProfile';
import { useAuth } from '../hooks/useAuth';
import { Dialog, DialogTitle, DialogDescription } from './ui/Dialog';
import { Input } from './ui/Input';
import { SUPPORTED_CHAINS } from '../lib/wagmi';

const USDC_DECIMALS = 6;
const POLYMARKET_BRIDGE_API = 'https://bridge.polymarket.com/deposit';
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/**
 * Build the withdraw message for signing (must match backend)
 */
function buildWithdrawMessage(amount: string, nonce: string): string {
  return `Withdraw ${amount} USDC from PolyAcca\n\nNonce: ${nonce}`;
}

// Types for deposit addresses
interface DepositAddresses {
  evm: string;
  svm: string;
  btc: string;
}

// Helper to format balance
function formatBalance(balance: bigint | undefined): string {
  if (!balance) return '0.00';
  return Number(formatUnits(balance, USDC_DECIMALS)).toFixed(2);
}

// Helper to truncate address for display
function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}

export function TradingBalance() {
  const { isAuthenticated } = useAuth();
  const { address: connectedAddress } = useAccount();
  const { embeddedWalletAddress, isLoading: profileLoading } = useUserProfile();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'polygon' | 'bridge' | null>(null);

  // Deposit addresses state
  const [depositAddresses, setDepositAddresses] = useState<DepositAddresses | null>(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  // Bridge transfer state
  const [selectedBridgeChain, setSelectedBridgeChain] = useState<'base' | 'ethereum' | null>(null);
  const [bridgeAmount, setBridgeAmount] = useState('');

  // Withdraw state (signature-based flow)
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawSuccess, setWithdrawSuccess] = useState<string | null>(null); // tx hash

  // Chain switching
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  // Message signing for withdraw
  const { signMessageAsync } = useSignMessage();

  // ============================================================================
  // Embedded wallet balance (trading balance)
  // ============================================================================
  const { data: tradingBalance, isLoading: tradingBalanceLoading, refetch: refetchTradingBalance } = useReadContract({
    address: SUPPORTED_CHAINS.polygon.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: embeddedWalletAddress ? [embeddedWalletAddress as `0x${string}`] : undefined,
    chainId: SUPPORTED_CHAINS.polygon.id,
    query: {
      enabled: !!embeddedWalletAddress,
      refetchInterval: 30000,
    },
  });

  // ============================================================================
  // Connected wallet balances (source for deposits)
  // ============================================================================

  // USDC on Polygon (connected wallet)
  const { data: polygonUsdcBalance } = useReadContract({
    address: SUPPORTED_CHAINS.polygon.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    chainId: SUPPORTED_CHAINS.polygon.id,
    query: { enabled: !!connectedAddress && isModalOpen },
  });

  // USDC on Base (connected wallet)
  const { data: baseUsdcBalance } = useReadContract({
    address: SUPPORTED_CHAINS.base.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    chainId: SUPPORTED_CHAINS.base.id,
    query: { enabled: !!connectedAddress && isModalOpen },
  });

  // USDC on Ethereum (connected wallet)
  const { data: ethereumUsdcBalance } = useReadContract({
    address: SUPPORTED_CHAINS.ethereum.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    chainId: SUPPORTED_CHAINS.ethereum.id,
    query: { enabled: !!connectedAddress && isModalOpen },
  });

  // POL balance for gas (connected wallet)
  const { data: polBalance } = useBalance({
    address: connectedAddress,
    chainId: SUPPORTED_CHAINS.polygon.id,
    query: { enabled: !!connectedAddress && isModalOpen },
  });

  // ETH balance on Base for gas (connected wallet)
  const { data: baseEthBalance } = useBalance({
    address: connectedAddress,
    chainId: SUPPORTED_CHAINS.base.id,
    query: { enabled: !!connectedAddress && isModalOpen },
  });

  // ETH balance on Ethereum for gas (connected wallet)
  const { data: ethereumEthBalance } = useBalance({
    address: connectedAddress,
    chainId: SUPPORTED_CHAINS.ethereum.id,
    query: { enabled: !!connectedAddress && isModalOpen },
  });

  // ============================================================================
  // Fetch deposit addresses when bridge method is selected
  // ============================================================================
  useEffect(() => {
    async function fetchDepositAddresses() {
      if (selectedMethod !== 'bridge' || !embeddedWalletAddress || depositAddresses) {
        return;
      }

      setIsLoadingAddresses(true);
      setAddressError(null);

      try {
        const response = await fetch(POLYMARKET_BRIDGE_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: embeddedWalletAddress }),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch deposit addresses: ${response.status}`);
        }

        const data = await response.json();
        setDepositAddresses(data.address);
      } catch (error) {
        console.error('Error fetching deposit addresses:', error);
        setAddressError(error instanceof Error ? error.message : 'Failed to fetch deposit addresses');
      } finally {
        setIsLoadingAddresses(false);
      }
    }

    fetchDepositAddresses();
  }, [selectedMethod, embeddedWalletAddress, depositAddresses]);

  // ============================================================================
  // Direct deposit transaction (Polygon -> Embedded)
  // ============================================================================
  const { writeContract, data: txHash, isPending: isWritePending, reset } = useWriteContract();

  const { isLoading: isTxPending, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Refetch balance after successful transaction
  if (isTxSuccess) {
    refetchTradingBalance();
  }

  // ============================================================================
  // Derived state
  // ============================================================================
  const polygonUsdc = formatBalance(polygonUsdcBalance);
  const baseUsdc = formatBalance(baseUsdcBalance);
  const ethereumUsdc = formatBalance(ethereumUsdcBalance);
  const hasPolForGas = polBalance && polBalance.value > 0n;
  const hasBaseEthForGas = baseEthBalance && baseEthBalance.value > 0n;
  const hasEthereumEthForGas = ethereumEthBalance && ethereumEthBalance.value > 0n;
  const canDepositDirect = parseFloat(polygonUsdc) > 0 && hasPolForGas;
  const hasOtherChainUsdc = parseFloat(baseUsdc) > 0 || parseFloat(ethereumUsdc) > 0;

  // Check if selected bridge chain has gas
  const selectedChainHasGas = () => {
    if (selectedBridgeChain === 'base') return hasBaseEthForGas;
    if (selectedBridgeChain === 'ethereum') return hasEthereumEthForGas;
    return true;
  };

  // Get the max amount for the selected bridge chain
  const getSelectedChainBalance = () => {
    if (selectedBridgeChain === 'base') return baseUsdc;
    if (selectedBridgeChain === 'ethereum') return ethereumUsdc;
    return '0';
  };

  const getSelectedChainInfo = () => {
    if (selectedBridgeChain === 'base') return SUPPORTED_CHAINS.base;
    if (selectedBridgeChain === 'ethereum') return SUPPORTED_CHAINS.ethereum;
    return null;
  };

  // ============================================================================
  // Handlers
  // ============================================================================

  // Don't show if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Show loading state
  if (profileLoading || (embeddedWalletAddress && tradingBalanceLoading)) {
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

  const formattedTradingBalance = formatBalance(tradingBalance);

  const handleCopyAddress = async (address: string, label: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(label);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleDirectDeposit = () => {
    if (!depositAmount || !embeddedWalletAddress) return;

    const amount = parseUnits(depositAmount, USDC_DECIMALS);

    writeContract({
      address: SUPPORTED_CHAINS.polygon.usdc,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [embeddedWalletAddress as `0x${string}`, amount],
      chainId: SUPPORTED_CHAINS.polygon.id,
    });
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setActiveTab('deposit');
    setDepositAmount('');
    setWithdrawAmount('');
    setSelectedMethod(null);
    setSelectedBridgeChain(null);
    setBridgeAmount('');
    setWithdrawError(null);
    setWithdrawSuccess(null);
    reset();
  };

  /**
   * Handle withdraw with signature-based authentication
   * 1. Get nonce from API
   * 2. Sign the withdraw message
   * 3. Call withdraw endpoint with signature
   */
  const handleWithdraw = async () => {
    if (!withdrawAmount || !connectedAddress || !embeddedWalletAddress) return;

    setIsWithdrawing(true);
    setWithdrawError(null);
    setWithdrawSuccess(null);

    try {
      // Step 1: Get a fresh nonce
      const nonceRes = await fetch(`${API_URL}/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: connectedAddress }),
      });

      if (!nonceRes.ok) {
        throw new Error('Failed to get nonce');
      }

      const nonceData = await nonceRes.json();
      if (!nonceData.success) {
        throw new Error(nonceData.error || 'Failed to get nonce');
      }

      // Step 2: Sign the withdraw message
      // Format amount to 2 decimal places to match what user sees
      const formattedAmount = parseFloat(withdrawAmount).toFixed(2);
      const message = buildWithdrawMessage(formattedAmount, nonceData.data.nonce);

      const signature = await signMessageAsync({ message });

      // Step 3: Call withdraw endpoint
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

      // Success!
      setWithdrawSuccess(withdrawData.data.txHash);
      setWithdrawAmount('');

      // Refetch balance after a short delay
      setTimeout(() => refetchTradingBalance(), 3000);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Withdraw failed';
      setWithdrawError(errorMessage);

      // If user rejected signature, don't show as error
      if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
        setWithdrawError('Signature rejected');
      }
    } finally {
      setIsWithdrawing(false);
    }
  };

  const handleBridgeTransfer = async () => {
    if (!bridgeAmount || !depositAddresses?.evm || !selectedBridgeChain) return;

    const chainInfo = getSelectedChainInfo();
    if (!chainInfo) return;

    const amount = parseUnits(bridgeAmount, USDC_DECIMALS);

    // Switch chain if needed - the wallet will prompt the user
    if (connectedAddress) {
      try {
        // Switch to the selected chain first
        switchChain({ chainId: chainInfo.id });
      } catch {
        // If switch fails, the wallet UI handles the error
        return;
      }
    }

    // Execute the transfer to the Polymarket deposit address
    writeContract({
      address: chainInfo.usdc,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [depositAddresses.evm as `0x${string}`, amount],
      chainId: chainInfo.id,
    });
  };

  const handleRetryAddresses = () => {
    setDepositAddresses(null);
    setAddressError(null);
  };

  const isDepositing = isWritePending || isTxPending || isSwitchingChain;

  // Render a deposit address row
  const renderAddressRow = (label: string, chain: string, address: string | undefined) => {
    if (!address) return null;
    const copyKey = `${label}-${chain}`;
    return (
      <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
        <div>
          <div className="text-sm font-medium text-foreground">{label}</div>
          <code className="text-xs text-muted-foreground font-mono">
            {truncateAddress(address)}
          </code>
        </div>
        <button
          onClick={() => handleCopyAddress(address, copyKey)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-1"
        >
          {copiedAddress === copyKey ? (
            <>
              <Check className="h-3 w-3 text-green-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
    );
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border hover:bg-muted transition-colors"
        title={`Trading wallet: ${embeddedWalletAddress}`}
      >
        <img
          src="https://assets.coingecko.com/coins/images/6319/small/usdc.png"
          alt="USDC"
          className="h-5 w-5 flex-shrink-0 rounded-full"
        />
        <span className="text-sm font-semibold">{formattedTradingBalance}</span>
        <Wallet className="h-4 w-4 text-primary flex-shrink-0" />
      </button>

      <Dialog open={isModalOpen} onClose={handleClose}>
        <DialogTitle>Trading Wallet</DialogTitle>
        <DialogDescription>
          Manage your trading wallet funds on Polygon.
        </DialogDescription>

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

        {/* Deposit Tab Content */}
        {activeTab === 'deposit' && (
          <>
            {/* Status-based balances section */}
            <div className="mb-4 rounded-md border border-border bg-muted/50 p-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Your USDC Balances</h3>
          <div className="space-y-2 text-sm">
            {/* Polygon */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-white text-[10px] font-bold">P</div>
                <span className="font-medium">Polygon</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={parseFloat(polygonUsdc) > 0 ? 'font-medium' : 'text-muted-foreground'}>${polygonUsdc}</span>
                {parseFloat(polygonUsdc) > 0 && hasPolForGas ? (
                  <span className="flex items-center gap-1 text-xs text-green-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Ready
                  </span>
                ) : parseFloat(polygonUsdc) > 0 ? (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Need POL
                  </span>
                ) : null}
              </div>
            </div>

            {/* Base */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">B</div>
                <span className="font-medium">Base</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={parseFloat(baseUsdc) > 0 ? 'font-medium' : 'text-muted-foreground'}>${baseUsdc}</span>
                {parseFloat(baseUsdc) > 0 && hasBaseEthForGas ? (
                  <span className="flex items-center gap-1 text-xs text-green-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Can bridge
                  </span>
                ) : parseFloat(baseUsdc) > 0 ? (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Need ETH
                  </span>
                ) : null}
              </div>
            </div>

            {/* Ethereum */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-white text-[10px] font-bold">Ξ</div>
                <span className="font-medium">Ethereum</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={parseFloat(ethereumUsdc) > 0 ? 'font-medium' : 'text-muted-foreground'}>${ethereumUsdc}</span>
                {parseFloat(ethereumUsdc) > 0 && hasEthereumEthForGas ? (
                  <span className="flex items-center gap-1 text-xs text-green-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Can bridge
                  </span>
                ) : parseFloat(ethereumUsdc) > 0 ? (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Need ETH
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Deposit options header */}
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Deposit Options</h3>

        {/* Deposit options */}
        <div className="space-y-3">
          {/* Option 1: Direct Polygon deposit */}
          <div
            className={`rounded-md border transition-colors ${
              selectedMethod === 'polygon'
                ? 'border-primary bg-primary/5'
                : canDepositDirect
                ? 'border-green-500/50 hover:border-green-500'
                : 'border-border'
            }`}
          >
            <button
              onClick={() => canDepositDirect && setSelectedMethod(selectedMethod === 'polygon' ? null : 'polygon')}
              className={`w-full text-left p-3 ${!canDepositDirect ? 'cursor-default' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-primary" />
                    Instant Deposit from Polygon
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Direct transfer, no bridging required
                  </p>
                </div>
                {canDepositDirect ? (
                  <span className="flex items-center gap-1 text-xs text-green-500 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Ready
                  </span>
                ) : parseFloat(polygonUsdc) > 0 ? (
                  <span className="flex items-center gap-1 text-xs text-amber-500">
                    <AlertCircle className="h-4 w-4" />
                    Need POL for gas
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No USDC on Polygon
                  </span>
                )}
              </div>
            </button>

            {/* Expanded content for Polygon deposit */}
            {selectedMethod === 'polygon' && canDepositDirect && (
              <div className="px-3 pb-3 pt-0 space-y-4 border-t border-border/50 mt-2">
                <div className="pt-3">
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Amount (USDC)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
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

                {isTxSuccess && (
                  <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-500">
                    Deposit successful! Your balance will update shortly.
                  </div>
                )}

                <button
                  onClick={handleDirectDeposit}
                  disabled={!depositAmount || parseFloat(depositAmount) <= 0 || isDepositing}
                  className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDepositing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {isTxPending ? 'Confirming...' : 'Approve in wallet...'}
                    </>
                  ) : (
                    <>
                      Deposit from Polygon
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Option 2: Bridge from other chains */}
          <div
            className={`rounded-md border transition-colors ${
              selectedMethod === 'bridge'
                ? 'border-primary bg-primary/5'
                : hasOtherChainUsdc && (hasBaseEthForGas || hasEthereumEthForGas)
                ? 'border-green-500/50 hover:border-green-500'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <button
              onClick={() => setSelectedMethod(selectedMethod === 'bridge' ? null : 'bridge')}
              className="w-full text-left p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Bridge to Polygon (5-30 min)
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Send USDC from Base, Ethereum, or any exchange
                  </p>
                </div>
                <div className="text-right">
                  {hasOtherChainUsdc ? (
                    <>
                      <p className="text-xs font-medium">
                        ${(parseFloat(baseUsdc) + parseFloat(ethereumUsdc)).toFixed(2)} available
                      </p>
                      {(parseFloat(baseUsdc) > 0 && hasBaseEthForGas) || (parseFloat(ethereumUsdc) > 0 && hasEthereumEthForGas) ? (
                        <span className="flex items-center justify-end gap-1 text-xs text-green-500 mt-0.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Ready to bridge
                        </span>
                      ) : (
                        <span className="flex items-center justify-end gap-1 text-xs text-amber-500 mt-0.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Need ETH for gas
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      No USDC on other chains
                    </span>
                  )}
                </div>
              </div>
            </button>

            {/* Expanded content for Bridge deposit */}
            {selectedMethod === 'bridge' && (
              <div className="px-3 pb-3 pt-0 space-y-4 border-t border-border/50 mt-2 max-h-[calc(90vh-400px)] overflow-y-auto">
                {/* Loading state */}
                {isLoadingAddresses && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="ml-2 text-sm text-muted-foreground">Fetching deposit addresses...</span>
                  </div>
                )}

                {/* Error state */}
                {addressError && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 mt-3">
                    <p className="text-sm text-destructive mb-2">{addressError}</p>
                    <button
                      onClick={handleRetryAddresses}
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </button>
                  </div>
                )}

                {/* Bridge transfer options */}
                {depositAddresses && !isLoadingAddresses && (
                  <div className="pt-3 space-y-4">
                    {/* Combined deposit options container */}
                    <div className="rounded-md border border-border bg-background p-3">
                      {/* Send from connected wallet section */}
                      {hasOtherChainUsdc && (
                        <>
                          <h4 className="text-sm font-medium text-foreground mb-3">
                            Send from your connected wallet:
                          </h4>

                          {/* Chain selection buttons */}
                          {!selectedBridgeChain ? (
                            <div className="space-y-2">
                              {parseFloat(baseUsdc) > 0 && (
                                <div className="w-full rounded-md border border-border p-2">
                                  <button
                                    onClick={() => setSelectedBridgeChain('base')}
                                    className={`w-full flex items-center justify-between hover:opacity-80 transition-colors ${!hasBaseEthForGas ? 'opacity-60' : ''}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                        B
                                      </div>
                                      <span className="text-sm font-medium">Base</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-muted-foreground">${baseUsdc} USDC</span>
                                      <Send className="h-4 w-4 text-primary" />
                                    </div>
                                  </button>
                                  {!hasBaseEthForGas && (
                                    <div className="mt-2">
                                      <span className="text-xs text-amber-500 inline-flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" />
                                        Need ETH for gas
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                              {parseFloat(ethereumUsdc) > 0 && (
                                <div className="w-full rounded-md border border-border p-2">
                                  <button
                                    onClick={() => setSelectedBridgeChain('ethereum')}
                                    className={`w-full flex items-center justify-between hover:opacity-80 transition-colors ${!hasEthereumEthForGas ? 'opacity-60' : ''}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold">
                                        Ξ
                                      </div>
                                      <span className="text-sm font-medium">Ethereum</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-muted-foreground">${ethereumUsdc} USDC</span>
                                      <Send className="h-4 w-4 text-primary" />
                                    </div>
                                  </button>
                                  {!hasEthereumEthForGas && (
                                    <div className="mt-2">
                                      <span className="text-xs text-amber-500 inline-flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" />
                                        Need ETH for gas
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            /* Transfer form for selected chain */
                            <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className={`w-6 h-6 rounded-full ${selectedBridgeChain === 'base' ? 'bg-blue-500' : 'bg-slate-700'} flex items-center justify-center text-white text-xs font-bold`}>
                                    {selectedBridgeChain === 'base' ? 'B' : 'Ξ'}
                                  </div>
                                  <span className="text-sm font-medium">
                                    {selectedBridgeChain === 'base' ? 'Base' : 'Ethereum'}
                                  </span>
                                </div>
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

                              <div>
                                <label className="block text-sm font-medium text-foreground mb-1">
                                  Amount (USDC)
                                </label>
                                <div className="flex gap-2">
                                  <Input
                                    type="number"
                                    placeholder="0.00"
                                    value={bridgeAmount}
                                    onChange={(e) => setBridgeAmount(e.target.value)}
                                    min="0"
                                    step="0.01"
                                    max={getSelectedChainBalance()}
                                    disabled={isDepositing}
                                  />
                                  <button
                                    onClick={() => setBridgeAmount(getSelectedChainBalance())}
                                    className="px-3 py-2 text-xs border border-border rounded-md hover:bg-muted"
                                  >
                                    Max
                                  </button>
                                </div>
                              </div>

                              {!selectedChainHasGas() && selectedBridgeChain && (
                                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                                  <span className="text-sm text-amber-600 inline-flex items-center gap-1">
                                    <AlertCircle className="h-4 w-4" />
                                    You need ETH on {selectedBridgeChain === 'base' ? 'Base' : 'Ethereum'} for gas.
                                  </span>
                                </div>
                              )}

                              {isTxSuccess && (
                                <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-500">
                                  Transfer sent! Funds will arrive in 5-30 minutes.
                                </div>
                              )}

                              <button
                                onClick={handleBridgeTransfer}
                                disabled={!bridgeAmount || parseFloat(bridgeAmount) <= 0 || isDepositing || !selectedChainHasGas()}
                                className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isDepositing ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {isSwitchingChain ? 'Switching network...' : isTxPending ? 'Confirming...' : 'Approve in wallet...'}
                                  </>
                                ) : (
                                  <>
                                    <Send className="h-4 w-4" />
                                    Send to Polymarket Bridge
                                  </>
                                )}
                              </button>
                            </div>
                          )}

                          {/* Or divider */}
                          <div className="flex items-center gap-3 my-4">
                            <div className="flex-1 border-t border-border" />
                            <span className="text-xs text-muted-foreground">or</span>
                            <div className="flex-1 border-t border-border" />
                          </div>
                        </>
                      )}

                      {/* Manual deposit addresses section */}
                      <h4 className="text-sm font-medium text-foreground mb-3">
                        Send USDC to your trading account via {hasOtherChainUsdc ? 'another wallet or exchange' : 'any wallet or exchange'}:
                      </h4>
                      <div className="divide-y divide-border">
                        {renderAddressRow('EVM', 'Ethereum, Base, Arbitrum, etc.', depositAddresses.evm)}
                        {renderAddressRow('Solana', 'SOL network', depositAddresses.svm)}
                        {renderAddressRow('Bitcoin', 'BTC network', depositAddresses.btc)}
                      </div>
                    </div>

                    <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
                      <p className="text-xs text-amber-600">
                        <strong>Important:</strong> Only send supported tokens (USDC, USDT, ETH, etc.).
                        Funds will be automatically converted to USDC and deposited to your trading wallet.
                        This may take 5-30 minutes.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
          </>
        )}

        {/* Withdraw Tab Content */}
        {activeTab === 'withdraw' && (
          <>
            {/* Trading wallet balance */}
            <div className="mb-4 rounded-md border border-border bg-muted/50 p-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Trading Wallet Balance</h3>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img
                    src="https://assets.coingecko.com/coins/images/6319/small/usdc.png"
                    alt="USDC"
                    className="h-5 w-5 rounded-full"
                  />
                  <span className="font-medium">USDC</span>
                </div>
                <span className="text-lg font-semibold">${formattedTradingBalance}</span>
              </div>
            </div>

            {/* Withdraw form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Withdraw Amount (USDC)
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    min="0"
                    step="0.01"
                    max={formattedTradingBalance}
                    disabled={isWithdrawing}
                  />
                  <button
                    onClick={() => setWithdrawAmount(formattedTradingBalance)}
                    className="px-3 py-2 text-xs border border-border rounded-md hover:bg-muted"
                    disabled={isWithdrawing}
                  >
                    Max
                  </button>
                </div>
              </div>

              <div className="rounded-md bg-muted/50 border border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Funds will be sent to your connected wallet on Polygon:
                </p>
                <code className="text-xs font-mono text-foreground mt-1 block">
                  {connectedAddress ? truncateAddress(connectedAddress) : 'No wallet connected'}
                </code>
              </div>

              {withdrawError && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  {withdrawError}
                </div>
              )}

              {withdrawSuccess && (
                <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-500">
                  Withdrawal successful! Your balance will update shortly.
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

              <button
                onClick={handleWithdraw}
                disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > parseFloat(formattedTradingBalance) || isWithdrawing || !connectedAddress}
                className="w-full flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isWithdrawing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Withdraw to Wallet
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
