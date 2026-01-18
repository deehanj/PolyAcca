import { useEffect, useState, useRef } from "react";
import { useAccount, useBalance } from "wagmi";

export function RingCounter() {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({
    address: address,
  });
  const [shouldPulse, setShouldPulse] = useState(false);
  const prevBalanceRef = useRef<string | null>(null);

  // Format balance for display
  const formattedBalance = balance
    ? parseFloat(balance.formatted).toFixed(4)
    : "0";

  // Trigger pulse animation when balance changes
  useEffect(() => {
    const prevBalance = prevBalanceRef.current;
    prevBalanceRef.current = formattedBalance;

    if (prevBalance !== null && prevBalance !== formattedBalance) {
      // Intentional: trigger animation on value change
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShouldPulse(true);
      const timeout = setTimeout(() => setShouldPulse(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [formattedBalance]);

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border ${
        shouldPulse ? "ring-pulse" : ""
      }`}
    >
      {/* Ring Icon - SVG */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <circle
          cx="12"
          cy="12"
          r="8"
          stroke="url(#ring-gradient)"
          strokeWidth="3"
          fill="none"
        />
        <circle
          cx="12"
          cy="12"
          r="5"
          stroke="url(#ring-gradient-inner)"
          strokeWidth="2"
          fill="none"
          opacity="0.5"
        />
        <defs>
          <linearGradient
            id="ring-gradient"
            x1="4"
            y1="4"
            x2="20"
            y2="20"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="var(--color-gold)" />
            <stop offset="1" stopColor="var(--color-gold-bright)" />
          </linearGradient>
          <linearGradient
            id="ring-gradient-inner"
            x1="7"
            y1="7"
            x2="17"
            y2="17"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="var(--color-gold-bright)" />
            <stop offset="1" stopColor="var(--color-gold)" />
          </linearGradient>
        </defs>
      </svg>

      {/* Balance Text */}
      <span className="text-sm font-semibold text-gradient-gold">
        {isConnected ? formattedBalance : "0"}
      </span>
    </div>
  );
}
