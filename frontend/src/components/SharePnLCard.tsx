/**
 * SharePnLCard - Shareable PnL card component for accumulators
 * Styled similar to Coin98/trading PnL share cards
 */

import { useRef, useState } from "react";
import { Dialog, DialogTitle } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { X, Download, Loader2 } from "lucide-react";
import type { UserChainSummary } from "../types/chain";
import logoImage from "../assets/coins_cropped.png";

// Social share icons as inline SVGs for cleaner code
const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

interface SharePnLCardProps {
  chain: UserChainSummary;
  chainName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function SharePnLCard({ chain, chainName, isOpen, onClose }: SharePnLCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Calculate PnL
  const initialStake = parseFloat(chain.initialStake);
  const currentValue = parseFloat(chain.currentValue);
  const pnlValue = currentValue - initialStake;
  const pnlPercent = initialStake > 0 ? ((currentValue - initialStake) / initialStake) * 100 : 0;
  const isProfit = pnlValue >= 0;

  // Format the share text
  const getShareText = () => {
    const status = chain.status === 'WON' ? 'WON' : chain.status === 'LOST' ? 'LOST' : 'ACTIVE';
    const pnlDisplay = isProfit ? `+${pnlPercent.toFixed(1)}%` : `${pnlPercent.toFixed(1)}%`;
    const name = chainName || `${chain.totalLegs}-leg Acca`;

    return `${status === 'WON' ? '🏆' : status === 'LOST' ? '❌' : '🔥'} ${name}\n\n` +
      `📊 PnL: ${pnlDisplay}\n` +
      `💰 Stake: $${initialStake.toFixed(2)}\n` +
      `💵 ${status === 'WON' ? 'Payout' : 'Value'}: $${currentValue.toFixed(2)}\n\n` +
      `Build your own accumulator on @PolyAcca\n` +
      `${window.location.origin}`;
  };

  const shareToTelegram = () => {
    const text = encodeURIComponent(getShareText());
    window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${text}`, '_blank');
  };

  const shareToX = () => {
    const text = encodeURIComponent(getShareText());
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  const downloadAsImage = async () => {
    if (!cardRef.current) return;

    setIsGenerating(true);
    try {
      // Dynamically import html-to-image
      const { toPng } = await import('html-to-image');
      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#0a0a0a',
      });

      const link = document.createElement('a');
      link.download = `polyacca-pnl-${chain.chainId.slice(0, 8)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to generate image:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <DialogTitle>Share Your PnL</DialogTitle>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* PnL Card Preview */}
      <div
        ref={cardRef}
        className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-[#1a1a2e] to-[#0f0f1a] p-6 mb-6"
      >
        {/* Decorative elements */}
        <div className="absolute top-4 right-4 opacity-20">
          <div className="w-24 h-24 rounded-full bg-[var(--color-gold)] blur-3xl" />
        </div>
        <div className="absolute -bottom-8 -right-8 opacity-10">
          <div className="w-32 h-32 rounded-full bg-[var(--primary)] blur-3xl" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <img src={logoImage} alt="PolyAcca" className="w-10 h-10" />
            <div>
              <span className="text-lg font-bold text-white">
                {chainName || `${chain.totalLegs}-Leg Acca`}
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  chain.status === 'WON'
                    ? 'bg-[var(--color-success)]/20 text-[var(--color-success)]'
                    : chain.status === 'LOST'
                    ? 'bg-[var(--color-error)]/20 text-[var(--color-error)]'
                    : 'bg-[var(--color-gold)]/20 text-[var(--color-gold)]'
                }`}>
                  {chain.status === 'WON' ? 'WON' : chain.status === 'LOST' ? 'LOST' : `${chain.completedLegs}/${chain.totalLegs} Legs`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* PnL Display */}
        <div className="mb-6 relative z-10">
          <div className={`text-5xl font-bold font-mono ${
            isProfit ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
          }`}>
            {isProfit ? '+' : ''}{pnlPercent.toFixed(1)}%
            <span className="text-2xl ml-2">{isProfit ? '↑' : '↓'}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-6 relative z-10">
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide">Stake</span>
            <div className="text-xl font-mono font-bold text-white mt-1">
              ${initialStake.toFixed(2)}
            </div>
          </div>
          <div>
            <span className="text-xs text-gray-400 uppercase tracking-wide">
              {chain.status === 'WON' ? 'Payout' : 'Current Value'}
            </span>
            <div className={`text-xl font-mono font-bold mt-1 ${
              isProfit ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'
            }`}>
              ${currentValue.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-6 relative z-10">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                chain.status === 'WON'
                  ? 'bg-[var(--color-success)]'
                  : chain.status === 'LOST'
                  ? 'bg-[var(--color-error)]'
                  : 'bg-gradient-to-r from-[var(--color-gold)] to-[var(--color-gold-bright)]'
              }`}
              style={{ width: `${(chain.completedLegs / chain.totalLegs) * 100}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/10 relative z-10">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Powered by</span>
            <span className="text-sm font-bold text-[var(--color-gold)]">POLYACCA</span>
          </div>
        </div>
      </div>

      {/* Share Buttons */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <Button
            onClick={shareToTelegram}
            className="flex-1 bg-[#0088cc] hover:bg-[#0088cc]/80 text-white"
          >
            <TelegramIcon />
            <span className="ml-2">Telegram</span>
          </Button>
          <Button
            onClick={shareToX}
            className="flex-1 bg-black hover:bg-black/80 text-white border border-white/20"
          >
            <XIcon />
            <span className="ml-2">X (Twitter)</span>
          </Button>
        </div>
        <Button
          variant="outline"
          onClick={downloadAsImage}
          disabled={isGenerating}
          className="w-full"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Download Image
            </>
          )}
        </Button>
      </div>
    </Dialog>
  );
}
