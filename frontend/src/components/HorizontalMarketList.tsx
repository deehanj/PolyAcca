import { useRef } from "react";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { useAccumulator } from "../context/AccumulatorContext";
import { Badge } from "./ui/Badge";
import type { Market } from "./MarketCard";

interface HorizontalMarketListProps {
  title: string;
  markets: Market[];
  onBetClick?: (buttonElement: HTMLElement) => void;
  isLoading?: boolean;
}

function CompactMarketCard({
  market,
  onBetClick,
}: {
  market: Market;
  onBetClick?: (buttonElement: HTMLElement) => void;
}) {
  const { addBet, isInAccumulator, getSelection } = useAccumulator();
  const yesButtonRef = useRef<HTMLButtonElement>(null);
  const noButtonRef = useRef<HTMLButtonElement>(null);
  const yesPercentage = Math.round(market.yesPrice * 100);
  const noPercentage = Math.round(market.noPrice * 100);
  const inAccumulator = isInAccumulator(market.id);
  const currentSelection = getSelection(market.id);

  const handleYesClick = () => {
    if (onBetClick && yesButtonRef.current) {
      onBetClick(yesButtonRef.current);
    }
    addBet(market, "yes");
  };

  const handleNoClick = () => {
    if (onBetClick && noButtonRef.current) {
      onBetClick(noButtonRef.current);
    }
    addBet(market, "no");
  };

  return (
    <div
      className={`
        min-w-[280px] md:min-w-[320px] flex-shrink-0 snap-start
        glass-card rounded-xl p-4 relative overflow-hidden
        transition-all duration-300 ease-[var(--ease-default)]
        hover:border-[var(--color-gold)] hover:shadow-[var(--glow-gold-sm)]
        ${inAccumulator ? "ring-2 ring-[var(--color-gold)]/50" : ""}
      `}
    >
      {/* Background accent */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--sonic-blue)] to-[var(--color-purple)]" />

      {/* Category */}
      <div className="flex items-center justify-between mb-2">
        <Badge
          variant="outline"
          size="sm"
          className="border-[var(--color-accent)]/30 text-[var(--color-accent)] bg-[var(--color-accent)]/5 text-[10px]"
        >
          {market.category}
        </Badge>
        <span className="text-[10px] font-mono text-muted-foreground">
          {market.volume}
        </span>
      </div>

      {/* Question - truncated */}
      <h4 className="text-sm font-medium text-foreground line-clamp-2 mb-3 min-h-[2.5rem] leading-tight">
        {market.question}
      </h4>

      {/* Yes/No Buttons - Compact */}
      <div className="flex gap-2">
        <button
          ref={yesButtonRef}
          onClick={handleYesClick}
          className={`
            flex-1 py-2 px-3 rounded-lg border transition-all duration-200 active:scale-95
            ${
              currentSelection === "yes"
                ? "border-[var(--color-success)] bg-[var(--color-success)]/20 shadow-[0_0_10px_rgba(34,197,94,0.3)]"
                : "border-[var(--color-success)]/30 bg-[var(--color-success)]/5 hover:bg-[var(--color-success)]/15"
            }
          `}
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-[10px] uppercase font-bold text-[var(--color-success)]">
              YES
            </span>
            <span className="text-base font-mono font-bold text-[var(--color-success)]">
              {yesPercentage}¢
            </span>
          </div>
        </button>

        <button
          ref={noButtonRef}
          onClick={handleNoClick}
          className={`
            flex-1 py-2 px-3 rounded-lg border transition-all duration-200 active:scale-95
            ${
              currentSelection === "no"
                ? "border-[var(--color-error)] bg-[var(--color-error)]/20 shadow-[0_0_10px_rgba(255,68,68,0.3)]"
                : "border-[var(--color-error)]/30 bg-[var(--color-error)]/5 hover:bg-[var(--color-error)]/15"
            }
          `}
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-[10px] uppercase font-bold text-[var(--color-error)]">
              NO
            </span>
            <span className="text-base font-mono font-bold text-[var(--color-error)]">
              {noPercentage}¢
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-w-[280px] md:min-w-[320px] flex-shrink-0 snap-start glass-card rounded-xl p-4 animate-pulse">
      <div className="h-1 bg-white/10 rounded mb-3" />
      <div className="flex justify-between mb-2">
        <div className="h-5 w-16 bg-white/10 rounded" />
        <div className="h-4 w-12 bg-white/10 rounded" />
      </div>
      <div className="h-10 bg-white/10 rounded mb-3" />
      <div className="flex gap-2">
        <div className="flex-1 h-10 bg-white/10 rounded" />
        <div className="flex-1 h-10 bg-white/10 rounded" />
      </div>
    </div>
  );
}

export function HorizontalMarketList({
  title,
  markets,
  onBetClick,
  isLoading,
}: HorizontalMarketListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 340;
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[var(--color-gold)]" />
          <h3 className="text-lg font-bold text-foreground">{title}</h3>
        </div>

        {/* Scroll Buttons - Desktop only */}
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => scroll("left")}
            className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:-mx-6 md:px-6"
      >
        {isLoading ? (
          // Loading skeletons
          <>
            <LoadingSkeleton />
            <LoadingSkeleton />
            <LoadingSkeleton />
            <LoadingSkeleton />
          </>
        ) : markets.length > 0 ? (
          markets.map((market) => (
            <CompactMarketCard
              key={market.id}
              market={market}
              onBetClick={onBetClick}
            />
          ))
        ) : (
          <div className="min-w-full flex items-center justify-center py-8 text-muted-foreground">
            No trending markets available
          </div>
        )}
      </div>

      {/* Fade edges - Desktop only */}
      <div className="hidden md:block absolute top-12 bottom-4 left-0 w-8 bg-gradient-to-r from-[var(--background)] to-transparent pointer-events-none" />
      <div className="hidden md:block absolute top-12 bottom-4 right-0 w-8 bg-gradient-to-l from-[var(--background)] to-transparent pointer-events-none" />
    </div>
  );
}
