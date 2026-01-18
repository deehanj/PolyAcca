/**
 * TrendingAccas - Horizontal scrolling list of trending accumulators
 * Styled similar to pump.fun token cards
 */

import { useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Flame, Users, Clock } from "lucide-react";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { useTrendingChains, type ChainSummary } from "../hooks/useTrendingChains";
import { useChainMultipliers } from "../hooks/useChainMultiplier";

const CHAIN_IMAGES_DOMAIN = import.meta.env.VITE_CHAIN_IMAGES_DOMAIN || "";

// Format total value (e.g., "$2.4K")
function formatValue(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

// Format time remaining until a date (e.g., "2d 5h", "3h 20m", "Ended")
function formatTimeRemaining(dateString: string | undefined): string {
  if (!dateString) return "-";

  const endDate = new Date(dateString);
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();

  if (diffMs <= 0) return "Ended";

  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    const remainingHours = diffHours % 24;
    return `${diffDays}d ${remainingHours}h`;
  }
  if (diffHours > 0) {
    const remainingMins = diffMins % 60;
    return `${diffHours}h ${remainingMins}m`;
  }
  return `${diffMins}m`;
}

// Truncate chain ID for display
function truncateId(chainId: string): string {
  return chainId.slice(0, 6);
}

export function TrendingAccas() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { chains, isLoading } = useTrendingChains(10);
  const { multipliers, isLoading: isLoadingMultipliers } = useChainMultipliers(
    chains.map((c) => ({ chainId: c.chainId, chain: c.chain }))
  );

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 320;
      const targetScroll =
        scrollContainerRef.current.scrollLeft +
        (direction === "left" ? -scrollAmount : scrollAmount);

      scrollContainerRef.current.scrollTo({
        left: targetScroll,
        behavior: "smooth",
      });
    }
  };

  // Don't render if no chains
  if (!isLoading && chains.length === 0) {
    return null;
  }

  return (
    <div className="w-full mb-6 animate-fade-in-up">
      <div className="w-full max-w-[1800px] ml-auto mr-0 px-4 md:pl-6 md:pr-8">
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-[var(--color-gold)]" />
            <h2 className="text-xl font-bold text-gradient-gold uppercase tracking-wide">
              TRENDING ACCAS
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
          className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="min-w-[360px] h-[104px] bg-card/50 rounded-xl animate-pulse border border-border"
                />
              ))
            : chains.map((chain) => (
                <div key={chain.chainId} className="snap-start shrink-0">
                  <AccaCard
                    chain={chain}
                    multiplier={multipliers.get(chain.chainId) ?? null}
                    isLoadingMultiplier={isLoadingMultipliers}
                  />
                </div>
              ))}
          <div className="shrink-0 w-1" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

interface AccaCardProps {
  chain: ChainSummary;
  multiplier: number | null;
  isLoadingMultiplier: boolean;
}

function AccaCard({ chain, multiplier, isLoadingMultiplier }: AccaCardProps) {
  const imageUrl =
    chain.imageKey && CHAIN_IMAGES_DOMAIN
      ? `https://${CHAIN_IMAGES_DOMAIN}/${chain.imageKey}`
      : null;

  const totalLegs = chain.totalLegs ?? chain.chain.length;
  const completedLegs = chain.completedLegs ?? 0;

  return (
    <Link
      to={`/acca/${chain.chainId}`}
      className="min-w-[360px] w-[360px] bg-card/80 hover:bg-card rounded-xl p-3 border border-border hover:border-[var(--color-gold)]/50 transition-all duration-200 hover:-translate-y-0.5 group block"
    >
      <div className="flex gap-3">
        {/* Square image on left */}
        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted/50 shrink-0">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={chain.name || "Acca"}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Flame className="w-6 h-6 text-[var(--color-gold)] opacity-30" />
            </div>
          )}
        </div>

        {/* Content on right */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Title row with Players & Value */}
          <div className="flex items-start gap-2">
            <h3 className="font-bold text-sm text-foreground truncate group-hover:text-[var(--color-gold)] transition-colors flex-1">
              {chain.name || `Acca ${truncateId(chain.chainId)}`}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Users className="w-3 h-3" />
                <span className="text-xs font-mono">{chain.participantCount ?? 0}</span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {formatValue(chain.totalValue)}
              </span>
            </div>
          </div>

          {/* Category tags */}
          {chain.categories && chain.categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {chain.categories.slice(0, 2).map((cat) => (
                <Badge
                  key={cat}
                  variant="outline"
                  size="sm"
                  className="text-[9px] px-1.5 py-0 h-4 border-[var(--color-gold)]/30 text-[var(--color-gold)]"
                >
                  {cat}
                </Badge>
              ))}
            </div>
          )}

          {/* Bottom section: Time & Legs on left, Multiplier on right */}
          <div className="flex items-end justify-between mt-auto">
            <div className="flex flex-col gap-1">
              {/* Time remaining */}
              <div className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className="text-[10px] font-mono">
                  {formatTimeRemaining(chain.firstMarketEndDate)}
                </span>
              </div>

              {/* Leg circles */}
              <div className="flex items-center gap-0.5">
                {Array.from({ length: totalLegs }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      i < completedLegs
                        ? "bg-[var(--color-success)]"
                        : "bg-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Multiplier - right aligned */}
            <div className="shrink-0">
              {isLoadingMultiplier ? (
                <span className="text-lg font-mono font-bold text-muted-foreground">...</span>
              ) : multiplier !== null ? (
                <span className="text-lg font-mono font-bold text-[var(--color-gold)]">
                  {multiplier.toFixed(1)}x
                </span>
              ) : (
                <span className="text-lg font-mono font-bold text-muted-foreground">-</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
