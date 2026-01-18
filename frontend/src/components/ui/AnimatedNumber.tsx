import { useEffect, useState, useRef } from "react";

interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  duration?: number;
}

export function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 2,
  className = "",
  duration = 500, // ms
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef(value);
  const targetValueRef = useRef(value);
  const currentValueRef = useRef(value); // Track current value for animation start

  useEffect(() => {
    // Use ref to get current display value without adding it to dependencies
    startValueRef.current = currentValueRef.current;
    targetValueRef.current = value;
    startTimeRef.current = null;

    let animationFrameId: number;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const progress = timestamp - startTimeRef.current;
      const percentage = Math.min(progress / duration, 1);

      // Ease out quart
      const ease = 1 - Math.pow(1 - percentage, 4);

      const nextValue =
        startValueRef.current +
        (targetValueRef.current - startValueRef.current) * ease;

      currentValueRef.current = nextValue;
      setDisplayValue(nextValue);

      if (percentage < 1) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [value, duration]);

  return (
    <span className={className}>
      {prefix}
      {displayValue.toFixed(decimals)}
      {suffix}
    </span>
  );
}
