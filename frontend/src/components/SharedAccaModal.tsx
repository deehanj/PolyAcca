/**
 * SharedAccaModal - Modal for viewing and copying a shared accumulator
 *
 * Displayed when navigating to /acca/{chainId}
 * Shows chain details with legs and allows users to place the same bet
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogTitle, DialogDescription } from "./ui/Dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Badge } from "./ui/Badge";
import { AnimatedNumber } from "./ui/AnimatedNumber";
import { useAuth } from "../hooks/useAuth";
import { useTradingBalance } from "../context/TradingBalanceContext";
import { triggerConfetti, triggerMoneyRain } from "../lib/confetti";
import { Loader2, Trophy, X, Users, Zap } from "lucide-react";

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const CHAIN_IMAGES_DOMAIN = import.meta.env.VITE_CHAIN_IMAGES_DOMAIN || "";

interface ChainLeg {
  sequence: number;
  conditionId: string;
  tokenId: string;
  side: string;
  marketQuestion: string;
}

interface ChainData {
  chainId: string;
  name?: string;
  description?: string;
  imageKey?: string;
  chain: string[];
  legs?: ChainLeg[];
  totalValue: number;
  totalLegs: number;
  status: string;
  categories?: string[];
  firstMarketEndDate?: string;
}

interface SharedAccaModalProps {
  chainId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SharedAccaModal({ chainId, isOpen, onClose }: SharedAccaModalProps) {
  const navigate = useNavigate();
  const { isAuthenticated, isConnected, authenticate, getAuthHeaders } = useAuth();
  const { hasSufficientBalance, openDepositModal } = useTradingBalance();

  const [isLoading, setIsLoading] = useState(true);
  const [chainData, setChainData] = useState<ChainData | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Bet placement state
  const [stake, setStake] = useState<string>("10");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Calculate total odds from legs
  const calculateTotalOdds = (legs: ChainLeg[] | undefined): number => {
    if (!legs || legs.length === 0) return 1;
    // Each leg has implied odds of ~2x (simplified), actual odds would need price data
    // For display purposes, we'll estimate based on leg count
    return Math.pow(2, legs.length);
  };

  const stakeNum = parseFloat(stake) || 0;
  const totalOdds = calculateTotalOdds(chainData?.legs);
  const potentialPayout = stakeNum * totalOdds;

  // Fetch chain data
  const fetchChainData = useCallback(async () => {
    if (!chainId) return;

    setIsLoading(true);
    setError(null);

    try {
      // Use the public /chains/{id} endpoint
      const response = await fetch(`${API_URL}/chains/${chainId}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Chain not found");
      }

      setChainData(data.data || null);
      setParticipantCount(data.data?.participantCount || 0);
    } catch (err) {
      console.error("Failed to fetch chain:", err);
      setError(err instanceof Error ? err.message : "Failed to load chain");
    } finally {
      setIsLoading(false);
    }
  }, [chainId]);

  useEffect(() => {
    if (isOpen && chainId) {
      fetchChainData();
    } else {
      // Reset state when modal closes
      setChainData(null);
      setError(null);
      setStake("10");
      setSubmitError(null);
    }
  }, [isOpen, chainId, fetchChainData]);

  const handleClose = () => {
    onClose();
    // Navigate to home without the chainId
    navigate("/", { replace: true });
  };

  const handlePlaceBet = async () => {
    setSubmitError(null);

    if (!chainData?.legs || chainData.legs.length === 0) {
      setSubmitError("Chain data not available");
      return;
    }

    // Check if connected
    if (!isConnected) {
      setSubmitError("Please connect your wallet first");
      return;
    }

    // Authenticate if needed
    if (!isAuthenticated) {
      try {
        await authenticate();
      } catch {
        setSubmitError("Authentication failed");
        return;
      }
    }

    // Validate stake
    const stakeAmount = parseFloat(stake);
    if (isNaN(stakeAmount) || stakeAmount <= 0) {
      setSubmitError("Please enter a valid stake amount");
      return;
    }

    // Check if user has sufficient balance
    if (!hasSufficientBalance(stakeAmount)) {
      openDepositModal();
      return;
    }

    setIsSubmitting(true);

    try {
      // We need to fetch the full market data for each leg to get token IDs and prices
      // For now, we'll use the chain's legs which should have the necessary data
      const legs = chainData.legs.map((leg) => ({
        conditionId: leg.conditionId,
        tokenId: leg.tokenId,
        marketQuestion: leg.marketQuestion,
        side: leg.side as "YES" | "NO",
        // These fields need to be fetched from the market
        // For MVP, we'll attempt with what we have
        targetPrice: "0.50", // Default price, should be fetched from market
        questionId: leg.conditionId, // Placeholder
        yesTokenId: leg.side === "YES" ? leg.tokenId : "",
        noTokenId: leg.side === "NO" ? leg.tokenId : "",
        endDate: chainData.firstMarketEndDate || new Date().toISOString(),
      }));

      const response = await fetch(`${API_URL}/chains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          legs,
          initialStake: stakeAmount.toFixed(2),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to place bet");
      }

      // Success - show celebration
      triggerConfetti();
      if (stakeAmount >= 100) {
        setTimeout(triggerMoneyRain, 500);
      }

      // Close modal and navigate to my chains
      handleClose();
      navigate("/my-chains");

      console.log("Chain created successfully:", data.data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to place bet";
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={handleClose}>
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-gold)]" />
        </div>
      )}

      {error && !isLoading && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4 opacity-50">404</div>
          <h3 className="text-lg font-bold text-foreground mb-2">Chain Not Found</h3>
          <p className="text-sm text-muted-foreground mb-6">{error}</p>
          <Button variant="outline" onClick={handleClose}>
            Go Home
          </Button>
        </div>
      )}

      {!isLoading && !error && chainData && (
        <>
          {/* Header with image */}
          {chainData.imageKey && CHAIN_IMAGES_DOMAIN && (
            <div className="-mx-6 -mt-6 mb-4">
              <img
                src={`https://${CHAIN_IMAGES_DOMAIN}/${chainData.imageKey}`}
                alt={chainData.name || "Accumulator"}
                className="w-full h-40 object-cover"
              />
            </div>
          )}

          <DialogTitle>
            <span className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-[var(--color-gold)]" />
              {chainData.name || `${chainData.totalLegs}-Leg Accumulator`}
            </span>
          </DialogTitle>

          {chainData.description && (
            <DialogDescription>{chainData.description}</DialogDescription>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              {participantCount} participant{participantCount !== 1 ? "s" : ""}
            </span>
            <span>${chainData.totalValue?.toFixed(2) || "0.00"} total staked</span>
          </div>

          {/* Legs list */}
          <div className="space-y-2 mb-6 max-h-[200px] overflow-y-auto custom-scrollbar">
            {chainData.legs?.map((leg, index) => (
              <div
                key={`${leg.conditionId}-${index}`}
                className="bg-black/20 rounded-lg p-3 border border-white/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-foreground line-clamp-2 flex-1">
                    {leg.marketQuestion}
                  </p>
                  <Badge
                    variant="outline"
                    className={`shrink-0 border-0 text-[10px] uppercase font-bold px-2 py-0.5 ${
                      leg.side === "YES"
                        ? "bg-[var(--color-success)]/20 text-[var(--color-success)]"
                        : "bg-[var(--color-error)]/20 text-[var(--color-error)]"
                    }`}
                  >
                    {leg.side}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          {/* Stake input section */}
          <div className="space-y-4 border-t border-white/10 pt-4">
            {/* Total Odds */}
            <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-bold">
                {chainData.totalLegs} Legs
              </span>
              <span className="text-xl font-bold text-[var(--color-gold)] font-mono">
                <AnimatedNumber value={totalOdds} suffix="x" />
              </span>
            </div>

            {/* Stake Input */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                  Your Stake (USDC)
                </label>
              </div>
              <div className="relative group">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-[var(--color-gold)] transition-colors">
                  $
                </span>
                <Input
                  type="number"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="pl-7 text-right text-lg font-bold font-mono bg-black/20 border-white/10 focus:border-[var(--color-gold)] transition-colors h-12"
                  min="0"
                  step="1"
                />
              </div>
            </div>

            {/* Quick Stakes */}
            <div className="flex gap-2">
              {[10, 50, 100].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setStake(amount.toString())}
                  className="flex-1 py-1.5 text-xs font-mono font-medium rounded border border-white/10 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] hover:bg-[var(--color-gold)]/10 transition-all"
                >
                  ${amount}
                </button>
              ))}
            </div>

            {/* Potential Payout */}
            <div className="relative overflow-hidden bg-gradient-to-br from-[var(--color-gold)]/10 to-transparent border border-[var(--color-gold)]/30 rounded-xl p-4">
              <div className="absolute inset-0 bg-[var(--color-gold)]/5 animate-pulse" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[var(--color-gold)] uppercase tracking-wider font-bold flex items-center gap-1">
                    <Trophy className="w-3 h-3" />
                    Potential Win
                  </span>
                </div>
                <div className="text-3xl font-bold text-[var(--color-gold)] text-glow-gold font-mono tracking-tight">
                  <AnimatedNumber value={potentialPayout} prefix="$" />
                </div>
                <div className="text-[10px] text-[var(--color-success)] text-right font-mono font-bold">
                  +<AnimatedNumber value={potentialPayout - stakeNum} prefix="$" /> PROFIT
                </div>
              </div>
            </div>

            {/* Error Message */}
            {submitError && (
              <div className="text-xs text-destructive p-3 bg-destructive/10 rounded-lg border border-destructive/20 font-mono flex items-center gap-2">
                <X className="h-3 w-3" /> {submitError}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handlePlaceBet}
                disabled={isSubmitting || stakeNum <= 0}
                className="flex-1 bg-[var(--color-gold)] text-black hover:bg-[var(--color-gold-bright)] font-bold"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "PLACE BET"
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </Dialog>
  );
}
