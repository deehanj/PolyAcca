import React from "react";

interface RingParticleProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delay: number;
  onComplete: () => void;
}

export function RingParticle({
  startX,
  startY,
  endX,
  endY,
  delay,
  onComplete,
}: RingParticleProps) {
  // Calculate the animation path using CSS variables
  // We use a custom style object to bypass TypeScript checks for CSS variables
  const style = {
    "--start-x": `${startX}px`,
    "--start-y": `${startY}px`,
    "--end-x": `${endX}px`,
    "--end-y": `${endY}px`,
    left: `${startX}px`,
    top: `${startY}px`,
    animationDelay: `${delay}ms`,
  } as React.CSSProperties;

  return (
    <div
      className="ring-particle fixed z-[9999] w-6 h-6 pointer-events-none"
      style={style}
      onAnimationEnd={onComplete}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full ring-shimmer"
      >
        <circle
          cx="12"
          cy="12"
          r="8"
          stroke="url(#ring-particle-gradient)"
          strokeWidth="2.5"
          fill="none"
        />
        <circle
          cx="12"
          cy="12"
          r="5"
          stroke="url(#ring-particle-inner)"
          strokeWidth="1.5"
          fill="none"
          opacity="0.6"
        />
        <defs>
          <linearGradient
            id="ring-particle-gradient"
            x1="4"
            y1="4"
            x2="20"
            y2="20"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="var(--color-gold)" />
            <stop offset="0.5" stopColor="var(--color-gold-bright)" />
            <stop offset="1" stopColor="var(--color-gold)" />
          </linearGradient>
          <linearGradient
            id="ring-particle-inner"
            x1="7"
            y1="7"
            x2="17"
            y2="17"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="var(--color-gold-bright)" />
            <stop offset="1" stopColor="var(--color-gold-dark)" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
