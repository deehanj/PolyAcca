import { useState } from "react";
import { useAccumulator, type AccumulatorBet } from "../context/AccumulatorContext";
import type { Market } from "./MarketCard";

export function AccumulatorSidebar() {
  const { bets, addBet, removeBet, clearBets, totalOdds, potentialPayout } =
    useAccumulator();
  const [stake, setStake] = useState<string>("10");
  const [isDragOver, setIsDragOver] = useState(false);

  const stakeNum = parseFloat(stake) || 0;
  const payout = potentialPayout(stakeNum);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const { market, selection } = data as {
        market: Market;
        selection: "yes" | "no";
      };
      addBet(market, selection);
    } catch (err) {
      console.error("Failed to parse drop data", err);
    }
  };

  return (
    <aside
      className={`fixed right-0 top-0 h-full w-80 bg-[rgba(10,10,20,0.98)] border-l border-[rgba(0,245,255,0.3)] flex flex-col z-40 transition-all duration-300 ${
        isDragOver ? "border-l-2 border-l-[#00f5ff] shadow-[0_0_30px_rgba(0,245,255,0.3)]" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="p-4 border-b border-[rgba(0,245,255,0.2)]">
        <div className="flex items-center justify-between">
          <h2
            className="text-xl font-bold neon-text-cyan"
            style={{ fontFamily: "var(--font-display)" }}
          >
            ACCUMULATOR
          </h2>
          {bets.length > 0 && (
            <button
              onClick={clearBets}
              className="text-xs text-[#ff2a6d] hover:text-[#ff00ff] uppercase tracking-wider"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Clear All
            </button>
          )}
        </div>
        <p className="text-xs text-[#8888aa] mt-1">
          {bets.length} selection{bets.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Drop Zone / Bets List */}
      <div className="flex-1 overflow-y-auto p-4">
        {bets.length === 0 ? (
          <div
            className={`h-full flex flex-col items-center justify-center border-2 border-dashed rounded-lg transition-all ${
              isDragOver
                ? "border-[#00f5ff] bg-[rgba(0,245,255,0.1)]"
                : "border-[rgba(0,245,255,0.3)]"
            }`}
          >
            <div className="text-center p-6">
              <div className="text-4xl mb-4">
                <span className={isDragOver ? "neon-text-cyan" : "opacity-50"}>
                  +
                </span>
              </div>
              <p
                className="text-sm text-[#8888aa] uppercase tracking-wider"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Drag markets here
              </p>
              <p className="text-xs text-[#666] mt-2">
                or click Yes/No buttons to add
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {bets.map((bet) => (
              <BetItem key={bet.market.id} bet={bet} onRemove={removeBet} />
            ))}
          </div>
        )}
      </div>

      {/* Footer - Stake & Payout */}
      {bets.length > 0 && (
        <div className="p-4 border-t border-[rgba(0,245,255,0.2)] bg-[rgba(0,0,0,0.3)]">
          {/* Combined Odds */}
          <div className="flex items-center justify-between mb-4">
            <span
              className="text-sm text-[#8888aa] uppercase"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Combined Odds
            </span>
            <span
              className="text-xl font-bold neon-text-magenta"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {totalOdds.toFixed(2)}x
            </span>
          </div>

          {/* Stake Input */}
          <div className="mb-4">
            <label
              className="block text-xs text-[#8888aa] uppercase mb-2"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Stake Amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#00f5ff]">
                $
              </span>
              <input
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="w-full bg-[rgba(0,245,255,0.1)] border border-[rgba(0,245,255,0.3)] rounded px-6 py-2 text-[#e0e0ff] text-right text-lg font-bold focus:outline-none focus:border-[#00f5ff] focus:shadow-[0_0_10px_rgba(0,245,255,0.3)]"
                style={{ fontFamily: "var(--font-display)" }}
                min="0"
                step="1"
              />
            </div>
          </div>

          {/* Quick Stakes */}
          <div className="flex gap-2 mb-4">
            {[10, 25, 50, 100].map((amount) => (
              <button
                key={amount}
                onClick={() => setStake(amount.toString())}
                className="flex-1 py-1 text-xs border border-[rgba(0,245,255,0.3)] rounded text-[#00f5ff] hover:bg-[rgba(0,245,255,0.1)] transition-colors"
                style={{ fontFamily: "var(--font-display)" }}
              >
                ${amount}
              </button>
            ))}
          </div>

          {/* Potential Payout */}
          <div className="bg-[rgba(0,245,255,0.1)] border border-[rgba(0,245,255,0.3)] rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <span
                className="text-sm text-[#8888aa] uppercase"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Potential Payout
              </span>
              <span
                className="text-2xl font-bold neon-text-cyan"
                style={{ fontFamily: "var(--font-display)" }}
              >
                ${payout.toFixed(2)}
              </span>
            </div>
            <div className="text-xs text-[#39ff14] mt-1 text-right">
              +${(payout - stakeNum).toFixed(2)} profit
            </div>
          </div>

          {/* Place Bet Button */}
          <button
            className="w-full py-3 bg-gradient-to-r from-[#00f5ff] to-[#ff00ff] text-[#0a0a0f] font-bold uppercase tracking-wider rounded transition-all hover:shadow-[0_0_20px_rgba(0,245,255,0.5)] active:scale-[0.98]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Place Accumulator Bet
          </button>
        </div>
      )}
    </aside>
  );
}

function BetItem({
  bet,
  onRemove,
}: {
  bet: AccumulatorBet;
  onRemove: (id: string) => void;
}) {
  const isYes = bet.selection === "yes";

  return (
    <div className="bg-[rgba(20,10,40,0.8)] border border-[rgba(0,245,255,0.2)] rounded-lg p-3 relative group">
      {/* Remove Button */}
      <button
        onClick={() => onRemove(bet.market.id)}
        className="absolute -top-2 -right-2 w-5 h-5 bg-[#ff2a6d] text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#ff00ff]"
      >
        x
      </button>

      {/* Market Question */}
      <p className="text-sm text-[#e0e0ff] mb-2 pr-4 line-clamp-2">
        {bet.market.question}
      </p>

      {/* Selection & Odds */}
      <div className="flex items-center justify-between">
        <span
          className={`text-xs uppercase tracking-wider px-2 py-0.5 rounded ${
            isYes
              ? "bg-[rgba(57,255,20,0.2)] text-[#39ff14]"
              : "bg-[rgba(255,42,109,0.2)] text-[#ff2a6d]"
          }`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {bet.selection}
        </span>
        <span
          className="text-sm font-bold text-[#00f5ff]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {bet.odds.toFixed(2)}x
        </span>
      </div>
    </div>
  );
}
