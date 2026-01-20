import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { MarketCard, type Market } from "@/components/MarketCard";
import { AccumulatorSidebar } from "@/components/AccumulatorSidebar";
import { HorizontalMarketList } from "@/components/HorizontalMarketList";
import { Button } from "@/components/ui/Button";
import { RingCollectionEffect } from "@/components/RingCollectionEffect";
import { SharedAccaModal } from "@/components/SharedAccaModal";
import { useMarkets } from "@/hooks/useMarkets";
import { useRingAnimation } from "@/hooks/useRingAnimation";
import type { Market as ApiMarket, MarketsQueryParams } from "@/types/market";
import { StatsTicker } from "@/components/StatsTicker";
import { TrendingAccas } from "@/components/TrendingAccas";
import { TypewriterText } from "@/components/ui/TypewriterText";
import { TrendingUp, TrendingDown, Droplets, Clock, Flame, ChevronDown, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Sort options with their display labels and icons
const sortOptions: { value: string; label: string; order: MarketsQueryParams['order']; ascending?: boolean; icon: LucideIcon }[] = [
  { value: 'volume-desc', label: 'Highest Volume', order: 'volume', ascending: false, icon: TrendingUp },
  { value: 'volume-asc', label: 'Lowest Volume', order: 'volume', ascending: true, icon: TrendingDown },
  { value: 'liquidity-desc', label: 'Most Liquid', order: 'liquidity', ascending: false, icon: Droplets },
  { value: 'endDate-asc', label: 'Ending Soon', order: 'endDate', ascending: true, icon: Clock },
  { value: 'endDate-desc', label: 'Ending Later', order: 'endDate', ascending: false, icon: Clock },
  { value: 'volume24hr-desc', label: 'Trending (24h)', order: 'volume24hr', ascending: false, icon: Flame },
];

const categories = [
  "All",
  "Crypto",
  "Politics",
  "Sports",
  "Pop Culture",
  "Science",
];

// Format volume for display (e.g., 2400000 -> "$2.4M")
function formatVolume(volumeNum: number | undefined): string {
  if (volumeNum == null || isNaN(volumeNum)) {
    return "$0";
  }
  if (volumeNum >= 1_000_000) {
    return `$${(volumeNum / 1_000_000).toFixed(1)}M`;
  }
  if (volumeNum >= 1_000) {
    return `$${(volumeNum / 1_000).toFixed(0)}K`;
  }
  return `$${volumeNum.toFixed(0)}`;
}

// Transform API market to MarketCard format
function transformMarketForCard(market: ApiMarket): Market {
  return {
    id: market.id,
    question: market.question,
    category: market.category,
    volume: formatVolume(market.volumeNum),
    yesPrice: market.yesPrice,
    noPrice: market.noPrice,
    endDate: new Date(market.endDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    endDateISO: market.endDate, // Keep ISO format for API submission
    image: market.image,
    description: market.description,
    conditionId: market.conditionId,
    yesTokenId: market.yesTokenId,
    noTokenId: market.noTokenId,
  };
}

export function HomePage() {
  const { chainId } = useParams<{ chainId: string }>();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedSort, setSelectedSort] = useState("volume-desc");
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [sharedAccaModalOpen, setSharedAccaModalOpen] = useState(false);
  const limit = 12;
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const { animations, triggerAnimation } = useRingAnimation();

  // Open shared acca modal when chainId is present in URL
  useEffect(() => {
    if (chainId) {
      setSharedAccaModalOpen(true);
    }
  }, [chainId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setIsSortOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get current sort configuration
  const currentSort = sortOptions.find(s => s.value === selectedSort) || sortOptions[0];

  // Fetch main markets list
  const { markets, isLoading, error, isFetching } = useMarkets({
    limit,
    offset,
    active: true,
    order: currentSort.order,
    ascending: currentSort.ascending,
  });

  // Fetch trending/recent markets for the horizontal list (fetch separately or reuse)
  // For now we'll reuse the first few markets or fetch a different set if the API supported it
  // In a real app, you might want a separate query for "trending"
  const { markets: trendingMarkets, isLoading: isTrendingLoading } = useMarkets({
    limit: 10,
    offset: 0,
    active: true,
    order: "volume", // or "liquidity" or "created_at" if available
  });

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setOffset(0); // Reset pagination on category change
  };

  const handleSortChange = (sortValue: string) => {
    setSelectedSort(sortValue);
    setIsSortOpen(false);
    setOffset(0); // Reset pagination on sort change
  };

  const handleLoadMore = () => {
    setOffset((prev) => prev + limit);
  };

  const handleBetClick = (buttonElement: HTMLElement) => {
    // Find the sidebar element as the target
    if (sidebarRef.current) {
      triggerAnimation(buttonElement, sidebarRef.current);
    }
  };

  const transformedTrendingMarkets = trendingMarkets.map(transformMarketForCard);

  return (
    <div className="min-h-screen md:pr-80 relative bg-[var(--background)] overflow-x-hidden">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-[var(--primary)]/5 to-transparent" />
        <div className="absolute -top-[200px] -right-[200px] w-[600px] h-[600px] bg-[var(--primary)]/10 rounded-full blur-[100px]" />
        <div className="absolute top-[20%] left-[10%] w-[300px] h-[300px] bg-[var(--primary-dark)]/5 rounded-full blur-[80px]" />
      </div>

      <Header />

      {/* Stats Ticker - Below the header */}
      <StatsTicker />

      <main className="pb-32 md:pb-20">
        {/* Trending Accas Section */}
        <section className="pt-8 pb-2 md:pt-10 md:pb-4">
          <TrendingAccas />
        </section>

        {/* Trending Markets Section */}
        <section className="pb-4 md:pb-6">
          <div className="w-full max-w-[1800px] ml-auto mr-0 px-4 md:pl-6 md:pr-8">
            <HorizontalMarketList
              title="TRENDING MARKETS"
              markets={transformedTrendingMarkets}
              onBetClick={handleBetClick}
              isLoading={isTrendingLoading}
            />
          </div>
        </section>

        {/* Main Markets Grid Section */}
        <section className="py-6 md:py-10">
          <div className="w-full max-w-[1800px] ml-auto mr-0 px-4 md:pl-6 md:pr-8">
            {/* Filter Bar */}
            <div className="sticky top-[66px] z-30 py-3 md:py-4 bg-[var(--background)]/80 backdrop-blur-xl mb-6 -mx-4 md:-mx-6 px-4 md:px-6 border-b border-white/5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-lg md:text-xl font-bold text-foreground flex items-center gap-6 uppercase tracking-wide">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-success)] animate-pulse" />
                  <TypewriterText text="LIVE MARKETS" delay={1000} hideCursorOnComplete />
                  {isFetching && !isLoading && (
                    <span className="ml-2 text-[10px] md:text-xs text-muted-foreground font-mono">
                      [UPDATING...]
                    </span>
                  )}
                </h2>

                <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4">
                  {/* Sort Dropdown */}
                  <div className="relative" ref={sortDropdownRef}>
                    <button
                      onClick={() => setIsSortOpen(!isSortOpen)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group"
                    >
                      <currentSort.icon className="w-4 h-4 text-[var(--primary)]" />
                      <span className="text-xs font-medium text-white">{currentSort.label}</span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${isSortOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {/* Dropdown Menu */}
                    {isSortOpen && (
                      <div className="absolute top-full left-0 mt-2 w-48 py-1 rounded-xl bg-[#1a1a2e] border border-white/10 shadow-xl shadow-black/50 z-50 overflow-hidden">
                        {sortOptions.map((option) => {
                          const Icon = option.icon;
                          const isSelected = selectedSort === option.value;
                          return (
                            <button
                              key={option.value}
                              onClick={() => handleSortChange(option.value)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all ${
                                isSelected
                                  ? 'bg-[var(--primary)]/20 text-white'
                                  : 'text-muted-foreground hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              <Icon className={`w-4 h-4 ${isSelected ? 'text-[var(--primary)]' : ''}`} />
                              <span className="text-xs font-medium flex-1">{option.label}</span>
                              {isSelected && <Check className="w-4 h-4 text-[var(--primary)]" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Category Filters */}
                  <div className="flex gap-2 overflow-x-auto py-2 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
                    {categories.map((category) => (
                      <button
                        key={category}
                        onClick={() => handleCategoryChange(category)}
                        className={`
                          px-4 py-2 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap border
                          ${selectedCategory === category
                            ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-glow-sm"
                            : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10 hover:text-white"
                          }
                        `}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="flex justify-center py-20">
                <div className="relative">
                  <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-[var(--primary)]/30 rounded-full animate-spin" />
                  <div className="absolute inset-0 w-12 h-12 md:w-16 md:h-16 border-4 border-t-[var(--primary)] rounded-full animate-spin" />
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="text-center py-20">
                <div className="inline-block p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive mb-4 text-sm">
                  {error}
                </div>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Try Again
                </Button>
              </div>
            )}

            {/* Markets Grid */}
            {!isLoading && !error && markets.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {markets.map((market) => (
                  <MarketCard
                    key={market.id}
                    market={transformMarketForCard(market)}
                    onBetClick={handleBetClick}
                  />
                ))}
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && markets.length === 0 && (
              <div className="text-center py-20">
                <div className="text-6xl mb-4 opacity-20 grayscale">👾</div>
                <h3 className="text-xl font-bold text-muted-foreground mb-2">No Markets Found</h3>
                <p className="text-muted-foreground/60 text-sm">Try selecting a different category</p>
              </div>
            )}

            {/* Load More */}
            {markets.length >= limit && (
              <div className="mt-12 text-center">
                <Button 
                  variant="outline" 
                  onClick={handleLoadMore}
                  className="w-full md:w-auto px-8 py-6 text-sm md:text-lg border-white/10 hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all group"
                >
                  LOAD MORE MARKETS
                  <span className="ml-2 group-hover:translate-y-1 transition-transform">↓</span>
                </Button>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-12 bg-black/20 mb-20 md:mb-0">
        <div className="w-full max-w-[1800px] ml-auto mr-0 px-4 md:pl-6 md:pr-8 flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 font-bold text-xl tracking-tighter">
              <span className="text-[var(--primary)]">POLY</span>
              <span className="text-white">ACCA</span>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              © 2025 ALL RIGHTS RESERVED
            </span>
          </div>
          <div className="flex gap-6 md:gap-8">
            {["Terms", "Privacy", "Discord"].map((item) => (
              <a
                key={item}
                href="#"
                className="text-xs font-medium text-muted-foreground hover:text-[var(--color-gold)] transition-colors uppercase tracking-wider"
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* Accumulator Sidebar */}
      <AccumulatorSidebar ref={sidebarRef} />

      {/* Ring Collection Animation Effect */}
      <RingCollectionEffect animations={animations} />

      {/* Shared Acca Modal - shown when navigating to /acca/:chainId */}
      <SharedAccaModal
        chainId={chainId || null}
        isOpen={sharedAccaModalOpen}
        onClose={() => setSharedAccaModalOpen(false)}
      />
    </div>
  );
}

export default HomePage;
