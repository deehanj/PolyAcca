import { useState, forwardRef, useEffect, useRef } from "react";
import {
  useAccumulator,
  type AccumulatorBet,
} from "../context/AccumulatorContext";
import type { Market } from "./MarketCard";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";

export const AccumulatorSidebar = forwardRef<HTMLDivElement>(
  function AccumulatorSidebar(props, ref) {
    const { bets, addBet, removeBet, clearBets, totalOdds, potentialPayout } =
      useAccumulator();
    const [stake, setStake] = useState<string>("10");
    const [isDragOver, setIsDragOver] = useState(false);
    const [showSpeedLines, setShowSpeedLines] = useState(false);
    const [multiplierPop, setMultiplierPop] = useState(false);
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

          {/* Place Bet Button */}
          <Button className="w-full" size="lg">
            Place Accumulator Bet
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
