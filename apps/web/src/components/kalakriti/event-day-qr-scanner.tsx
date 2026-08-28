import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useEffect } from "react";

const SCANNER_ELEMENT_ID = "kalakriti-event-day-qr";

interface EventDayQrScannerProps {
  onScan: (token: string) => void;
}

export function EventDayQrScanner({ onScan }: EventDayQrScannerProps) {
  const handleScan = useEventCallback(onScan);

  useEffect(() => {
    let cancelled = false;
    let scanner: { clear: () => Promise<void> | void } | null = null;

    const startScanner = async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) {
        return;
      }

      const nextScanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
      scanner = nextScanner;

      try {
        await nextScanner.start(
          { facingMode: "environment" },
          {
            aspectRatio: 1,
            fps: 10,
            qrbox: { height: 220, width: 220 },
          },
          (decodedText) => {
            handleScan(decodedText);
          },
          () => {
            // Ignore scan misses.
          }
        );
      } catch {
        // Camera permission or hardware errors surface in the station UI copy.
      }
    };

    startScanner();

    return () => {
      cancelled = true;
      const activeScanner = scanner;
      scanner = null;
      if (activeScanner) {
        Promise.resolve(activeScanner.clear()).catch(() => {
          // Scanner may already be stopped.
        });
      }
    };
  }, [handleScan]);

  return (
    <div
      className="overflow-hidden rounded-lg border bg-muted/30"
      id={SCANNER_ELEMENT_ID}
    />
  );
}
