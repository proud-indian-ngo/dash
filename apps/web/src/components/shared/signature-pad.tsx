import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";

import {
  drawStrokes,
  type SignaturePoint,
  type SignatureStroke,
  toPadPoint,
} from "@/lib/signature-ink";

/**
 * A pad to sign on with a finger, pen or mouse. Strokes are controlled by
 * the caller as data (fractions of the pad), so a resize, a rotation or the
 * pad moving between a sheet and a dialog redraws them instead of losing
 * them. The pad keeps a 2:1 shape, draws on white with dark ink whatever
 * the theme (it stands for paper), and takes no pressure.
 *
 * While a finger is down the page doesn't scroll (`touch-action: none`) and
 * a surrounding drawer doesn't treat the stroke as a swipe to close.
 */
export function SignaturePad({
  ariaLabel,
  baselineEnd,
  baselineStart,
  className,
  fallback,
  hint,
  onStrokesChange,
  strokes,
}: {
  ariaLabel: string;
  /** Printed under the baseline, right: for example the date. */
  baselineEnd?: ReactNode;
  /** Printed under the baseline, left: for example the signer's name. */
  baselineStart?: ReactNode;
  className?: string;
  /** What to do instead, shown under the pad and read with it. */
  fallback?: string;
  /** Shown faintly until the first stroke, and read with the pad. */
  hint: string;
  onStrokesChange: (strokes: readonly SignatureStroke[]) => void;
  strokes: readonly SignatureStroke[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hintId = useId();
  const fallbackId = useId();
  const activePointer = useRef<number | null>(null);
  const current = useRef<SignaturePoint[]>([]);

  /** Redraws everything at the canvas's current size. */
  const redraw = useEventCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!(canvas && ctx)) {
      return;
    }
    const { height, width } = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.round(width * ratio));
    const pixelHeight = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const live = current.current.length > 0 ? [current.current] : [];
    drawStrokes(ctx, [...strokes, ...live], canvas.width, canvas.height);
  });

  useLayoutEffect(() => {
    redraw();
  }, [redraw, strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => redraw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const pointsOf = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const events =
      typeof event.nativeEvent.getCoalescedEvents === "function"
        ? event.nativeEvent.getCoalescedEvents()
        : [];
    const source = events.length > 0 ? events : [event.nativeEvent];
    return source.map((e) => toPadPoint(e.clientX, e.clientY, rect));
  };

  const handlePointerDown = useEventCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      // One pen at a time: a resting palm or second finger is ignored.
      if (activePointer.current !== null || event.button > 0) {
        return;
      }
      event.preventDefault();
      activePointer.current = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      current.current = pointsOf(event).slice(-1);
      redraw();
    }
  );

  const handlePointerMove = useEventCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (activePointer.current !== event.pointerId) {
        return;
      }
      event.preventDefault();
      current.current.push(...pointsOf(event));
      redraw();
    }
  );

  const finishStroke = useEventCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (activePointer.current !== event.pointerId) {
        return;
      }
      activePointer.current = null;
      const stroke = current.current;
      current.current = [];
      if (stroke.length > 0) {
        onStrokesChange([...strokes, stroke]);
      }
    }
  );

  const preventMenu = useEventCallback((event: { preventDefault(): void }) =>
    event.preventDefault()
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "relative mx-auto aspect-[2/1] w-full max-w-full overflow-hidden rounded-lg border bg-white select-none",
          className
        )}
        // Base UI drawers ignore swipes that start here.
        data-base-ui-swipe-ignore=""
      >
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-[30%] left-[6%] font-sans text-2xl leading-none text-neutral-400"
        >
          ×
        </span>
        <div
          aria-hidden
          className="pointer-events-none absolute right-[6%] bottom-[28%] left-[6%] border-b border-neutral-300"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute right-[6%] bottom-[10%] left-[6%] flex items-baseline justify-between gap-3 text-xs text-neutral-500"
        >
          <span className="truncate">{baselineStart}</span>
          <span className="shrink-0">{baselineEnd}</span>
        </div>
        <p
          className={cn(
            "pointer-events-none absolute inset-x-0 top-[18%] px-4 text-center text-sm text-neutral-400",
            strokes.length > 0 && "sr-only"
          )}
          id={hintId}
        >
          {hint}
        </p>
        <canvas
          aria-describedby={fallback ? `${hintId} ${fallbackId}` : hintId}
          aria-label={ariaLabel}
          className="absolute inset-0 size-full cursor-crosshair touch-none"
          onContextMenu={preventMenu}
          onLostPointerCapture={finishStroke}
          onPointerCancel={finishStroke}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          ref={canvasRef}
          role="img"
        />
      </div>
      {fallback ? (
        <p className="text-muted-foreground text-xs" id={fallbackId}>
          {fallback}
        </p>
      ) : null}
    </div>
  );
}
