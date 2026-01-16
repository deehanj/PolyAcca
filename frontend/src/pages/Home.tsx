import { useState, useRef } from "react";
import { Header } from "@/components/Header";
import { MarketCard, type Market } from "@/components/MarketCard";
import { AccumulatorSidebar } from "@/components/AccumulatorSidebar";
import { Button } from "@/components/ui/Button";
// import { FallingDots } from "@/components/FallingDots";
import { DotSphere } from "@/components/DotSphere";
import { RingCollectionEffect } from "@/components/RingCollectionEffect";
import { useMarkets } from "@/hooks/useMarkets";
import { useRingAnimation } from "@/hooks/useRingAnimation";
import type { Market as ApiMarket } from "@/types/market";

const categories = [
  "All",
  "Crypto",
  "Politics",
  "Sports",
  "Pop Culture",
  "Science",
];

// Format volume for display (e.g., 2400000 -> "$2.4M")
function formatVolume(volumeNum: number): string {
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
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [offset, setOffset] = useState(0);
  const limit = 12;
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { animations, triggerAnimation } = useRingAnimation();

  const { markets, isLoading, error, isFetching } = useMarkets({
    limit,
    offset,
    active: true,
    category: selectedCategory === "All" ? undefined : selectedCategory,
    order: "volume",
  });

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setOffset(0); // Reset pagination on category change
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

  return (
    <div className="min-h-screen pr-80 relative">
      {/* Matrix-style falling dots background - temporarily disabled */}
      {/* <div className="fixed inset-0 -z-10">
        <FallingDots columns={100} dotsPerColumn={30} />
      </div> */}

      <Header />

      {/* Hero Section - Left aligned with sphere */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-8">
            {/* Text group */}
            <div className="flex-1">
              <div className="mb-12">
                <h1 className="text-5xl md:text-6xl font-bold mb-4 text-gradient-accent">
                  Predict the Future
                </h1>
                <p className="text-xl text-muted-foreground max-w-xl">
                  Trade on real-world events. Chain bets together for multiplied returns.
                </p>
              </div>

              {/* CTA */}
              <Button size="lg">Connect Wallet</Button>
            </div>

            {/* DotSphere */}
            <div className="w-[400px] h-[400px] flex-shrink-0">
              <DotSphere
                pointCount={3000}
                radius={1.0}
                pointSize={1.5}
                rotationSpeed={0.3}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar - Separate section with background */}
      <section className="py-6 bg-card border-y border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-12">
            <StatBox label="Total Volume" value="$847M" />
            <div className="h-8 w-px bg-border" />
            <StatBox label="Active Markets" value="2,847" />
            <div className="h-8 w-px bg-border" />
            <StatBox label="Traders" value="184K" />
          </div>
        </div>
      </section>

      {/* Markets Section */}
      <section className="py-12">
        <div className="max-w-6xl mx-auto px-6">
          {/* Section Header + Category Filter on same row */}
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-semibold text-foreground">
              Live Markets
              {isFetching && !isLoading && (
                <span className="ml-2 text-sm text-muted-foreground">
                  Updating...
                </span>
              )}
            </h2>
            <div className="flex gap-2">
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={selectedCategory === category ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => handleCategoryChange(category)}
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="text-center py-12 text-destructive">
              Failed to load markets: {error}
            </div>
          )}

          {/* Markets Grid */}
          {!isLoading && !error && markets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
            <div className="text-center py-12 text-muted-foreground">
              No markets found for this category.
            </div>
          )}

          {/* Load More - Left aligned */}
          {markets.length >= limit && (
            <div className="mt-12">
              <Button variant="outline" onClick={handleLoadMore}>
                Load More Markets
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Footer - Two column layout */}
      <footer className="border-t border-border py-6 mt-12">
        <div className="max-w-6xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-primary">POLY</span>
              <span className="text-lg font-bold text-foreground">ACCA</span>
            </div>
            <span className="text-sm text-muted-foreground">
              © 2025 PolyAcca
            </span>
          </div>
          <div className="flex gap-6">
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </a>
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </a>
            <a
              href="#"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Discord
            </a>
          </div>
        </div>
      </footer>

      {/* Accumulator Sidebar */}
      <AccumulatorSidebar ref={sidebarRef} />

      {/* Ring Collection Animation Effect */}
      <RingCollectionEffect animations={animations} />
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-primary">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

export default HomePage;
