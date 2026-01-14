import { Header } from "@/components/Header";
import { MarketCard, type Market } from "@/components/MarketCard";
import { AccumulatorSidebar } from "@/components/AccumulatorSidebar";
import { Button } from "@/components/ui/Button";
// import { FallingDots } from "@/components/FallingDots";
import { DotSphere } from "@/components/DotSphere";

// Sample market data
const markets: Market[] = [
  {
    id: "1",
    question: "Will Bitcoin reach $150,000 by end of 2025?",
    category: "Crypto",
    volume: "$2.4M",
    yesPrice: 0.42,
    noPrice: 0.58,
    endDate: "Dec 31, 2025",
  },
  {
    id: "2",
    question: "Will AI pass the Turing Test by 2026?",
    category: "Technology",
    volume: "$890K",
    yesPrice: 0.67,
    noPrice: 0.33,
    endDate: "Dec 31, 2026",
  },
  {
    id: "3",
    question: "Will there be a manned Mars landing by 2030?",
    category: "Science",
    volume: "$1.2M",
    yesPrice: 0.23,
    noPrice: 0.77,
    endDate: "Dec 31, 2030",
  },
  {
    id: "4",
    question: "Will the next US President be a woman?",
    category: "Politics",
    volume: "$5.1M",
    yesPrice: 0.31,
    noPrice: 0.69,
    endDate: "Jan 20, 2029",
  },
  {
    id: "5",
    question: "Will electric vehicles outsell gas cars in US by 2027?",
    category: "Business",
    volume: "$780K",
    yesPrice: 0.54,
    noPrice: 0.46,
    endDate: "Dec 31, 2027",
  },
  {
    id: "6",
    question: "Will a new pandemic be declared by WHO in 2025?",
    category: "Health",
    volume: "$430K",
    yesPrice: 0.18,
    noPrice: 0.82,
    endDate: "Dec 31, 2025",
  },
  {
    id: "7",
    question: "Will Taylor Swift release a new album in 2025?",
    category: "Culture",
    volume: "$320K",
    yesPrice: 0.89,
    noPrice: 0.11,
    endDate: "Dec 31, 2025",
  },
  {
    id: "8",
    question: "Will the Lakers win the NBA Championship 2025?",
    category: "Sports",
    volume: "$1.8M",
    yesPrice: 0.15,
    noPrice: 0.85,
    endDate: "Jun 30, 2025",
  },
  {
    id: "9",
    question: "Will SpaceX Starship complete an orbital flight in 2025?",
    category: "Science",
    volume: "$1.5M",
    yesPrice: 0.78,
    noPrice: 0.22,
    endDate: "Dec 31, 2025",
  },
  {
    id: "10",
    question: "Will Ethereum flip Bitcoin by market cap in 2026?",
    category: "Crypto",
    volume: "$3.2M",
    yesPrice: 0.12,
    noPrice: 0.88,
    endDate: "Dec 31, 2026",
  },
  {
    id: "11",
    question: "Will Apple release AR glasses in 2025?",
    category: "Technology",
    volume: "$920K",
    yesPrice: 0.35,
    noPrice: 0.65,
    endDate: "Dec 31, 2025",
  },
  {
    id: "12",
    question: "Will Manchester City win the Premier League 2024/25?",
    category: "Sports",
    volume: "$2.1M",
    yesPrice: 0.45,
    noPrice: 0.55,
    endDate: "May 25, 2025",
  },
];

const categories = [
  "All",
  "Trending",
  "Crypto",
  "Politics",
  "Sports",
  "Technology",
  "Culture",
];

export function HomePage() {
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
            </h2>
            <div className="flex gap-2">
              {categories.map((category, index) => (
                <Button
                  key={category}
                  variant={index === 0 ? "primary" : "ghost"}
                  size="sm"
                >
                  {category}
                </Button>
              ))}
            </div>
          </div>

          {/* Markets Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {markets.map((market) => (
              <MarketCard key={market.id} market={market} />
            ))}
          </div>

          {/* Load More - Left aligned */}
          <div className="mt-12">
            <Button variant="outline">Load More Markets</Button>
          </div>
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
      <AccumulatorSidebar />
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
