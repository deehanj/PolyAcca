import { Header } from "./components/Header";
import { MarketCard, type Market } from "./components/MarketCard";
import { AccumulatorSidebar } from "./components/AccumulatorSidebar";
import { AccumulatorProvider } from "./context/AccumulatorContext";

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

function App() {
  return (
    <AccumulatorProvider>
      <div className="min-h-screen pr-80">
        <Header />

        {/* Hero Section */}
        <section className="relative py-16 overflow-hidden">
          {/* Grid background */}
          <div className="absolute inset-0 grid-bg opacity-30" />

          <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
            <h1
              className="text-5xl md:text-7xl font-bold mb-4"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <span className="neon-text-cyan">PREDICT</span>
              <span className="text-[#e0e0ff]"> THE </span>
              <span className="neon-text-magenta">FUTURE</span>
            </h1>
            <p className="text-xl text-[#8888aa] max-w-2xl mx-auto mb-8">
              Trade on the outcomes of real-world events. Build your accumulator
              for massive multiplied returns.
            </p>

            {/* Stats */}
            <div className="flex justify-center gap-12 mt-12">
              <StatBox label="Total Volume" value="$847M" />
              <StatBox label="Active Markets" value="2,847" />
              <StatBox label="Traders" value="184K" />
            </div>
          </div>

          {/* Decorative lines */}
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#ff00ff] to-transparent opacity-50" />
        </section>

        {/* Markets Section */}
        <section className="py-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-8">
              <h2
                className="text-2xl font-bold text-[#e0e0ff]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <span className="text-[#00f5ff]">//</span> LIVE MARKETS
              </h2>
              <p className="text-sm text-[#8888aa]">
                Click or drag Yes/No to add to your accumulator
              </p>
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
              {categories.map((category, index) => (
                <button
                  key={category}
                  className={`
                    px-4 py-2 rounded text-sm uppercase tracking-wider whitespace-nowrap
                    transition-all duration-300
                    ${
                      index === 0
                        ? "bg-[#00f5ff] text-[#0a0a0f] neon-border-cyan"
                        : "border border-[rgba(0,245,255,0.3)] text-[#8888aa] hover:text-[#00f5ff] hover:border-[#00f5ff]"
                    }
                  `}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Markets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {markets.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>

            {/* Load More */}
            <div className="text-center mt-12">
              <button
                className="retro-btn px-8 py-3 text-[#ff00ff] border-[#ff00ff] rounded hover:bg-[rgba(255,0,255,0.1)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Load More Markets
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-[rgba(0,245,255,0.2)] py-8 mt-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="text-xl font-bold text-[#00f5ff]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  POLY
                </span>
                <span
                  className="text-xl font-bold text-[#ff00ff]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  ACCA
                </span>
              </div>
              <p className="text-sm text-[#8888aa]">
                &copy; 2025 PolyAcca. The future is yours to predict.
              </p>
              <div className="flex gap-6">
                <a
                  href="#"
                  className="text-[#8888aa] hover:text-[#00f5ff] transition-colors text-sm"
                >
                  Terms
                </a>
                <a
                  href="#"
                  className="text-[#8888aa] hover:text-[#00f5ff] transition-colors text-sm"
                >
                  Privacy
                </a>
                <a
                  href="#"
                  className="text-[#8888aa] hover:text-[#00f5ff] transition-colors text-sm"
                >
                  Discord
                </a>
              </div>
            </div>
          </div>
        </footer>

        {/* Accumulator Sidebar */}
        <AccumulatorSidebar />
      </div>
    </AccumulatorProvider>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div
        className="text-3xl md:text-4xl font-bold neon-text-cyan mb-1"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {value}
      </div>
      <div
        className="text-sm text-[#8888aa] uppercase tracking-wider"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </div>
    </div>
  );
}

export default App;
