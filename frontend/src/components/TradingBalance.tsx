/**
 * TradingBalance - Displays the USDC balance of the embedded trading wallet
 *
 * Shows in the header with a "Deposit" button. Opens a smart modal that:
 * - Detects user's USDC balances across chains (Polygon, Base, Ethereum)
 * - Shows appropriate deposit options based on their situation
 * - Fetches Polymarket deposit addresses for cross-chain bridging
 */

import { useState, useEffect } from 'react';
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useBalance, useSwitchChain } from 'wagmi';
import { erc20Abi, parseUnits, formatUnits } from 'viem';
import { Wallet, Loader2, Copy, Check, ArrowRight, Clock, RefreshCw, Send } from 'lucide-react';
import { useUserProfile } from '../hooks/useUserProfile';
import { useAuth } from '../hooks/useAuth';
import { Dialog, DialogTitle, DialogDescription } from './ui/Dialog';
import { Input } from './ui/Input';
import { SUPPORTED_CHAINS } from '../lib/wagmi';

const USDC_DECIMALS = 6;
const POLYMARKET_BRIDGE_API = 'https://bridge.polymarket.com/deposit';

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
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'polygon' | 'bridge' | null>(null);

  // Deposit addresses state
  const [depositAddresses, setDepositAddresses] = useState<DepositAddresses | null>(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);

  // Bridge transfer state
  const [selectedBridgeChain, setSelectedBridgeChain] = useState<'base' | 'ethereum' | null>(null);
  const [bridgeAmount, setBridgeAmount] = useState('');

  // Chain switching
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

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
    query: { enabled: !!connectedAddress && isDepositOpen },
  });

  // USDC on Base (connected wallet)
  const { data: baseUsdcBalance } = useReadContract({
    address: SUPPORTED_CHAINS.base.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    chainId: SUPPORTED_CHAINS.base.id,
    query: { enabled: !!connectedAddress && isDepositOpen },
  });

  // USDC on Ethereum (connected wallet)
  const { data: ethereumUsdcBalance } = useReadContract({
    address: SUPPORTED_CHAINS.ethereum.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: connectedAddress ? [connectedAddress] : undefined,
    chainId: SUPPORTED_CHAINS.ethereum.id,
    query: { enabled: !!connectedAddress && isDepositOpen },
  });

  // POL balance for gas (connected wallet)
  const { data: polBalance } = useBalance({
    address: connectedAddress,
    chainId: SUPPORTED_CHAINS.polygon.id,
    query: { enabled: !!connectedAddress && isDepositOpen },
  });

  // ETH balance on Base for gas (connected wallet)
  const { data: baseEthBalance } = useBalance({
    address: connectedAddress,
    chainId: SUPPORTED_CHAINS.base.id,
    query: { enabled: !!connectedAddress && isDepositOpen },
  });

  // ETH balance on Ethereum for gas (connected wallet)
  const { data: ethereumEthBalance } = useBalance({
    address: connectedAddress,
    chainId: SUPPORTED_CHAINS.ethereum.id,
    query: { enabled: !!connectedAddress && isDepositOpen },
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
    setIsDepositOpen(false);
    setDepositAmount('');
    setSelectedMethod(null);
    setSelectedBridgeChain(null);
    setBridgeAmount('');
    reset();
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
        onClick={() => setIsDepositOpen(true)}
        className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted transition-colors"
        title={`Trading wallet: ${embeddedWalletAddress}`}
      >
        <Wallet className="h-4 w-4 text-primary" />
        <span className="font-medium">${formattedTradingBalance}</span>
        <span className="text-muted-foreground">USDC</span>
        <span className="text-xs text-primary font-medium">Deposit</span>
      </button>

      <Dialog open={isDepositOpen} onClose={handleClose}>
        <DialogTitle>Deposit USDC</DialogTitle>
        <DialogDescription>
          Fund your trading wallet to place bets on Polymarket.
        </DialogDescription>

        {/* Your balances section */}
        <div className="mb-4 rounded-md border border-border bg-muted/50 p-3">
          <h3 className="text-sm font-medium text-foreground mb-2">Your Wallet Balances</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Polygon:</span>
              <span className={parseFloat(polygonUsdc) > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                ${polygonUsdc} USDC
                {!hasPolForGas && parseFloat(polygonUsdc) > 0 && (
                  <span className="text-amber-500 ml-1">(no POL for gas)</span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base:</span>
              <span className={parseFloat(baseUsdc) > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                ${baseUsdc} USDC
                {!hasBaseEthForGas && parseFloat(baseUsdc) > 0 && (
                  <span className="text-amber-500 ml-1">(no ETH for gas)</span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ethereum:</span>
              <span className={parseFloat(ethereumUsdc) > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                ${ethereumUsdc} USDC
                {!hasEthereumEthForGas && parseFloat(ethereumUsdc) > 0 && (
                  <span className="text-amber-500 ml-1">(no ETH for gas)</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Deposit options */}
        <div className="space-y-3">
          {/* Option 1: Direct Polygon deposit */}
          <div
            className={`rounded-md border transition-colors ${
              selectedMethod === 'polygon'
                ? 'border-primary bg-primary/5'
                : canDepositDirect
                ? 'border-border hover:border-primary/50'
                : 'border-border opacity-50'
            }`}
          >
            <button
              onClick={() => setSelectedMethod(selectedMethod === 'polygon' ? null : 'polygon')}
              disabled={!canDepositDirect}
              className="w-full text-left p-3 disabled:cursor-not-allowed"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-primary" />
                    Instant Deposit
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Transfer from Polygon wallet (requires POL for gas)
                  </p>
                </div>
                {canDepositDirect ? (
                  <span className="text-xs text-green-500 font-medium">Available</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {parseFloat(polygonUsdc) > 0 ? 'Need POL for gas' : 'No USDC found on Polygon'}
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
                    Bridge Deposit (5-30 min)
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Send from any chain or exchange - auto-bridges to Polygon
                  </p>
                </div>
                {hasOtherChainUsdc && (
                  <span className="text-xs text-green-500 font-medium">
                    USDC found on {[
                      parseFloat(baseUsdc) > 0 && 'Base',
                      parseFloat(ethereumUsdc) > 0 && 'Ethereum'
                    ].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>
            </button>

            {/* Expanded content for Bridge deposit */}
            {selectedMethod === 'bridge' && (
              <div className="px-3 pb-3 pt-0 space-y-4 border-t border-border/50 mt-2">
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
                                <button
                                  onClick={() => setSelectedBridgeChain('base')}
                                  className={`w-full flex items-center justify-between rounded-md border border-border p-2 hover:border-primary/50 transition-colors ${!hasBaseEthForGas ? 'opacity-60' : ''}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                                      B
                                    </div>
                                    <div>
                                      <span className="text-sm font-medium">Base</span>
                                      {!hasBaseEthForGas && (
                                        <p className="text-xs text-amber-500">No ETH for gas</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">${baseUsdc} USDC</span>
                                    <Send className="h-4 w-4 text-primary" />
                                  </div>
                                </button>
                              )}
                              {parseFloat(ethereumUsdc) > 0 && (
                                <button
                                  onClick={() => setSelectedBridgeChain('ethereum')}
                                  className={`w-full flex items-center justify-between rounded-md border border-border p-2 hover:border-primary/50 transition-colors ${!hasEthereumEthForGas ? 'opacity-60' : ''}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-white text-xs font-bold">
                                      Ξ
                                    </div>
                                    <div>
                                      <span className="text-sm font-medium">Ethereum</span>
                                      {!hasEthereumEthForGas && (
                                        <p className="text-xs text-amber-500">No ETH for gas</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">${ethereumUsdc} USDC</span>
                                    <Send className="h-4 w-4 text-primary" />
                                  </div>
                                </button>
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

                              {!selectedChainHasGas() && (
                                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-sm text-amber-600">
                                  You need ETH on {selectedBridgeChain === 'base' ? 'Base' : 'Ethereum'} to pay for gas fees.
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
                        Send from {hasOtherChainUsdc ? 'another wallet or exchange' : 'any wallet or exchange'}:
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
      </Dialog>
    </>
  );
}
