import { useRef } from "react";
import { useAccumulator } from "../context/AccumulatorContext";
import { Badge } from "./ui/Badge";

export interface Market {
  id: string;
  question: string;
  category: string;
  volume: string;
  yesPrice: number;
  noPrice: number;
  endDate: string;
  image?: string;
  // Polymarket integration fields
  conditionId?: string;
  yesTokenId?: string;
  noTokenId?: string;
}

interface MarketCardProps {
  market: Market;
  onBetClick?: (buttonElement: HTMLElement, selection: "yes" | "no") => void;
}

export function MarketCard({ market, onBetClick }: MarketCardProps) {
  const { addBet, isInAccumulator, getSelection } = useAccumulator();
  const yesButtonRef = useRef<HTMLButtonElement>(null);
  const noButtonRef = useRef<HTMLButtonElement>(null);
  const yesPercentage = Math.round(market.yesPrice * 100);
  const noPercentage = Math.round(market.noPrice * 100);
  const inAccumulator = isInAccumulator(market.id);
  const currentSelection = getSelection(market.id);

  const handleDragStart = (e: React.DragEvent, selection: "yes" | "no") => {
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ market, selection })
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleYesClick = () => {
    if (onBetClick && yesButtonRef.current) {
      onBetClick(yesButtonRef.current, "yes");
    }
    addBet(market, "yes");
  };

  const handleNoClick = () => {
    if (onBetClick && noButtonRef.current) {
      onBetClick(noButtonRef.current, "no");
    }
    addBet(market, "no");
  };

  return (
    <div
      className={`
        bg-card border border-border rounded-lg p-4 cursor-pointer group relative
        flex flex-col h-full
        transition-all duration-200 ease-[var(--ease-default)]
        hover:border-[var(--border-hover)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5
        ${inAccumulator ? "ring-2 ring-primary/50" : ""}
      `}
    >
      {/* In Accumulator Badge */}
      {inAccumulator && (
        <div className="absolute -top-2 -right-2">
          <Badge size="sm">In Acca</Badge>
        </div>
      )}

      {/* Category & Volume */}
      <div className="flex items-center justify-between mb-3">
        <Badge variant="secondary" size="sm">
          {market.category}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Vol: <span className="text-primary">{market.volume}</span>
        </span>
      </div>

      {/* Question - Fixed height, 2 lines max */}
      <h3 className="text-base font-medium mb-4 text-foreground group-hover:text-primary transition-colors leading-tight line-clamp-2 h-[2.5rem]">
        {market.question}
      </h3>

      {/* Bottom section - pushed to bottom */}
      <div className="mt-auto">
        {/* Progress Bar */}
        <div className="relative h-1.5 bg-secondary rounded-full overflow-hidden mb-4 flex">
          <div
            className="progress-yes rounded-l-full"
            style={{ width: `${yesPercentage}%` }}
          />
          <div
            className="progress-no rounded-r-full"
            style={{ width: `${noPercentage}%` }}
          />
        </div>

        {/* Drag hint */}
        <div className="text-center mb-3">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Drag or click to add to accumulator
          </span>
        </div>

        {/* Yes/No Buttons */}
        <div className="flex gap-3">
          <button
            ref={yesButtonRef}
            draggable
            onDragStart={(e) => handleDragStart(e, "yes")}
            onClick={handleYesClick}
            className={`
              flex-1 py-2 px-3 rounded-md border transition-all duration-150 speed-effect
              ${
                currentSelection === "yes"
                  ? "border-[var(--color-success)] bg-[var(--color-success)]/20 shadow-[0_0_12px_rgba(34,197,94,0.3)]"
                  : "border-[var(--color-success)]/50 bg-[var(--color-success)]/10 hover:bg-[var(--color-success)]/20"
              }
            `}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-[var(--color-success)]">
                Yes
              </span>
              <span className="text-lg font-semibold text-[var(--color-success)]">
                {yesPercentage}c
              </span>
            </div>
          </button>

          <button
            ref={noButtonRef}
            draggable
            onDragStart={(e) => handleDragStart(e, "no")}
            onClick={handleNoClick}
            className={`
              flex-1 py-2 px-3 rounded-md border transition-all duration-150 speed-effect
              ${
                currentSelection === "no"
                  ? "border-destructive bg-destructive/20 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                  : "border-destructive/50 bg-destructive/10 hover:bg-destructive/20"
              }
            `}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-destructive">
                No
              </span>
              <span className="text-lg font-semibold text-destructive">
                {noPercentage}c
              </span>
            </div>
          </button>
        </div>

        {/* End Date */}
        <div className="mt-3 pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            Ends: <span className="text-foreground">{market.endDate}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
