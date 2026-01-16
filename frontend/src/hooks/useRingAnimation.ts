import { useCallback, useState } from "react";

export interface RingAnimation {
  id: string;
  sourceRect: DOMRect;
  targetRect: DOMRect;
  timestamp: number;
}

export function useRingAnimation() {
  const [animations, setAnimations] = useState<RingAnimation[]>([]);

  const triggerAnimation = useCallback(
    (sourceElement: HTMLElement, targetElement: HTMLElement) => {
      const sourceRect = sourceElement.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();

      const animation: RingAnimation = {
        id: `ring-${Date.now()}-${Math.random()}`,
        sourceRect,
        targetRect,
        timestamp: Date.now(),
      };

      setAnimations((prev) => [...prev, animation]);

      // Auto-remove after animation completes (600ms duration + 100ms buffer)
      setTimeout(() => {
        setAnimations((prev) => prev.filter((a) => a.id !== animation.id));
      }, 700);
    },
    []
  );

  const clearAnimations = useCallback(() => {
    setAnimations([]);
  }, []);

  return {
    animations,
    triggerAnimation,
    clearAnimations,
  };
}
