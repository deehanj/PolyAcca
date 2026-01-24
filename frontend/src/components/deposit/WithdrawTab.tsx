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
      let nonceData;
      try {
        nonceData = await nonceRes.json();
      } catch {
        throw new Error('Invalid response from server');
      }
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

      let withdrawData;
      try {
        withdrawData = await withdrawRes.json();
      } catch {
        throw new Error('Invalid response from server');
      }
      if (!withdrawRes.ok || !withdrawData.success) {
        throw new Error(withdrawData.error || 'Withdraw failed');
      }

      setWithdrawSuccess(withdrawData.data.txHash);
      setWithdrawAmount('');
      // Refetch immediately and again after a short delay to catch the update
      refetchBalance();
      setTimeout(() => refetchBalance(), 2000);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Withdraw failed';
      // Check for common wallet rejection patterns
      const isRejection = errorMessage.toLowerCase().includes('rejected') ||
                          errorMessage.toLowerCase().includes('denied') ||
                          errorMessage.toLowerCase().includes('user rejected') ||
                          errorMessage.toLowerCase().includes('cancelled') ||
                          (err as any)?.code === 4001; // EIP-1193 user rejected
      if (isRejection) {
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
