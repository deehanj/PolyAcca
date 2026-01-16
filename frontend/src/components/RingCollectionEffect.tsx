import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RingParticle } from "./RingParticle";
import type { RingAnimation } from "../hooks/useRingAnimation";

interface RingCollectionEffectProps {
  animations: RingAnimation[];
}

interface Particle {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delay: number;
}

export function RingCollectionEffect({ animations }: RingCollectionEffectProps) {
  const [particles, setParticles] = useState<Particle[]>([]);

  // Generate particles when new animations are added
  useEffect(() => {
    animations.forEach((animation) => {
      // Check if we already generated particles for this animation
      const existingParticles = particles.filter((p) =>
        p.id.startsWith(animation.id)
      );
      if (existingParticles.length > 0) return;

      // Generate 3-5 particles with randomness
      const particleCount = 3 + Math.floor(Math.random() * 3); // 3-5 particles
      const newParticles: Particle[] = [];

      for (let i = 0; i < particleCount; i++) {
        // Calculate center points
        const startCenterX = animation.sourceRect.left + animation.sourceRect.width / 2;
        const startCenterY = animation.sourceRect.top + animation.sourceRect.height / 2;
        const endCenterX = animation.targetRect.left + animation.targetRect.width / 2;
        const endCenterY = animation.targetRect.top + animation.targetRect.height / 2;

        // Add slight randomness to start position (±20px)
        const randomOffsetX = (Math.random() - 0.5) * 40;
        const randomOffsetY = (Math.random() - 0.5) * 40;

        newParticles.push({
          id: `${animation.id}-particle-${i}`,
          startX: startCenterX + randomOffsetX,
          startY: startCenterY + randomOffsetY,
          endX: endCenterX,
          endY: endCenterY,
          delay: i * 50, // Stagger by 50ms
        });
      }

      setParticles((prev) => [...prev, ...newParticles]);
    });
  }, [animations, particles]);

  const removeParticle = (id: string) => {
    setParticles((prev) => prev.filter((p) => p.id !== id));
  };

  // Render particles in a portal to ensure they're on top of everything
  return createPortal(
    <>
      {particles.map((particle) => (
        <RingParticle
          key={particle.id}
          startX={particle.startX}
          startY={particle.startY}
          endX={particle.endX}
          endY={particle.endY}
          delay={particle.delay}
          onComplete={() => removeParticle(particle.id)}
        />
      ))}
    </>,
    document.body
  );
}
