import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useConnectionState } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";

export function useResultSnapshot<T>(
  scopeKey: string,
  load: () => Promise<T>,
  enabled = true
) {
  const connection = useConnectionState();
  const connected = connection.name === "connected";
  const loadLatest = useEventCallback(load);
  const [snapshot, setSnapshot] = useState<{
    scopeKey: string;
    data: T;
    fresh: boolean;
    error: boolean;
  }>();
  const [failedScope, setFailedScope] = useState<string | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const refresh = () => refreshRef.current();

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const isCurrent = (request: number) => !disposed && request === generation;
    const fetchSnapshot = async () => {
      generation += 1;
      const request = generation;
      if (!enabled || !connected) {
        setSnapshot((previous) =>
          previous?.scopeKey === scopeKey
            ? { ...previous, fresh: false }
            : previous
        );
        return;
      }
      try {
        const data = await loadLatest();
        if (isCurrent(request)) {
          setFailedScope(null);
          setSnapshot({ scopeKey, data, fresh: true, error: false });
        }
      } catch (error) {
        log.error({
          component: "useResultSnapshot",
          action: "refresh",
          scopeKey,
          error: error instanceof Error ? error.message : String(error),
        });
        if (isCurrent(request)) {
          setFailedScope(scopeKey);
          setSnapshot((previous) =>
            previous?.scopeKey === scopeKey
              ? { ...previous, fresh: false, error: true }
              : previous
          );
        }
      }
    };
    refreshRef.current = fetchSnapshot;
    void fetchSnapshot();
    const timer = setInterval(() => void fetchSnapshot(), 5000);
    window.addEventListener("focus", fetchSnapshot);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", fetchSnapshot);
    };
  }, [scopeKey, enabled, connected]);

  return {
    data:
      enabled && snapshot?.scopeKey === scopeKey ? snapshot.data : undefined,
    fresh:
      enabled && connected && snapshot?.scopeKey === scopeKey && snapshot.fresh,
    error:
      enabled &&
      (failedScope === scopeKey ||
        (snapshot?.scopeKey === scopeKey && snapshot.error)),
    refresh,
  };
}
