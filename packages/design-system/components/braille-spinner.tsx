"use client";

import { useSyncExternalStore } from "react";
import { spinners } from "unicode-animations";
import { cn } from "@pi-dash/design-system/lib/utils";

const { frames } = spinners.braille;
const INTERVAL = 80;

let index = 0;
const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function startInterval() {
  intervalId = setInterval(() => {
    index = (index + 1) % frames.length;
    for (const l of listeners) l();
  }, INTERVAL);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mql =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : undefined;

  if (!intervalId && !mql?.matches) {
    startInterval();
  }

  const handleChange = (e: MediaQueryListEvent) => {
    if (e.matches && intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    } else if (!e.matches && !intervalId && listeners.size > 0) {
      startInterval();
    }
  };
  mql?.addEventListener("change", handleChange);

  return () => {
    mql?.removeEventListener("change", handleChange);
    listeners.delete(cb);
    if (listeners.size === 0 && intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot() {
  return frames[index];
}

function useBrailleSpinner() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

interface BrailleSpinnerProps {
  className?: string;
  label?: string;
  variant?: "standalone" | "inline";
}

export function BrailleSpinner({
  className,
  label = "Loading",
  variant = "standalone",
}: BrailleSpinnerProps) {
  const frame = useBrailleSpinner();

  if (variant === "inline") {
    return (
      <span aria-hidden="true" className={className}>
        {frame}
      </span>
    );
  }

  return (
    <output
      aria-live="polite"
      className={cn("flex items-center justify-center", className)}
      role="status"
    >
      <span aria-hidden="true" className="text-lg">
        {frame}
      </span>
      <span className="sr-only">{label}</span>
    </output>
  );
}
