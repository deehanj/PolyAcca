import { useEffect, useRef } from "react";

interface Column {
  x: number;
  dots: ColumnDot[];
  speed: number;
}

interface ColumnDot {
  y: number;
  brightness: number;
  brightnessTarget: number;
  size: number;
}

interface FallingDotsProps {
  className?: string;
  columns?: number;
  dotsPerColumn?: number;
  baseColor?: string;
  glowColor?: string;
}

export function FallingDots({
  className = "",
  columns = 80,
  dotsPerColumn = 25,
  baseColor = "rgba(80, 80, 80, 0.5)",
  glowColor = "rgba(255, 255, 255, 0.95)",
}: FallingDotsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const columnsRef = useRef<Column[]>([]);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    // Set canvas size
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      width = rect.width;
      height = rect.height;
      initColumns();
    };

    // Initialize grid columns
    const initColumns = () => {
      columnsRef.current = [];
      const columnWidth = width / columns;

      for (let i = 0; i < columns; i++) {
        const dots: ColumnDot[] = [];
        const columnHeight = height / dotsPerColumn;

        for (let j = 0; j < dotsPerColumn; j++) {
          dots.push({
            y: j * columnHeight + Math.random() * columnHeight * 0.5,
            brightness: 0,
            brightnessTarget: 0,
            size: 1.5 + Math.random() * 1,
          });
        }

        columnsRef.current.push({
          x: i * columnWidth + columnWidth / 2,
          dots,
          speed: 0.3 + Math.random() * 0.5,
        });
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Randomly trigger columns to light up (cascade effect)
      if (Math.random() < 0.15) {
        const randomColumn =
          columnsRef.current[Math.floor(Math.random() * columnsRef.current.length)];
        if (randomColumn && randomColumn.dots.length > 0) {
          // Light up a random dot in the column
          const randomDotIndex = Math.floor(Math.random() * randomColumn.dots.length);
          randomColumn.dots[randomDotIndex].brightnessTarget = 1;

          // Cascade: also light up nearby dots with delay effect
          for (let i = 1; i <= 3; i++) {
            if (randomDotIndex + i < randomColumn.dots.length) {
              setTimeout(() => {
                if (randomColumn.dots[randomDotIndex + i]) {
                  randomColumn.dots[randomDotIndex + i].brightnessTarget = 1;
                }
              }, i * 50);
            }
          }
        }
      }

      // Update and draw columns
      columnsRef.current.forEach((column) => {
        column.dots.forEach((dot) => {
          // Move dot down
          dot.y += column.speed;

          // Reset to top when off screen
          if (dot.y > height + 10) {
            dot.y = -10;
            dot.brightness = 0;
            dot.brightnessTarget = 0;
          }

          // Animate brightness (fast attack, slow decay)
          if (dot.brightness < dot.brightnessTarget) {
            dot.brightness = Math.min(1, dot.brightness + 0.2);
          } else if (dot.brightness > 0) {
            dot.brightness = Math.max(0, dot.brightness - 0.015);
          }

          // Reset brightness target after reaching it
          if (dot.brightness >= 0.9 && dot.brightnessTarget === 1) {
            dot.brightnessTarget = 0;
          }

          // Draw dot
          ctx.beginPath();
          ctx.arc(column.x, dot.y, dot.size, 0, Math.PI * 2);

          if (dot.brightness > 0.05) {
            // Glowing white dot
            const alpha = 0.3 + dot.brightness * 0.7;
            ctx.fillStyle = glowColor;
            ctx.globalAlpha = alpha;

            // Glow effect
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 6 + dot.brightness * 10;
          } else {
            // Normal gray dot
            ctx.fillStyle = baseColor;
            ctx.globalAlpha = 0.4;
            ctx.shadowBlur = 0;
          }

          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 0;
        });
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationRef.current);
    };
  }, [columns, dotsPerColumn, baseColor, glowColor]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ opacity: 0.7 }}
    />
  );
}
