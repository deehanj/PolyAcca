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
  const participantCount = chain.participantCount ?? 0;

  return (
    <Link
      to={`/acca/${chain.chainId}`}
      className="min-w-[380px] w-[380px] bg-card hover:bg-card/90 rounded-xl border-2 border-border hover:border-[var(--color-gold)] transition-all duration-200 hover:-translate-y-0.5 group block overflow-hidden"
    >
      {/* Popular Pick banner */}
      <div className="bg-[var(--color-gold)] text-black px-4 py-1.5 flex items-center gap-2">
        <Flame className="w-4 h-4" />
        <span className="text-xs font-bold uppercase tracking-wide">Popular Pick</span>
      </div>

      <div className="p-5">
        {/* Title section */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted/50 shrink-0">
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
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg text-foreground group-hover:text-[var(--color-gold)] transition-colors leading-tight truncate">
              {chain.name || `Acca ${truncateId(chain.chainId)}`}
            </h3>
            <div className="flex items-center gap-2 mt-2">
              {chain.categories && chain.categories.length > 0 && (
                <Badge
                  variant="outline"
                  size="sm"
                  className="text-[10px] px-2 py-0.5 border-[var(--color-gold)]/30 text-[var(--color-gold)]"
                >
                  {chain.categories[0]}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">{totalLegs} legs</span>
            </div>
          </div>
          {/* Multiplier - top right */}
          <div className="text-right shrink-0">
            {isLoadingMultiplier ? (
              <span className="text-2xl font-mono font-bold text-muted-foreground">...</span>
            ) : multiplier !== null ? (
              <>
                <span className="text-2xl font-mono font-bold text-[var(--color-gold)]">
                  {multiplier.toFixed(1)}x
                </span>
                <div className="text-xs text-muted-foreground">multiplier</div>
              </>
            ) : (
              <span className="text-2xl font-mono font-bold text-muted-foreground">-</span>
            )}
          </div>
        </div>

        {/* Social proof section */}
        <div className="bg-muted/30 rounded-lg p-4 mb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                <div className="w-8 h-8 rounded-full bg-[var(--primary)]/30 border-2 border-card flex items-center justify-center">
                  <span className="text-xs font-bold">
                    {participantCount > 0 ? "JD" : "??"}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-[var(--color-gold)]/30 border-2 border-card flex items-center justify-center">
                  <span className="text-xs font-bold">
                    {participantCount > 1 ? "MK" : "??"}
                  </span>
                </div>
                {participantCount > 2 && (
                  <div className="w-8 h-8 rounded-full bg-[var(--color-success)]/30 border-2 border-card flex items-center justify-center">
                    <span className="text-xs font-bold">+{participantCount - 2}</span>
                  </div>
                )}
              </div>
              <div>
                <div className="text-sm font-bold text-foreground">
                  {participantCount} {participantCount === 1 ? "person" : "people"} backed this
                </div>
                <div className="text-xs text-muted-foreground">Join them now</div>
              </div>
            </div>
          </div>
        </div>

        {/* Time remaining */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span className="text-sm">Starts in {formatTimeRemaining(chain.firstMarketEndDate)}</span>
        </div>
      </div>

      {/* Bottom backing bar */}
      <div className="bg-gradient-to-r from-[var(--color-success)]/20 to-[var(--color-success)]/10 px-5 py-3 flex items-center justify-between border-t border-[var(--color-success)]/20">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[var(--color-success)]" />
          <span className="text-sm font-medium text-[var(--color-success)]">
            {formatValue(chain.totalValue)} wagered
          </span>
        </div>
      </div>
    </Link>
  );
}
