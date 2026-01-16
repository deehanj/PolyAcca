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
    const prevOddsRef = useRef<number>(1);

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
      // Generate chain name from first market question
      const chainName = bets.length === 1
        ? bets[0].market.question.slice(0, 100)
        : `${bets.length}-leg accumulator`;

      const response = await fetch(`${API_URL}/chains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          legs: getLegsForApi(),
          initialStake: stakeAmount.toFixed(2),
          name: chainName,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to place bet");
      }

      // Success - clear bets and show success
      clearBets();
      setStake("10");
      // TODO: Show success toast/notification
      console.log("Chain created successfully:", data.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to place bet";
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <aside
      ref={ref}
      className={`
        fixed right-0 top-0 h-full w-80 bg-background border-l border-border
        flex flex-col z-40 transition-all duration-200 overflow-hidden
        ${isDragOver ? "border-l-2 border-l-primary shadow-[var(--glow)]" : ""}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Speed Lines Overlay */}
      {showSpeedLines && (
        <div className="absolute inset-0 z-50 speed-lines-overlay pointer-events-none" />
      )}
      {/* Header - matches navbar height (h-16 + 1px gradient + 1px border) */}
      <div className="h-[66px] px-4 flex items-center justify-between border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-primary">ACCUMULATOR</h2>
          <p className="text-xs text-muted-foreground">
            {bets.length} selection{bets.length !== 1 ? "s" : ""}
          </p>
        </div>
        {bets.length > 0 && (
          <button
            onClick={clearBets}
            className="text-xs text-destructive hover:text-destructive/80 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>
      {/* Match navbar's gradient border */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

      {/* Drop Zone / Bets List */}
      <div className="flex-1 overflow-y-auto p-4">
        {bets.length === 0 ? (
          <div
            className={`
              h-full flex flex-col items-center justify-center
              border-2 border-dashed rounded-lg transition-all
              ${
                isDragOver
                  ? "border-primary bg-primary/10"
                  : "border-border"
              }
            `}
          >
            <div className="text-center p-6">
              <div className="text-4xl mb-4">
                <span
                  className={
                    isDragOver ? "text-primary" : "text-muted-foreground/50"
                  }
                >
                  +
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Drag markets here
              </p>
              <p className="text-xs text-muted-foreground/60 mt-2">
                or click Yes/No buttons to add
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {bets.map((bet) => (
              <BetItem key={bet.market.id} bet={bet} onRemove={removeBet} />
            ))}
          </div>
        )}
      </div>

      {/* Footer - Stake & Payout */}
      {bets.length > 0 && (
        <div className="p-4 border-t border-border">
          {/* Combined Odds */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-muted-foreground">Combined Odds</span>
            <span
              className={`text-xl font-bold text-primary ${
                multiplierPop ? "multiplier-pop" : ""
              }`}
            >
              {totalOdds.toFixed(2)}x
            </span>
          </div>

          {/* Stake Input */}
          <div className="mb-4">
            <label className="block text-xs text-muted-foreground mb-2">
              Stake Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary">
                $
              </span>
              <Input
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="pl-7 text-right text-lg font-semibold"
                min="0"
                step="1"
              />
            </div>
          </div>

          {/* Quick Stakes */}
          <div className="flex gap-2 mb-4">
            {[10, 25, 50, 100].map((amount) => (
              <Button
                key={amount}
                variant="outline"
                size="sm"
                onClick={() => setStake(amount.toString())}
                className="flex-1 text-xs"
              >
                ${amount}
              </Button>
            ))}
          </div>

          {/* Potential Payout */}
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Potential Payout
              </span>
              <span className="text-2xl font-bold text-primary text-glow">
                ${payout.toFixed(2)}
              </span>
            </div>
            <div className="text-xs text-[var(--color-success)] mt-1 text-right">
              +${(payout - stakeNum).toFixed(2)} profit
            </div>
          </div>

          {/* Error Message */}
          {submitError && (
            <div className="text-sm text-destructive mb-4 p-2 bg-destructive/10 rounded">
              {submitError}
            </div>
          )}

          {/* Place Bet Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handlePlaceBet}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Placing Bet..." : "Place Accumulator Bet"}
          </Button>
        </div>
      )}
    </aside>
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
    <div className="bg-card border border-border rounded-lg p-3 relative group">
      {/* Remove Button */}
      <button
        onClick={() => onRemove(bet.market.id)}
        className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/80"
      >
        ×
      </button>

      {/* Market Question */}
      <p className="text-sm text-foreground mb-2 pr-4 line-clamp-2">
        {bet.market.question}
      </p>

      {/* Selection & Odds */}
      <div className="flex items-center justify-between">
        <Badge variant={isYes ? "success" : "error"} size="sm">
          {bet.selection.toUpperCase()}
        </Badge>
        <span className="text-sm font-semibold text-primary">
          {bet.odds.toFixed(2)}x
        </span>
      </div>
    </div>
  );
}
