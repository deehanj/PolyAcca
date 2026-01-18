import { useState } from "react";
import { Badge } from "./ui/Badge";
import { ChevronDown, ChevronUp, Trophy, XCircle, Clock, AlertCircle, Loader2 } from "lucide-react";
import type { UserChainSummary, UserChainDetail } from "../types/chain";
import { useChainDetail } from "../hooks/useChains";

interface ChainCardProps {
  chain: UserChainSummary;
}

const statusConfig = {
  PENDING: {
    variant: "warning" as const,
    icon: Clock,
    label: "Pending",
  },
  ACTIVE: {
    variant: "warning" as const,
    icon: Loader2,
    label: "Active",
  },
  WON: {
    variant: "success" as const,
    icon: Trophy,
    label: "Won",
  },
  LOST: {
    variant: "error" as const,
    icon: XCircle,
    label: "Lost",
  },
  CANCELLED: {
    variant: "outline" as const,
    icon: XCircle,
    label: "Cancelled",
  },
  FAILED: {
    variant: "error" as const,
    icon: AlertCircle,
    label: "Failed",
  },
};

export function ChainCard({ chain }: ChainCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { chain: chainDetail, isLoading: isLoadingDetail } = useChainDetail(
    isExpanded ? chain.chainId : undefined
  );

  const status = statusConfig[chain.status] || statusConfig.PENDING;
  const StatusIcon = status.icon;
  const progressPercentage = (chain.completedLegs / chain.totalLegs) * 100;

  const createdDate = new Date(chain.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Get first market question for display
  const displayName = chainDetail?.chainDefinition?.legs?.[0]?.marketQuestion ||
    `Accumulator (${chain.totalLegs} legs)`;

  return (
    <div
      className={`
        glass-card rounded-xl overflow-hidden
        transition-all duration-300 ease-[var(--ease-default)]
        hover:border-[var(--color-gold)]/50 hover:shadow-glow-gold-sm
        ${chain.status === 'WON' ? 'ring-1 ring-[var(--color-success)]/30' : ''}
        ${chain.status === 'LOST' || chain.status === 'FAILED' ? 'ring-1 ring-[var(--color-error)]/30' : ''}
      `}
    >
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-10 grid-bg pointer-events-none" />

      {/* Main Content */}
      <div className="p-4 md:p-5 relative z-10">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="text-sm md:text-base font-medium text-foreground leading-snug line-clamp-2 flex-1">
            {displayName}
          </h3>
          <Badge variant={status.variant} size="sm" className="flex items-center gap-1 shrink-0">
            <StatusIcon className={`w-3 h-3 ${chain.status === 'ACTIVE' ? 'animate-spin' : ''}`} />
            {status.label}
          </Badge>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground font-mono">Progress</span>
            <span className="text-xs font-mono text-foreground">
              {chain.completedLegs}/{chain.totalLegs} legs
            </span>
          </div>
          <div className="relative h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                chain.status === 'WON'
                  ? 'bg-[var(--color-success)]'
                  : chain.status === 'LOST' || chain.status === 'FAILED'
                  ? 'bg-[var(--color-error)]'
                  : 'bg-[var(--color-gold)]'
              }`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <span className="text-[10px] uppercase text-muted-foreground font-mono tracking-wide block mb-1">
              Stake
            </span>
            <span className="text-lg font-mono font-bold text-foreground">
              ${parseFloat(chain.initialStake).toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase text-muted-foreground font-mono tracking-wide block mb-1">
              {chain.status === 'WON' ? 'Payout' : 'Current Value'}
            </span>
            <span className={`text-lg font-mono font-bold ${
              chain.status === 'WON'
                ? 'text-[var(--color-success)]'
                : chain.status === 'LOST' || chain.status === 'FAILED'
                ? 'text-[var(--color-error)]'
                : 'text-foreground'
            }`}>
              ${parseFloat(chain.currentValue).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Footer Row */}
        <div className="flex items-center justify-between pt-3 border-t border-white/5">
          <span className="text-[10px] uppercase text-muted-foreground font-mono tracking-wide">
            {createdDate}
          </span>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[var(--color-gold)] transition-colors"
          >
            {isExpanded ? 'Hide' : 'View'} Details
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-white/5 bg-black/20 p-4 md:p-5">
          {isLoadingDetail ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : chainDetail ? (
            <ChainDetailView detail={chainDetail} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Failed to load details
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ChainDetailView({ detail }: { detail: UserChainDetail }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs uppercase text-muted-foreground font-mono tracking-wide mb-2">
        Bet Legs
      </h4>
      {detail.bets.map((bet, index) => (
        <div
          key={index}
          className={`
            p-3 rounded-lg border transition-colors
            ${bet.outcome === 'WIN'
              ? 'bg-[var(--color-success)]/5 border-[var(--color-success)]/20'
              : bet.outcome === 'LOSS'
              ? 'bg-[var(--color-error)]/5 border-[var(--color-error)]/20'
              : 'bg-white/5 border-white/10'
            }
          `}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">#{bet.sequence}</span>
              <span className="text-sm text-foreground line-clamp-1">{bet.marketQuestion}</span>
            </div>
            <Badge
              variant={bet.side === 'YES' ? 'success' : 'error'}
              size="sm"
            >
              {bet.side}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-mono">
              Stake: ${parseFloat(bet.stake).toFixed(2)}
            </span>
            <span className={`font-mono ${
              bet.outcome === 'WIN'
                ? 'text-[var(--color-success)]'
                : bet.outcome === 'LOSS'
                ? 'text-[var(--color-error)]'
                : 'text-muted-foreground'
            }`}>
              {bet.outcome || bet.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
