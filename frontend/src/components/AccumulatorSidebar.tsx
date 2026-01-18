import { useState, forwardRef, useEffect, useRef } from "react";
import {
  useAccumulator,
  type AccumulatorBet,
} from "../context/AccumulatorContext";
import { useAuth } from "../hooks/useAuth";
import type { Market } from "./MarketCard";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { AnimatedNumber } from "./ui/AnimatedNumber";
import { triggerConfetti, triggerMoneyRain } from "../lib/confetti";
import { Zap, Trash2, Trophy, ChevronDown, X } from "lucide-react";
import { AccaModal } from "./AccaModal";

const API_URL = import.meta.env.VITE_API_URL || "";

export const AccumulatorSidebar = forwardRef<HTMLDivElement>(
  function AccumulatorSidebar(_props, ref) {
    const { bets, addBet, removeBet, clearBets, totalOdds, potentialPayout, getLegsForApi } =
      useAccumulator();
    const { isAuthenticated, isConnected, authenticate, getAuthHeaders } = useAuth();
    const [stake, setStake] = useState<string>("10");
    const [isDragOver, setIsDragOver] = useState(false);
    const [showSpeedLines, setShowSpeedLines] = useState(false);
    const [multiplierPop, setMultiplierPop] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const prevOddsRef = useRef<number>(1);

    // Modal state for post-placement customization
    const [modalChainId, setModalChainId] = useState<string | null>(null);

  const stakeNum = parseFloat(stake) || 0;
  const payout = potentialPayout(stakeNum);

  // Trigger speed boost effects when bets are added
  useEffect(() => {
    if (bets.length > 0) {
      // Show speed lines when bet is added
      setShowSpeedLines(true);
      const speedTimeout = setTimeout(() => setShowSpeedLines(false), 400);

      // Trigger multiplier pop if odds changed significantly
      const oddsDifference = Math.abs(totalOdds - prevOddsRef.current);
      if (oddsDifference > 0.5) {
        setMultiplierPop(true);
        const popTimeout = setTimeout(() => setMultiplierPop(false), 300);
        return () => {
          clearTimeout(speedTimeout);
          clearTimeout(popTimeout);
        };
      }

      prevOddsRef.current = totalOdds;
      return () => clearTimeout(speedTimeout);
    }
    prevOddsRef.current = 1;
  }, [bets.length, totalOdds]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const { market, selection } = data as {
        market: Market;
        selection: "yes" | "no";
      };
      addBet(market, selection);
      setIsMobileOpen(true); // Open on drop for mobile
    } catch (err) {
      console.error("Failed to parse drop data", err);
    }
  };

  const handlePlaceBet = async () => {
    setSubmitError(null);

    // Check if connected
    if (!isConnected) {
      setSubmitError("Please connect your wallet first");
      return;
    }

    // Authenticate if needed
    if (!isAuthenticated) {
      try {
        await authenticate();
      } catch {
        setSubmitError("Authentication failed");
        return;
      }
    }

    // Validate stake
    const stakeAmount = parseFloat(stake);
    if (isNaN(stakeAmount) || stakeAmount <= 0) {
      setSubmitError("Please enter a valid stake amount");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL}/chains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          legs: getLegsForApi(),
          initialStake: stakeAmount.toFixed(2),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to place bet");
      }

      // Success - clear bets and show celebration
      triggerConfetti();
      if (parseFloat(stake) >= 100) {
        setTimeout(triggerMoneyRain, 500); // Double celebration for big bets
      }

      // Get chainId from response and open modal
      const chainId = data.data?.chainDefinition?.chainId || data.data?.chainId;
      clearBets();
      setStake("10");
      setIsMobileOpen(false);

      // Open the customization/share modal
      if (chainId) {
        setModalChainId(chainId);
      }

      console.log("Chain created successfully:", data.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to place bet";
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const MobileFloatingButton = () => (
    <div className="fixed bottom-0 left-0 w-full p-4 md:hidden z-50 pointer-events-none">
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className={`
          w-full pointer-events-auto bg-[var(--background-elevated)]/90 backdrop-blur-xl border border-[var(--border)] 
          shadow-lg rounded-xl p-4 flex items-center justify-between transition-all duration-300
          ${bets.length > 0 ? "border-[var(--color-gold)]/50 shadow-glow-gold-sm" : ""}
        `}
      >
        <div className="flex items-center gap-3">
          <div className="bg-[var(--color-gold)]/10 p-2 rounded-lg">
            <Zap className="h-5 w-5 text-[var(--color-gold)]" />
          </div>
          <div className="text-left">
            <div className="font-bold text-sm text-foreground">
              {bets.length} Selections
            </div>
            {bets.length > 0 && (
              <div className="text-xs font-mono text-[var(--color-gold)]">
                <AnimatedNumber value={totalOdds} suffix="x Odds" />
              </div>
            )}
          </div>
        </div>
        <div className="bg-[var(--primary)] text-white px-4 py-2 rounded-lg font-bold text-sm">
          {isMobileOpen ? "Close" : "View Slip"}
        </div>
      </button>
    </div>
  );

  const SidebarContent = () => (
    <>
      {/* Speed Lines Overlay */}
      {showSpeedLines && (
        <div className="absolute inset-0 z-50 speed-lines-overlay pointer-events-none" />
      )}
      
      {/* HUD Header */}
      <div className="h-[66px] px-6 flex items-center justify-between border-b border-border bg-[var(--background-alt)]">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-[var(--color-gold)]" />
          <div>
            <h2 className="text-sm font-bold text-gradient-gold tracking-wide font-pixel">ACCUMULATOR</h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
              {bets.length} LEG{bets.length !== 1 ? "S" : ""} ACTIVE
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bets.length > 0 && (
            <button
              onClick={clearBets}
              className="p-2 hover:bg-white/5 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
              title="Clear All"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button 
            className="md:hidden p-2 hover:bg-white/5 rounded-lg"
            onClick={() => setIsMobileOpen(false)}
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>
      </div>
      
      {/* HUD Gradient Line */}
      <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-[var(--color-gold)]/50 to-transparent" />

      {/* Drop Zone / Bets List */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {bets.length === 0 ? (
          <div
            className={`
              h-full flex flex-col items-center justify-center
              border-2 border-dashed rounded-xl transition-all duration-300 min-h-[300px]
              ${
                isDragOver
                  ? "border-[var(--color-gold)] bg-[var(--color-gold)]/5 scale-[0.98]"
                  : "border-white/5 bg-white/5"
              }
            `}
          >
            <div className="text-center p-6">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <span
                  className={`text-4xl ${
                    isDragOver ? "text-[var(--color-gold)]" : "text-muted-foreground/20"
                  }`}
                >
                  +
                </span>
              </div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Build Your Acca
              </p>
              <p className="text-[10px] text-muted-foreground/50 mt-2 font-mono">
                DRAG MARKETS HERE
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pb-20 md:pb-0">
            {bets.map((bet) => (
              <BetItem key={bet.market.id} bet={bet} onRemove={removeBet} />
            ))}
          </div>
        )}
      </div>

      {/* Footer - Stake & Payout */}
      {bets.length > 0 && (
        <div className="p-6 border-t border-border bg-[var(--background-alt)] overflow-y-auto">
          {/* Combined Odds */}
          <div className="flex items-center justify-between mb-4 bg-white/5 p-3 rounded-lg border border-white/5">
            <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Total Odds</span>
            <span
              className={`text-2xl font-bold text-[var(--color-gold)] font-mono ${
                multiplierPop ? "multiplier-pop" : ""
              }`}
            >
              <AnimatedNumber value={totalOdds} suffix="x" />
            </span>
          </div>

          {/* Stake Input */}
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                Stake (USDC)
              </label>
              <span className="text-[10px] text-[var(--primary)] cursor-pointer hover:underline">
                Max
              </span>
            </div>
            <div className="relative group">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-[var(--color-gold)] transition-colors">
                $
              </span>
              <Input
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="pl-7 text-right text-lg font-bold font-mono bg-black/20 border-white/10 focus:border-[var(--color-gold)] transition-colors h-12"
                min="0"
                step="1"
              />
            </div>
          </div>

          {/* Quick Stakes */}
          <div className="flex gap-2 mb-6">
            {[10, 50, 100].map((amount) => (
              <button
                key={amount}
                onClick={() => setStake(amount.toString())}
                className="flex-1 py-1.5 text-xs font-mono font-medium rounded border border-white/10 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10 transition-all"
              >
                ${amount}
              </button>
            ))}
          </div>

          {/* Potential Payout */}
          <div className="relative overflow-hidden bg-gradient-to-br from-[var(--color-gold)]/10 to-transparent border border-[var(--color-gold)]/30 rounded-xl p-5 mb-4 group">
            <div className="absolute inset-0 bg-[var(--color-gold)]/5 animate-pulse" />
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-[var(--color-gold)] uppercase tracking-wider font-bold flex items-center gap-1">
                  <Trophy className="w-3 h-3" />
                  Potential Win
                </span>
              </div>
              <div className="text-4xl font-bold text-[var(--color-gold)] text-glow-gold font-mono tracking-tight my-1">
                <AnimatedNumber value={payout} prefix="$" />
              </div>
              <div className="text-[10px] text-[var(--color-success)] text-right font-mono font-bold">
                +<AnimatedNumber value={payout - stakeNum} prefix="$" /> PROFIT
              </div>
            </div>
          </div>

          {/* Error Message */}
          {submitError && (
            <div className="text-xs text-destructive mb-4 p-3 bg-destructive/10 rounded-lg border border-destructive/20 font-mono flex items-center gap-2">
               <X className="h-3 w-3" /> {submitError}
            </div>
          )}

          {/* Place Bet Button */}
          <Button
            className="w-full bg-[var(--color-gold)] text-black hover:bg-[var(--color-gold-bright)] font-bold uppercase tracking-widest py-6 text-lg shadow-glow-gold-sm hover:shadow-glow-gold transition-all active:scale-[0.98]"
            size="lg"
            onClick={handlePlaceBet}
            disabled={isSubmitting}
          >
            {isSubmitting ? "PROCESSING..." : "PLACE BET"}
          </Button>
        </div>
      )}
    </>
  );

  return (
    <>
      <MobileFloatingButton />
      
      {/* Desktop Sidebar */}
      <aside
        ref={ref}
        className={`
          hidden md:flex fixed right-0 top-0 bottom-0 w-80 bg-background/80 backdrop-blur-xl border-l border-border
          flex-col z-40 transition-all duration-300 overflow-hidden
          ${isDragOver ? "border-l-2 border-l-[var(--color-gold)] shadow-glow" : ""}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      <div
        className={`
          fixed inset-0 z-50 md:hidden transition-transform duration-300 ease-in-out bg-background flex flex-col
          ${isMobileOpen ? "translate-y-0" : "translate-y-full"}
        `}
      >
        <SidebarContent />
      </div>

      {/* Customization/Share Modal */}
      <AccaModal
        chainId={modalChainId}
        isOpen={!!modalChainId}
        onClose={() => setModalChainId(null)}
      />
    </>
  );
  }
);

function BetItem({
  bet,
  onRemove,
}: {
  bet: AccumulatorBet;
  onRemove: (id: string) => void;
}) {
  const isYes = bet.selection === "yes";

  return (
    <div className="glass-card rounded-lg p-3 relative group border-l-2 hover:border-l-[var(--color-gold)] transition-all animate-in slide-in-from-right-2 duration-300">
      {/* Remove Button */}
      <button
        onClick={() => onRemove(bet.market.id)}
        className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/80 hover:scale-110 shadow-lg z-10"
      >
        <Trash2 className="w-3 h-3" />
      </button>

      {/* Market Question */}
      <p className="text-xs font-medium text-foreground mb-3 pr-4 line-clamp-2 leading-relaxed">
        {bet.market.question}
      </p>

      {/* Selection & Odds */}
      <div className="flex items-center justify-between bg-black/20 p-2 rounded">
        <Badge 
          variant="outline" 
          className={`
            border-0 text-[10px] uppercase font-bold px-2 py-0.5
            ${isYes ? "bg-[var(--color-success)]/20 text-[var(--color-success)]" : "bg-[var(--color-error)]/20 text-[var(--color-error)]"}
          `}
        >
          {bet.selection}
        </Badge>
        <span className="text-sm font-mono font-bold text-[var(--color-gold)]">
          {bet.odds.toFixed(2)}x
        </span>
      </div>
    </div>
  );
}
