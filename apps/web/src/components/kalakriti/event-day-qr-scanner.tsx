import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { log } from "evlog";
import { useEffect, useState } from "react";

const SCANNER_ELEMENT_ID = "kalakriti-event-day-qr";

interface EventDayQrScannerProps {
  onScan: (token: string) => void;
}

export function EventDayQrScanner({ onScan }: EventDayQrScannerProps) {
  const handleScan = useEventCallback(onScan);
  const [startFailed, setStartFailed] = useState(false);

  useEffect(() => {
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
        const { Html5Qrcode } = await import("html5-qrcode");
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
            qrbox: { height: 220, width: 220 },
          },
          (decodedText) => {
            if (!cancelled) {
              handleScan(decodedText);
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
          setStartFailed(true);
        }
      } finally {
        startSettled = true;
        if (scanner && (cancelled || !startSucceeded)) {
          await cleanupScanner();
        }
      }
    };

    setStartFailed(false);
    void startScanner();

    return () => {
      cancelled = true;
      if (startSettled) {
        void cleanupScanner();
      }
    };
  }, [handleScan]);

  return (
    <div className="space-y-2">
      <div
        className="bg-muted/30 overflow-hidden rounded-lg border"
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
