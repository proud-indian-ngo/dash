import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  QrCodeIcon,
  RepeatIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { useRef, useState } from "react";

export interface ScanResult {
  /** Who or what was scanned; repeat camera frames of one subject are dropped. */
  subject: string;
  tone: "success" | "repeat" | "error";
  /** The person's name when known, else what happened. */
  title: string;
  /** One muted line: what happened, the yearly ID, the reason. */
  detail?: string;
}

const TONES = {
  success: {
    icon: CheckmarkCircle02Icon,
    card: "border-success/30 bg-success/10",
    iconClass: "text-success-foreground",
  },
  repeat: {
    icon: RepeatIcon,
    card: "border-warning/30 bg-warning/10 dark:bg-warning-foreground/10",
    iconClass: "text-warning-foreground",
  },
  error: {
    icon: Alert02Icon,
    card: "border-destructive/30 bg-destructive/10",
    iconClass: "text-destructive",
  },
} as const;

const VIBRATION: Record<ScanResult["tone"], number | number[]> = {
  success: 40,
  repeat: [30, 60, 30],
  error: [80, 60, 80],
};

/**
 * The last scan's outcome for a station. The camera reports the same QR many
 * times a second, so a camera outcome for the subject already on the card only
 * replaces it when the outcome changes, and never to say "already recorded"
 * right after recording it. Typed IDs always replace the card.
 */
export function useScanResult() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const shown = useRef<ScanResult | null>(null);
  const show = useEventCallback(
    (next: ScanResult, source: "camera" | "manual") => {
      if (
        source === "camera" &&
        shown.current?.subject === next.subject &&
        (next.tone === "repeat" || shown.current.tone === next.tone)
      )
        return;
      shown.current = next;
      setResult(next);
      navigator.vibrate?.(VIBRATION[next.tone]);
    }
  );
  return { result, show };
}

export function ScanResultCard({ result }: { result: ScanResult | null }) {
  const tone = result ? TONES[result.tone] : null;
  return (
    <section
      aria-label="Last scan"
      aria-live="polite"
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2.5",
        tone ? tone.card : "text-muted-foreground border-dashed"
      )}
    >
      <HugeiconsIcon
        aria-hidden="true"
        className={cn("size-5 shrink-0", tone?.iconClass)}
        icon={tone ? tone.icon : QrCodeIcon}
        strokeWidth={2}
      />
      {result ? (
        <div className="min-w-0">
          <p className="truncate font-medium">{result.title}</p>
          {result.detail ? (
            <p className="text-muted-foreground text-sm text-pretty">
              {result.detail}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm">The last scan shows here.</p>
      )}
    </section>
  );
}
