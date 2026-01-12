import { useAccumulator } from "../context/AccumulatorContext";

export interface Market {
  id: string;
  question: string;
  category: string;
  volume: string;
  yesPrice: number;
  noPrice: number;
  endDate: string;
  image?: string;
}

interface MarketCardProps {
  market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
  const { addBet, isInAccumulator, getSelection } = useAccumulator();
  const yesPercentage = Math.round(market.yesPrice * 100);
  const noPercentage = Math.round(market.noPrice * 100);
  const inAccumulator = isInAccumulator(market.id);
  const currentSelection = getSelection(market.id);

  const handleDragStart = (e: React.DragEvent, selection: "yes" | "no") => {
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ market, selection })
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleYesClick = () => {
    addBet(market, "yes");
  };

  const handleNoClick = () => {
    addBet(market, "no");
  };

  return (
    <div
      className={`retro-card rounded-lg p-4 cursor-pointer group relative ${
        inAccumulator ? "ring-2 ring-[#00f5ff] ring-opacity-50" : ""
      }`}
    >
      {/* In Accumulator Badge */}
      {inAccumulator && (
        <div className="absolute -top-2 -right-2 bg-[#00f5ff] text-[#0a0a0f] text-xs px-2 py-0.5 rounded-full font-bold uppercase"
          style={{ fontFamily: "var(--font-display)" }}>
          In Acca
        </div>
      )}

      {/* Category & Volume */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs uppercase tracking-wider text-[#b026ff]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {market.category}
        </span>
        <span className="text-xs text-[#8888aa]">
          Vol: <span className="text-[#00f5ff]">{market.volume}</span>
        </span>
      </div>

      {/* Question */}
      <h3
        className="text-lg font-semibold mb-4 text-[#e0e0ff] group-hover:text-[#00f5ff] transition-colors leading-tight"
        style={{ fontFamily: "var(--font-body)" }}
      >
        {market.question}
      </h3>

      {/* Progress Bar */}
      <div className="relative h-2 bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden mb-4">
        <div
          className="absolute left-0 top-0 h-full progress-yes rounded-l-full"
          style={{ width: `${yesPercentage}%` }}
        />
        <div
          className="absolute right-0 top-0 h-full progress-no rounded-r-full"
          style={{ width: `${noPercentage}%` }}
        />
      </div>

      {/* Drag hint */}
      <div className="text-center mb-2">
        <span className="text-[10px] text-[#8888aa] uppercase tracking-widest"
          style={{ fontFamily: "var(--font-display)" }}>
          Drag or click to add to accumulator
        </span>
      </div>

      {/* Yes/No Buttons */}
      <div className="flex gap-3">
        <button
          draggable
          onDragStart={(e) => handleDragStart(e, "yes")}
          onClick={handleYesClick}
          className={`flex-1 py-2 px-3 rounded border transition-all group/btn ${
            currentSelection === "yes"
              ? "border-[#39ff14] bg-[rgba(57,255,20,0.4)] shadow-[0_0_15px_rgba(57,255,20,0.5)]"
              : "border-[#39ff14] bg-[rgba(57,255,20,0.1)] hover:bg-[rgba(57,255,20,0.2)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-xs uppercase tracking-wider text-[#39ff14]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Yes
            </span>
            <span
              className="text-lg font-bold text-[#39ff14] group-hover/btn:neon-text"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {yesPercentage}c
            </span>
          </div>
        </button>

        <button
          draggable
          onDragStart={(e) => handleDragStart(e, "no")}
          onClick={handleNoClick}
          className={`flex-1 py-2 px-3 rounded border transition-all group/btn ${
            currentSelection === "no"
              ? "border-[#ff2a6d] bg-[rgba(255,42,109,0.4)] shadow-[0_0_15px_rgba(255,42,109,0.5)]"
              : "border-[#ff2a6d] bg-[rgba(255,42,109,0.1)] hover:bg-[rgba(255,42,109,0.2)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-xs uppercase tracking-wider text-[#ff2a6d]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              No
            </span>
            <span
              className="text-lg font-bold text-[#ff2a6d] group-hover/btn:neon-text"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {noPercentage}c
            </span>
          </div>
        </button>
      </div>

      {/* End Date */}
      <div className="mt-3 pt-3 border-t border-[rgba(0,245,255,0.1)]">
        <span className="text-xs text-[#8888aa]">
          Ends: <span className="text-[#ff00ff]">{market.endDate}</span>
        </span>
      </div>
    </div>
  );
}
