/**
 * MoreOptions - Collapsed section for bridge and manual deposit
 * Shows other chain balances with warnings about gas fees
 */

import { useState, useEffect } from 'react';
import { useReadContract, useWriteContract, useAccount, useBalance, useSwitchChain } from 'wagmi';
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
  safeWalletAddress: string | undefined;
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
        if (!response.ok) {
          console.error(`Deposit address API error: ${response.status}`);
          return;
        }
        const data = await response.json();
        if (!data?.address?.evm) {
          console.error('Invalid deposit address response format');
          return;
        }
        setDepositAddresses(data.address);
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
    } catch (error) {
      console.error('Failed to switch chain:', error);
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
                      E
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
