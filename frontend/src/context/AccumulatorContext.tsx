import {
  createContext,
  useContext,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { Market } from "../components/MarketCard";

export interface AccumulatorBet {
  market: Market;
  selection: "yes" | "no";
  odds: number;
}

/**
 * Leg input format for chain creation API
 */
export interface CreateLegInput {
  conditionId: string;
  tokenId: string;
  marketQuestion: string;
  side: "YES" | "NO";
  targetPrice: string;
  questionId: string;
  yesTokenId: string;
  noTokenId: string;
  endDate: string;
  description?: string;
  category?: string;
}

export interface AddBetResult {
  success: boolean;
  error?: string;
  warning?: string;
  conflictingMarket?: string;
}

interface AccumulatorContextType {
  bets: AccumulatorBet[];
  addBet: (market: Market, selection: "yes" | "no") => AddBetResult;
  removeBet: (marketId: string) => void;
  clearBets: () => void;
  totalOdds: number;
  potentialPayout: (stake: number) => number;
  isInAccumulator: (marketId: string) => boolean;
  getSelection: (marketId: string) => "yes" | "no" | null;
  setOnBetAdded: (
    callback: ((market: Market, selection: "yes" | "no") => void) | null
  ) => void;
  /** Convert bets to API format for chain creation */
  getLegsForApi: () => CreateLegInput[];
  /** Check if a market can be added (no conflicting end dates) */
  canAddMarket: (market: Market) => AddBetResult;
}

const AccumulatorContext = createContext<AccumulatorContextType | null>(null);

export function AccumulatorProvider({ children }: { children: ReactNode }) {
  const [bets, setBets] = useState<AccumulatorBet[]>([]);
  const onBetAddedRef = useRef<
    ((market: Market, selection: "yes" | "no") => void) | null
  >(null);

  const setOnBetAdded = (
    callback: ((market: Market, selection: "yes" | "no") => void) | null
  ) => {
    onBetAddedRef.current = callback;
  };

  /**
   * Check if two end dates are on the same calendar day
   */
  const isSameDay = (date1: string, date2: string): boolean => {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return (
      d1.getUTCFullYear() === d2.getUTCFullYear() &&
      d1.getUTCMonth() === d2.getUTCMonth() &&
      d1.getUTCDate() === d2.getUTCDate()
    );
  };

  /**
   * Check if a market can be added to the accumulator
   * Returns warning if there's a same-day end date conflict
   */
  const canAddMarket = (market: Market): AddBetResult => {
    // Check if any existing bet has an end date on the same day
    const sameDayBet = bets.find(
      (b) =>
        b.market.id !== market.id &&
        isSameDay(b.market.endDateISO, market.endDateISO)
    );

    if (sameDayBet) {
      return {
        success: true,
        warning: "These markets may resolve on the same day. If they resolve simultaneously, the chain may not execute as expected.",
        conflictingMarket: sameDayBet.market.question,
      };
    }

    return { success: true };
  };

  const addBet = (market: Market, selection: "yes" | "no"): AddBetResult => {
    // If already in accumulator with same selection, just return success (no-op)
    const existingBet = bets.find((b) => b.market.id === market.id);
    if (existingBet && existingBet.selection === selection) {
      return { success: true };
    }

    // Check for same-day end dates only for new bets
    let result: AddBetResult = { success: true };
    if (!existingBet) {
      result = canAddMarket(market);
      // Show warning toast if there's a same-day conflict
      if (result.warning) {
        toast.warning(result.warning, {
          description: result.conflictingMarket
            ? `Same day as: "${result.conflictingMarket.slice(0, 50)}${result.conflictingMarket.length > 50 ? '...' : ''}"`
            : undefined,
        });
      }
    }

    // Trigger animation callback before state update
    if (onBetAddedRef.current) {
      onBetAddedRef.current(market, selection);
    }

    // Remove existing bet on same market if exists, then add new bet
    setBets((prev) => {
      const filtered = prev.filter((b) => b.market.id !== market.id);
      const odds = selection === "yes" ? market.yesPrice : market.noPrice;
      // Convert price to decimal odds (e.g., 0.42 -> 2.38)
      const decimalOdds = 1 / odds;
      return [...filtered, { market, selection, odds: decimalOdds }];
    });

    return result;
  };

  const removeBet = (marketId: string) => {
    setBets((prev) => prev.filter((b) => b.market.id !== marketId));
  };

  const clearBets = () => {
    setBets([]);
  };

  const totalOdds = bets.reduce((acc, bet) => acc * bet.odds, 1);

  const potentialPayout = (stake: number) => {
    return stake * totalOdds;
  };

  const isInAccumulator = (marketId: string) => {
    return bets.some((b) => b.market.id === marketId);
  };

  const getSelection = (marketId: string): "yes" | "no" | null => {
    const bet = bets.find((b) => b.market.id === marketId);
    return bet ? bet.selection : null;
  };

  /**
   * Convert bets to the API format required for chain creation
   */
  const getLegsForApi = (): CreateLegInput[] => {
    return bets.map((bet) => {
      const isYes = bet.selection === "yes";
      const price = isYes ? bet.market.yesPrice : bet.market.noPrice;

      return {
        conditionId: bet.market.conditionId,
        tokenId: isYes ? bet.market.yesTokenId : bet.market.noTokenId,
        marketQuestion: bet.market.question,
        side: isYes ? "YES" : "NO",
        targetPrice: price.toFixed(4),
        // Market storage fields
        questionId: bet.market.id, // market.id is the questionId
        yesTokenId: bet.market.yesTokenId,
        noTokenId: bet.market.noTokenId,
        endDate: bet.market.endDateISO,
        description: bet.market.description,
        category: bet.market.category,
      };
    });
  };

  return (
    <AccumulatorContext.Provider
      value={{
        bets,
        addBet,
        removeBet,
        clearBets,
        totalOdds,
        potentialPayout,
        isInAccumulator,
        getSelection,
        setOnBetAdded,
        getLegsForApi,
        canAddMarket,
      }}
    >
      {children}
    </AccumulatorContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Context pattern: Provider + hook must be co-located
export function useAccumulator() {
  const context = useContext(AccumulatorContext);
  if (!context) {
    throw new Error("useAccumulator must be used within AccumulatorProvider");
  }
  return context;
}
