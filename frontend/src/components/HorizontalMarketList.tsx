import { useRef } from "react";
import { Badge } from "./ui/Badge";
import type { Market } from "./MarketCard";
import { ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { Button } from "./ui/Button";

interface HorizontalMarketListProps {
  title: string;
  markets: Market[];
  onBetClick?: (buttonElement: HTMLElement, selection: "yes" | "no") => void;
  isLoading?: boolean;
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
      const scrollAmount = 400; // Adjust based on card width
      const targetScroll =
        scrollContainerRef.current.scrollLeft +
        (direction === "left" ? -scrollAmount : scrollAmount);
      
      scrollContainerRef.current.scrollTo({
        left: targetScroll,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="w-full mb-8 animate-fade-in-up">
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-[var(--color-gold)]" />
          <h2 className="text-xl font-bold text-gradient-gold uppercase tracking-wide">
            {title}
          </h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 rounded-full border-[var(--border-accent)] hover:bg-[var(--accent)]/10"
            onClick={() => scroll("left")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 rounded-full border-[var(--border-accent)] hover:bg-[var(--accent)]/10"
            onClick={() => scroll("right")}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto pt-2 pb-4 snap-x snap-mandatory scrollbar-hide -mx-2 px-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="min-w-[280px] h-[160px] bg-card/50 rounded-xl animate-pulse border border-border"
              />
            ))
          : markets.map((market) => (
              <div key={market.id} className="snap-start">
                <MiniMarketCard market={market} onBetClick={onBetClick} />
              </div>
            ))}
      </div>
    </div>
  );
}

function MiniMarketCard({
  market,
  onBetClick,
}: {
  market: Market;
  onBetClick?: (buttonElement: HTMLElement, selection: "yes" | "no") => void;
}) {
  const yesPercentage = Math.round(market.yesPrice * 100);
  const noPercentage = Math.round(market.noPrice * 100);

  return (
    <div className="min-w-[280px] w-[280px] glass-card rounded-xl p-4 relative group hover:border-[var(--color-gold)] transition-all duration-300 hover:-translate-y-1">
      {/* Category Badge - Absolute positioned */}
      <div className="absolute -top-3 left-4">
        <Badge
          variant="secondary"
          className="text-[10px] px-2 py-0.5 border border-[var(--color-gold)]/30 shadow-glow-gold-sm"
        >
          {market.category}
        </Badge>
      </div>

      <div className="mt-2 mb-3">
        <h3 className="text-sm font-medium leading-snug line-clamp-2 h-[2.5rem] group-hover:text-[var(--color-gold)] transition-colors">
          {market.question}
        </h3>
      </div>

      {/* Mini Stats */}
      <div className="flex justify-between items-end mb-3">
        <div className="text-xs text-muted-foreground">
          Vol: <span className="text-[var(--color-gold)]">{market.volume}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={(e) => onBetClick?.(e.currentTarget, "yes")}
          className="flex flex-col items-center justify-center py-1.5 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 hover:bg-[var(--color-success)]/20 transition-all active:scale-95"
        >
          <span className="text-[10px] uppercase text-[var(--color-success)] font-bold">
            Yes
          </span>
          <span className="text-sm font-mono text-[var(--color-success)]">
            {yesPercentage}%
          </span>
        </button>
        <button
          onClick={(e) => onBetClick?.(e.currentTarget, "no")}
          className="flex flex-col items-center justify-center py-1.5 rounded-lg border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 transition-all active:scale-95"
        >
          <span className="text-[10px] uppercase text-destructive font-bold">
            No
          </span>
          <span className="text-sm font-mono text-destructive">
            {noPercentage}%
          </span>
        </button>
      </div>
    </div>
  );
}
