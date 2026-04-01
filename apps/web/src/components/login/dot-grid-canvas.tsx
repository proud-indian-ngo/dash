import { useEffect, useRef } from "react";

interface Dot {
  radius: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
}

const DOT_DENSITY = 8000;
const MIN_DOTS = 30;
const MAX_DOTS = 80;
const CONNECTION_DISTANCE = 120;
const CONNECTION_OPACITY = 0.12;
const DOT_MIN_OPACITY = 0.3;
const DOT_MAX_OPACITY = 0.5;
const DOT_MIN_RADIUS = 2;
const DOT_MAX_RADIUS = 3.5;
const DOT_MAX_SPEED = 0.3;
const RGB_PATTERN = /(\d+),\s*(\d+),\s*(\d+)/;
const FALLBACK_RGB = "79, 195, 247";

function createDots(width: number, height: number): Dot[] {
  const area = width * height;
  const count = Math.min(
    MAX_DOTS,
    Math.max(MIN_DOTS, Math.floor(area / DOT_DENSITY))
  );
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 2 * DOT_MAX_SPEED,
    vy: (Math.random() - 0.5) * 2 * DOT_MAX_SPEED,
    radius: DOT_MIN_RADIUS + Math.random() * (DOT_MAX_RADIUS - DOT_MIN_RADIUS),
  }));
}

function resolveCssColor(el: HTMLElement): string {
  const raw = getComputedStyle(el).getPropertyValue("--foreground").trim();
  if (!raw) {
    return FALLBACK_RGB;
  }
  const temp = document.createElement("div");
  temp.style.color = raw;
  temp.style.display = "none";
  document.body.appendChild(temp);
  const computed = getComputedStyle(temp).color;
  document.body.removeChild(temp);
  const match = RGB_PATTERN.exec(computed);
  return match ? `${match[1]}, ${match[2]}, ${match[3]}` : FALLBACK_RGB;
}

function dotOpacity(dot: Dot): number {
  return (
    DOT_MIN_OPACITY +
    ((dot.radius - DOT_MIN_RADIUS) / (DOT_MAX_RADIUS - DOT_MIN_RADIUS)) *
      (DOT_MAX_OPACITY - DOT_MIN_OPACITY)
  );
}

function drawDots(
  ctx: CanvasRenderingContext2D,
  dots: Dot[],
  rgb: string
): void {
  for (const dot of dots) {
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${rgb}, ${dotOpacity(dot)})`;
    ctx.fill();
  }
}

function drawConnections(
  ctx: CanvasRenderingContext2D,
  dots: Dot[],
  rgb: string
): void {
  ctx.lineWidth = 0.5;
  for (let i = 0; i < dots.length; i++) {
    const dotA = dots[i];
    if (!dotA) {
      continue;
    }
    for (let j = i + 1; j < dots.length; j++) {
      const dotB = dots[j];
      if (!dotB) {
        continue;
      }
      const dx = dotA.x - dotB.x;
      const dy = dotA.y - dotB.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CONNECTION_DISTANCE) {
        const opacity = CONNECTION_OPACITY * (1 - dist / CONNECTION_DISTANCE);
        ctx.beginPath();
        ctx.moveTo(dotA.x, dotA.y);
        ctx.lineTo(dotB.x, dotB.y);
        ctx.strokeStyle = `rgba(${rgb}, ${opacity})`;
        ctx.stroke();
      }
    }
  }
}

function updatePositions(dots: Dot[], width: number, height: number): void {
  for (const dot of dots) {
    dot.x += dot.vx;
    dot.y += dot.vy;
    if (dot.x < -10) {
      dot.x = width + 10;
    } else if (dot.x > width + 10) {
      dot.x = -10;
    }
    if (dot.y < -10) {
      dot.y = height + 10;
    } else if (dot.y > height + 10) {
      dot.y = -10;
    }
  }
}

export function DotGridCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    let animationId = 0;
    let dots: Dot[] = [];
    let rgb = resolveCssColor(canvas);

    function setCanvasSize() {
      if (!canvas) {
        return;
      }
      const parent = canvas.parentElement;
      if (!parent) {
        return;
      }
      const { width, height } = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx?.scale(dpr, dpr);
      dots = createDots(width, height);
    }

    function drawStatic() {
      if (!(canvas && ctx)) {
        return;
      }
      const parent = canvas.parentElement;
      if (!parent) {
        return;
      }
      const { width, height } = parent.getBoundingClientRect();
      if (width === 0 || height === 0) {
        return;
      }
      ctx.clearRect(0, 0, width, height);
      drawDots(ctx, dots, rgb);
    }

    function animate() {
      if (!(canvas && ctx)) {
        return;
      }
      const parent = canvas.parentElement;
      if (!parent) {
        return;
      }
      const { width, height } = parent.getBoundingClientRect();
      if (width === 0 || height === 0) {
        animationId = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, width, height);
      updatePositions(dots, width, height);
      drawConnections(ctx, dots, rgb);
      drawDots(ctx, dots, rgb);
      animationId = requestAnimationFrame(animate);
    }

    setCanvasSize();

    if (prefersReducedMotion.matches) {
      drawStatic();
    } else {
      animationId = requestAnimationFrame(animate);
    }

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(animationId);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      setCanvasSize();
      if (prefersReducedMotion.matches) {
        drawStatic();
      } else {
        animationId = requestAnimationFrame(animate);
      }
    });
    if (canvas.parentElement) {
      ro.observe(canvas.parentElement);
    }

    const themeObserver = new MutationObserver(() => {
      rgb = resolveCssColor(canvas);
      if (prefersReducedMotion.matches) {
        drawStatic();
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const motionHandler = (e: MediaQueryListEvent) => {
      if (e.matches) {
        cancelAnimationFrame(animationId);
        drawStatic();
      } else {
        animationId = requestAnimationFrame(animate);
      }
    };
    prefersReducedMotion.addEventListener("change", motionHandler);

    return () => {
      cancelAnimationFrame(animationId);
      ro.disconnect();
      themeObserver.disconnect();
      prefersReducedMotion.removeEventListener("change", motionHandler);
    };
  }, []);

  return (
    <canvas
      aria-hidden
      className="pointer-events-none absolute inset-0"
      ref={canvasRef}
      tabIndex={-1}
    />
  );
}
