import { useRef } from "react";
import { useAccumulator } from "../context/AccumulatorContext";
import { Badge } from "./ui/Badge";
import { Sparkles } from "lucide-react";

export interface Market {
  id: string;
  question: string;
  category: string;
  volume: string;
  yesPrice: number;
  noPrice: number;
  endDate: string;
  endDateISO: string;
  image?: string;
  description?: string;
  conditionId: string;
  yesTokenId: string;
  noTokenId: string;
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
        glass-card rounded-xl p-4 md:p-5 cursor-pointer group relative overflow-hidden
        flex flex-col h-full touch-manipulation
        transition-all duration-300 ease-[var(--ease-default)]
        hover:border-[var(--color-gold)] hover:shadow-glow-gold-sm hover:-translate-y-1
        ${inAccumulator ? "ring-2 ring-[var(--color-gold)]/50" : ""}
      `}
    >
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-10 grid-bg pointer-events-none" />

      {/* In Accumulator Badge */}
      {inAccumulator && (
        <div className="absolute top-0 right-0 p-2 z-10">
          <Badge size="sm" className="bg-[var(--color-gold)] text-black border-none animate-pulse">
            <Sparkles className="w-3 h-3 mr-1" />
            IN ACCA
          </Badge>
        </div>
      )}

      {/* Category & Volume */}
      <div className="flex items-center justify-between mb-3 md:mb-4 relative z-10">
        <Badge 
          variant="outline" 
          size="sm"
          className="border-[var(--color-accent)]/30 text-[var(--color-accent)] bg-[var(--color-accent)]/5 hover:bg-[var(--color-accent)]/10"
        >
          {market.category}
        </Badge>
        <span className="text-[10px] md:text-xs font-mono text-muted-foreground">
          VOL: <span className="text-[var(--color-gold)]">{market.volume}</span>
        </span>
      </div>

      {/* Question */}
      <h3 className="text-base md:text-lg font-medium mb-4 md:mb-5 text-foreground group-hover:text-[var(--color-accent)] transition-colors leading-snug line-clamp-3 relative z-10 min-h-[3.5rem]">
        {market.question}
      </h3>

      {/* Bottom section - pushed to bottom */}
      <div className="mt-auto relative z-10">
        {/* Cleaner Progress Bar */}
        <div className="relative h-2 bg-black/40 rounded-full overflow-hidden mb-4 md:mb-5 border border-white/5 flex">
          <div
            className="progress-yes h-full transition-all duration-500"
            style={{ width: `${yesPercentage}%` }}
          />
          <div
            className="progress-no h-full transition-all duration-500"
            style={{ width: `${noPercentage}%` }}
          />
          
          {/* Divider line */}
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-black/40 transform -translate-x-1/2 z-10" />
        </div>

        {/* Drag hint - Hidden on mobile */}
        <div className="hidden md:block text-center mb-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="text-[10px] font-pixel text-[var(--color-gold)] tracking-widest uppercase">
            ◄ DRAG TO ACCUMULATOR ►
          </span>
        </div>

        {/* Yes/No Buttons - Larger touch targets */}
        <div className="flex gap-3">
          <button
            ref={yesButtonRef}
            draggable
            onDragStart={(e) => handleDragStart(e, "yes")}
            onClick={handleYesClick}
            className={`
              flex-1 py-3 md:py-3 px-2 md:px-3 rounded-lg border transition-all duration-200 speed-effect relative overflow-hidden active:scale-95
              ${
                currentSelection === "yes"
                  ? "border-[var(--color-success)] bg-[var(--color-success)]/20 shadow-glow-success"
                  : "border-[var(--color-success)]/30 bg-[var(--color-success)]/5 hover:bg-[var(--color-success)]/15 hover:border-[var(--color-success)]"
              }
            `}
          >
            <div className="flex flex-col items-center gap-0.5 md:gap-1 relative z-10">
              <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-success)]">
                YES
              </span>
              <span className="text-lg md:text-xl font-mono font-bold text-[var(--color-success)]">
                {yesPercentage}<span className="text-xs ml-0.5">¢</span>
              </span>
            </div>
          </button>

          <button
            ref={noButtonRef}
            draggable
            onDragStart={(e) => handleDragStart(e, "no")}
            onClick={handleNoClick}
            className={`
              flex-1 py-3 md:py-3 px-2 md:px-3 rounded-lg border transition-all duration-200 speed-effect relative overflow-hidden active:scale-95
              ${
                currentSelection === "no"
                  ? "border-[var(--color-error)] bg-[var(--color-error)]/20 shadow-glow-destructive"
                  : "border-[var(--color-error)]/30 bg-[var(--color-error)]/5 hover:bg-[var(--color-error)]/15 hover:border-[var(--color-error)]"
              }
            `}
          >
            <div className="flex flex-col items-center gap-0.5 md:gap-1 relative z-10">
              <span className="text-[10px] uppercase tracking-widest font-bold text-[var(--color-error)]">
                NO
              </span>
              <span className="text-lg md:text-xl font-mono font-bold text-[var(--color-error)]">
                {noPercentage}<span className="text-xs ml-0.5">¢</span>
              </span>
            </div>
          </button>
        </div>

        {/* End Date */}
        <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center">
          <span className="text-[10px] uppercase text-muted-foreground font-mono tracking-wide">
            ENDS: {market.endDate}
          </span>
          {market.image && (
             <img src={market.image} alt="" className="w-5 h-5 rounded-full opacity-50 grayscale group-hover:grayscale-0 transition-all" />
          )}
        </div>
      </div>
    </div>
  );
}
