import { useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { ChainCard } from "@/components/ChainCard";
import { Button } from "@/components/ui/Button";
import { useChains } from "@/hooks/useChains";
import { useAuth } from "@/hooks/useAuth";
import { TypewriterText } from "@/components/ui/TypewriterText";
import { Layers, ArrowLeft, RefreshCw, Wallet } from "lucide-react";
import type { ChainStatus } from "@/types/chain";

const statusFilters: { value: ChainStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'PENDING', label: 'Pending' },
];

export function MyChainsPage() {
  const [statusFilter, setStatusFilter] = useState<ChainStatus | 'ALL'>('ALL');
  const { chains, isLoading, error, refetch, isFetching } = useChains();
  const { isAuthenticated, isConnected } = useAuth();

  const filteredChains = statusFilter === 'ALL'
    ? chains
    : chains.filter(chain => chain.status === statusFilter);

  // Sort by created date, newest first
  const sortedChains = [...filteredChains].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="min-h-screen relative bg-[var(--background)] overflow-x-hidden">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-[var(--primary)]/5 to-transparent" />
        <div className="absolute -top-[200px] -right-[200px] w-[600px] h-[600px] bg-[var(--primary)]/10 rounded-full blur-[100px]" />
        <div className="absolute top-[20%] left-[10%] w-[300px] h-[300px] bg-[var(--primary-dark)]/5 rounded-full blur-[80px]" />
      </div>

      <Header />

      <main className="pb-20">
        {/* Page Header */}
        <section className="py-8 md:py-12">
          <div className="w-full max-w-[1400px] mx-auto px-4 md:px-8">
            {/* Back Link */}
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Markets
            </Link>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[var(--primary)]/10">
                  <Layers className="w-6 h-6 text-[var(--primary)]" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground uppercase tracking-wide">
                    <TypewriterText text="MY ACCUMULATORS" delay={500} hideCursorOnComplete />
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Track your active and past accumulator bets
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
                className="shrink-0"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Not Connected State */}
            {!isConnected && (
              <div className="text-center py-20">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--primary)]/10 mb-4">
                  <Wallet className="w-8 h-8 text-[var(--primary)]" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">Connect Your Wallet</h2>
                <p className="text-muted-foreground mb-6">
                  Connect your wallet to view your accumulators
                </p>
              </div>
            )}

            {/* Not Authenticated State */}
            {isConnected && !isAuthenticated && (
              <div className="text-center py-20">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-warning)]/10 mb-4">
                  <Wallet className="w-8 h-8 text-[var(--color-warning)]" />
                </div>
                <h2 className="text-xl font-bold text-foreground mb-2">Authentication Required</h2>
                <p className="text-muted-foreground mb-6">
                  Please sign in with your wallet to view your accumulators
                </p>
              </div>
            )}

            {/* Authenticated Content */}
            {isAuthenticated && (
              <>
                {/* Status Filter */}
                <div className="flex gap-2 overflow-x-auto py-2 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 mb-6">
                  {statusFilters.map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => setStatusFilter(filter.value)}
                      className={`
                        px-4 py-2 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap border
                        ${statusFilter === filter.value
                          ? "bg-[var(--primary)] text-white border-[var(--primary)] shadow-glow-sm"
                          : "bg-white/5 border-white/5 text-muted-foreground hover:bg-white/10 hover:text-white"
                        }
                      `}
                    >
                      {filter.label}
                    </button>
                  ))}
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
                    <Button variant="outline" onClick={() => refetch()}>
                      Try Again
                    </Button>
                  </div>
                )}

                {/* Chains Grid */}
                {!isLoading && !error && sortedChains.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                    {sortedChains.map((chain) => (
                      <ChainCard key={chain.chainId} chain={chain} />
                    ))}
                  </div>
                )}

                {/* Empty State */}
                {!isLoading && !error && sortedChains.length === 0 && (
                  <div className="text-center py-20">
                    <div className="text-6xl mb-4 opacity-20 grayscale">
                      <Layers className="w-16 h-16 mx-auto" />
                    </div>
                    <h3 className="text-xl font-bold text-muted-foreground mb-2">
                      {statusFilter === 'ALL' ? 'No Accumulators Yet' : `No ${statusFilter} Accumulators`}
                    </h3>
                    <p className="text-muted-foreground/60 text-sm mb-6">
                      {statusFilter === 'ALL'
                        ? "Start building your first accumulator from the markets page"
                        : "Try selecting a different filter"
                      }
                    </p>
                    {statusFilter === 'ALL' && (
                      <Link to="/">
                        <Button>
                          Browse Markets
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-12 bg-black/20">
        <div className="w-full max-w-[1400px] mx-auto px-4 md:px-8 flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
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
    </div>
  );
}

export default MyChainsPage;
