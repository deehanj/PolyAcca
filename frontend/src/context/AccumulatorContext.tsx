import {
  createContext,
  useContext,
  useState,
  useRef,
  type ReactNode,
} from "react";
import type { Market } from "../components/MarketCard";

export interface AccumulatorBet {
  market: Market;
  selection: "yes" | "no";
  odds: number;
}

interface AccumulatorContextType {
  bets: AccumulatorBet[];
  addBet: (market: Market, selection: "yes" | "no") => void;
  removeBet: (marketId: string) => void;
  clearBets: () => void;
  totalOdds: number;
  potentialPayout: (stake: number) => number;
  isInAccumulator: (marketId: string) => boolean;
  getSelection: (marketId: string) => "yes" | "no" | null;
  setOnBetAdded: (
    callback: ((market: Market, selection: "yes" | "no") => void) | null
  ) => void;
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

  const addBet = (market: Market, selection: "yes" | "no") => {
    // Trigger animation callback before state update
    if (onBetAddedRef.current) {
      onBetAddedRef.current(market, selection);
    }

    // Remove existing bet on same market if exists
    setBets((prev) => {
      const filtered = prev.filter((b) => b.market.id !== market.id);
      const odds = selection === "yes" ? market.yesPrice : market.noPrice;
      // Convert price to decimal odds (e.g., 0.42 -> 2.38)
      const decimalOdds = 1 / odds;
      return [...filtered, { market, selection, odds: decimalOdds }];
    });
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
      }}
    >
      {children}
    </AccumulatorContext.Provider>
  );
}

export function useAccumulator() {
  const context = useContext(AccumulatorContext);
  if (!context) {
    throw new Error("useAccumulator must be used within AccumulatorProvider");
  }
  return context;
}
