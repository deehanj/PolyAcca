import { BarChart3, Activity, Users, TrendingUp, TrendingDown, Zap } from "lucide-react";

interface TickerItem {
  label: string;
  value: string;
  icon: React.ReactNode;
  change?: string;
  isPositive?: boolean;
}

const tickerItems: TickerItem[] = [
  { label: "Total Volume", value: "$847M", icon: <BarChart3 className="w-3 h-3" />, change: "+12.4%", isPositive: true },
  { label: "Active Markets", value: "2,847", icon: <Activity className="w-3 h-3" /> },
  { label: "Traders", value: "184K", icon: <Users className="w-3 h-3" />, change: "+5.2%", isPositive: true },
  { label: "24h Volume", value: "$24.7M", icon: <Zap className="w-3 h-3" />, change: "+8.1%", isPositive: true },
  { label: "BTC $100K", value: "42¢", icon: <TrendingUp className="w-3 h-3" />, change: "-2.3%", isPositive: false },
  { label: "ETH $5K", value: "31¢", icon: <TrendingDown className="w-3 h-3" />, change: "+1.8%", isPositive: true },
];

export function StatsTicker() {
  // Duplicate items for seamless loop
  const items = [...tickerItems, ...tickerItems, ...tickerItems];

  return (
    <div className="w-full">
      <div className="relative w-full overflow-hidden bg-muted/50 border-b border-border">
        {/* Gradient masks for smooth fade effect */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-muted/80 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-muted/80 to-transparent z-10 pointer-events-none" />

        {/* Scrolling content */}
        <div className="animate-ticker flex items-center gap-8 py-2 px-4 whitespace-nowrap">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2 px-2">
              <span className="text-muted-foreground">{item.icon}</span>
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{item.label}</span>
              <span className="text-sm font-mono font-bold text-foreground">{item.value}</span>
              {item.change && (
                <span className={`text-[10px] font-mono ${item.isPositive ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                  {item.change}
                </span>
              )}
              <span className="text-border ml-4">|</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
