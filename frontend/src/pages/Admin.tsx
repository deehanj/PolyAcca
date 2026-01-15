/**
 * Admin Dashboard - Chain and bet monitoring via WebSocket
 */

import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, Users, Loader2, Wifi, WifiOff } from 'lucide-react';
import { Header } from '../components/Header';
import { useUserProfile } from '../hooks/useUserProfile';
import {
  useAdminWebSocket,
  type AdminChainData,
  type AdminBetData,
  type AdminMarketData,
} from '../hooks/useAdminWebSocket';

// Status badge colors
const statusColors: Record<string, string> = {
  // Chain/Position statuses
  ACTIVE: 'bg-blue-500/20 text-blue-400',
  WON: 'bg-green-500/20 text-green-400',
  LOST: 'bg-red-500/20 text-red-400',
  PENDING: 'bg-gray-500/20 text-gray-400',
  CANCELLED: 'bg-gray-500/20 text-gray-400',
  FAILED: 'bg-red-500/20 text-red-400',

  // Market statuses
  CLOSED: 'bg-yellow-500/20 text-yellow-400',
  RESOLVED: 'bg-green-500/20 text-green-400',

  // Bet lifecycle statuses
  QUEUED: 'bg-gray-500/20 text-gray-400',
  READY: 'bg-yellow-500/20 text-yellow-400',
  EXECUTING: 'bg-blue-500/20 text-blue-400',
  PLACED: 'bg-blue-500/20 text-blue-400',
  FILLED: 'bg-purple-500/20 text-purple-400',
  SETTLED: 'bg-green-500/20 text-green-400',

  // Bet failure statuses
  VOIDED: 'bg-gray-500/20 text-gray-400',
  INSUFFICIENT_LIQUIDITY: 'bg-orange-500/20 text-orange-400',
  NO_CREDENTIALS: 'bg-red-500/20 text-red-400',
  ORDER_REJECTED: 'bg-red-500/20 text-red-400',
  MARKET_CLOSED: 'bg-gray-500/20 text-gray-400',
  EXECUTION_ERROR: 'bg-red-500/20 text-red-400',
  UNKNOWN_FAILURE: 'bg-red-500/20 text-red-400',
};

function StatusBadge({ status }: { status: string }) {
  const colorClass = statusColors[status] || 'bg-gray-500/20 text-gray-400';
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatCurrency(value: string | undefined): string | null {
  if (!value) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  return `$${num.toLocaleString()}`;
}

// Connection status indicator
function ConnectionStatus({ isConnected }: { isConnected: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
      {isConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
      <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
    </div>
  );
}

// Chain list item
function ChainCard({ chain, isSelected, onSelect }: {
  chain: AdminChainData;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-lg border transition-colors ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 bg-card'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold truncate">{chain.name}</h3>
            <StatusBadge status={chain.status} />
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {chain.chain.length} legs | ${chain.totalValue.toFixed(2)} total value
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{chain.users.length}</span>
          {isSelected ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </div>
    </button>
  );
}

// Bet row in user's position
function BetRow({ bet }: { bet: AdminBetData }) {
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-2 px-3 text-sm">{bet.sequence}</td>
      <td className="py-2 px-3 text-sm">
        <div className="max-w-[200px] truncate" title={bet.marketQuestion}>
          {bet.marketQuestion}
        </div>
      </td>
      <td className="py-2 px-3 text-sm">
        <span className={bet.side === 'YES' ? 'text-green-400' : 'text-red-400'}>
          {bet.side}
        </span>
      </td>
      <td className="py-2 px-3 text-sm">${bet.stake}</td>
      <td className="py-2 px-3 text-sm">{bet.targetPrice}</td>
      <td className="py-2 px-3">
        <StatusBadge status={bet.status} />
      </td>
      <td className="py-2 px-3 text-sm">
        {bet.outcome && (
          <span className={bet.outcome === 'WON' ? 'text-green-400' : 'text-red-400'}>
            {bet.outcome}
          </span>
        )}
      </td>
    </tr>
  );
}

// Market card
function MarketCard({ market }: { market: AdminMarketData }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-4 mb-2">
        <h3 className="font-medium text-sm flex-1">{market.question}</h3>
        <StatusBadge status={market.status} />
      </div>
      {market.outcome && (
        <div className="mb-2">
          <span className="text-sm">
            Outcome:{' '}
            <span className={market.outcome === 'YES' ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
              {market.outcome}
            </span>
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <div>End: {formatDate(market.endDate)}</div>
        {market.resolutionDate && <div>Resolved: {formatDate(market.resolutionDate)}</div>}
        {formatCurrency(market.volume) && <div>Volume: {formatCurrency(market.volume)}</div>}
        {formatCurrency(market.liquidity) && <div>Liquidity: {formatCurrency(market.liquidity)}</div>}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        <code className="bg-muted px-1 rounded">{market.conditionId.slice(0, 16)}...</code>
      </div>
    </div>
  );
}

// Chain detail panel - shows data from the WebSocket state
function ChainDetailPanel({ chain }: { chain: AdminChainData }) {
  return (
    <div className="space-y-6">
      {/* Chain info */}
      <div className="p-4 rounded-lg bg-card border border-border">
        <h3 className="font-semibold mb-2">{chain.name}</h3>
        {chain.description && (
          <p className="text-sm text-muted-foreground mb-2">{chain.description}</p>
        )}
        <div className="text-sm text-muted-foreground">
          <p>Chain ID: <code className="text-xs bg-muted px-1 rounded">{chain.chainId}</code></p>
          <p>Created: {formatDate(chain.createdAt)}</p>
          <p>Legs: {chain.chain.join(' -> ')}</p>
        </div>
      </div>

      {/* Users and their bets */}
      <div className="space-y-4">
        <h4 className="font-semibold">User Positions ({chain.users.length})</h4>
        {chain.users.length === 0 ? (
          <p className="text-muted-foreground text-sm">No users on this chain yet.</p>
        ) : (
          chain.users.map((user) => (
            <div key={user.walletAddress} className="border border-border rounded-lg overflow-hidden">
              {/* User header */}
              <div className="p-3 bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <code className="text-sm">{formatAddress(user.walletAddress)}</code>
                  <StatusBadge status={user.status} />
                </div>
                <div className="text-sm text-muted-foreground">
                  ${user.initialStake} stake | ${user.currentValue} current | {user.completedLegs} legs done
                </div>
              </div>

              {/* Bets table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/20">
                    <tr>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">#</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Market</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Side</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Stake</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Price</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                      <th className="py-2 px-3 text-left text-xs font-medium text-muted-foreground">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {user.bets.map((bet) => (
                      <BetRow key={bet.betId} bet={bet} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type Tab = 'chains' | 'markets';

export function AdminPage() {
  const { isAdmin, isLoading: profileLoading } = useUserProfile();
  const { isConnected, chains, markets, error } = useAdminWebSocket();
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('chains');

  // Redirect non-admins
  if (!profileLoading && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // Find selected chain from WebSocket data
  const selectedChain = selectedChainId
    ? chains.find(c => c.chainId === selectedChainId)
    : null;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="p-2 rounded-lg border border-border hover:border-primary/50 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Admin Dashboard</h1>
              <p className="text-muted-foreground">Real-time chain and bet monitoring</p>
            </div>
          </div>
          <ConnectionStatus isConnected={isConnected} />
        </div>

        {/* Loading state - only when profile is loading */}
        {profileLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-12 text-red-400">
            {error}
          </div>
        )}

        {/* Waiting for connection */}
        {!profileLoading && !isConnected && !error && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Connecting to admin WebSocket...</p>
          </div>
        )}

        {/* Content */}
        {isConnected && (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-border">
              <button
                onClick={() => setActiveTab('chains')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'chains'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Chains ({chains.length})
              </button>
              <button
                onClick={() => setActiveTab('markets')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'markets'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Markets ({markets.length})
              </button>
            </div>

            {/* Chains Tab */}
            {activeTab === 'chains' && (
              <div className="grid lg:grid-cols-[350px_1fr] gap-6">
                {/* Chain list */}
                <div className="space-y-3">
                  {chains.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No chains created yet.</p>
                  ) : (
                    chains.map((chain) => (
                      <ChainCard
                        key={chain.chainId}
                        chain={chain}
                        isSelected={selectedChainId === chain.chainId}
                        onSelect={() => setSelectedChainId(
                          selectedChainId === chain.chainId ? null : chain.chainId
                        )}
                      />
                    ))
                  )}
                </div>

                {/* Detail panel */}
                <div className="lg:border-l lg:border-border lg:pl-6">
                  {selectedChain ? (
                    <ChainDetailPanel chain={selectedChain} />
                  ) : (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      Select a chain to view details
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Markets Tab */}
            {activeTab === 'markets' && (
              <div className="space-y-4">
                {markets.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No markets tracked yet.</p>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {markets.map((market) => (
                      <MarketCard key={market.conditionId} market={market} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
