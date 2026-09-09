import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { log } from "evlog";
import { useEffect, useState } from "react";

const SCANNER_ELEMENT_ID = "kalakriti-event-day-qr";
// A replacement waits until the previous camera releases its tracks and DOM.
let previousSessionCleanup: Promise<void> = Promise.resolve();

interface EventDayQrScannerProps {
  onScan: (personQr: string) => void;
}

function startScannerSession(
  onScan: (personQr: string) => void,
  onStartFailed: () => void
) {
  const waitForPreviousSession = previousSessionCleanup;
  let releaseSession: () => void = () => undefined;
  previousSessionCleanup = new Promise<void>((resolve) => {
    releaseSession = resolve;
  });
  let cancelled = false;
  let scanner: {
    clear: () => Promise<void> | void;
    stop: () => Promise<void>;
  } | null = null;
  let cleanupPromise: Promise<void> | null = null;
  let startSettled = false;
  let startSucceeded = false;

  const cleanupScanner = async () => {
    if (!scanner || cleanupPromise) {
      await cleanupPromise;
      return;
    }

    const activeScanner = scanner;
    cleanupPromise = (async () => {
      if (startSucceeded) {
        try {
          await activeScanner.stop();
        } catch (error) {
          log.error({
            action: "stopQrScanner",
            component: "EventDayQrScanner",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      try {
        await activeScanner.clear();
      } catch (error) {
        log.error({
          action: "clearQrScanner",
          component: "EventDayQrScanner",
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (scanner === activeScanner) {
        scanner = null;
      }
    })();
    await cleanupPromise;
  };

  const startScanner = async () => {
    try {
      await waitForPreviousSession;
      if (cancelled) return;
      const { default: Html5Qrcode } =
        await import("@/lib/kalakriti-qr-decoder");
      if (cancelled) {
        return;
      }

      const nextScanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
      scanner = nextScanner;
      await nextScanner.start(
        { facingMode: "environment" },
        {
          aspectRatio: 1,
          fps: 10,
          qrbox: (width, height) => {
            const size = Math.floor(Math.min(width, height) * 0.8);
            return { height: size, width: size };
          },
        },
        (decodedText) => {
          if (!cancelled) {
            onScan(decodedText);
          }
        },
        () => {
          // Ignore scan misses.
        }
      );
      startSucceeded = true;
    } catch (error) {
      log.error({
        action: "startQrScanner",
        component: "EventDayQrScanner",
        error: error instanceof Error ? error.message : String(error),
      });
      if (!cancelled) {
        onStartFailed();
      }
    } finally {
      startSettled = true;
      if (cancelled || !startSucceeded) {
        await cleanupScanner();
        releaseSession();
      }
    }
  };

  void startScanner();

  return () => {
    cancelled = true;
    if (startSettled) {
      void cleanupScanner().then(releaseSession);
    }
  };
}

export function EventDayQrScanner({ onScan }: EventDayQrScannerProps) {
  const handleScan = useEventCallback(onScan);
  const [startFailed, setStartFailed] = useState(false);

  useEffect(
    () => startScannerSession(handleScan, () => setStartFailed(true)),
    [handleScan]
  );

  return (
    <div className="space-y-2">
      <div
        className={
          startFailed
            ? "hidden"
            : "bg-muted/30 aspect-square w-full overflow-hidden rounded-lg border"
        }
        id={SCANNER_ELEMENT_ID}
      />
      {startFailed ? (
        <p className="text-destructive text-sm" role="alert">
          Camera couldn't start. Enter the yearly ID manually instead.
        </p>
      ) : null}
    </div>
  );
}
