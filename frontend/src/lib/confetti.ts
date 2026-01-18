type ParticleOptions = {
  count?: number;
  colors?: string[];
  duration?: number;
  spread?: number;
  originY?: number;
};

const DEFAULT_COLORS = ["#1E90FF", "#FFD700", "#32CD32", "#FF4444"];

function createParticle(
  container: HTMLElement,
  color: string,
  size: number,
  x: number,
  y: number,
  rotation: number
) {
  const particle = document.createElement("div");
  particle.style.position = "absolute";
  particle.style.width = `${size}px`;
  particle.style.height = `${size}px`;
  particle.style.background = color;
  particle.style.borderRadius = "2px";
  // Initial transform
  particle.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg)`;
  particle.style.opacity = "0.9";
  particle.style.pointerEvents = "none";
  particle.style.willChange = "transform, opacity";
  container.appendChild(particle);
  return particle;
}

function emitParticles({
  count = 80,
  colors = DEFAULT_COLORS,
  duration = 2500,
  spread = 220,
  originY = 0.2,
}: ParticleOptions) {
  if (typeof window === "undefined") return;

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = "100%";
  container.style.height = "100%";
  container.style.pointerEvents = "none";
  container.style.zIndex = "9999";
  document.body.appendChild(container);

  const { innerWidth, innerHeight } = window;
  const originX = innerWidth / 2;
  const originYpx = innerHeight * originY;

  // Store state in memory (x, y, vx, vy, rotation) to avoid DOM reads
  const particles: {
    el: HTMLDivElement;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rotation: number;
    rotSpeed: number;
  }[] = [];

  for (let i = 0; i < count; i += 1) {
    const angle = ((Math.random() - 0.5) * spread * Math.PI) / 180;
    const speed = 6 + Math.random() * 8;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - (6 + Math.random() * 4);
    const size = 6 + Math.random() * 6;
    const color = colors[i % colors.length];
    const rotation = Math.random() * 360;
    
    const particle = createParticle(
      container,
      color,
      size,
      originX,
      originYpx,
      rotation
    ) as HTMLDivElement;

    particles.push({
      el: particle,
      x: originX,
      y: originYpx,
      vx,
      vy,
      rotation,
      rotSpeed: (Math.random() - 0.5) * 10
    });
  }

  let start: number | null = null;

  const animate = (time: number) => {
    if (start === null) start = time;
    const elapsed = time - start;
    const progress = Math.min(elapsed / duration, 1);

    particles.forEach((p) => {
      // Apply gravity
      const gravity = 0.25 + progress * 0.5; // Slightly reduced gravity progression
      p.vy += gravity;
      
      // Update position
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotSpeed;

      // Update DOM with transform instead of left/top for performance
      // translate3d forces GPU acceleration
      p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.rotation}deg)`;
      p.el.style.opacity = `${1 - Math.pow(progress, 3)}`; // Fade out cubic ease
    });

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      container.remove();
    }
  };

  requestAnimationFrame(animate);
}

export function triggerConfetti() {
  emitParticles({
    count: 90,
    colors: ["#1E90FF", "#FFD700", "#32CD32", "#FF4444"],
    duration: 2600,
    spread: 240,
    originY: 0.15,
  });
}

export function triggerMoneyRain() {
  emitParticles({
    count: 120,
    colors: ["#FFD700", "#FFEA00", "#DAA520"],
    duration: 3200,
    spread: 120,
    originY: 0.1,
  });
}
