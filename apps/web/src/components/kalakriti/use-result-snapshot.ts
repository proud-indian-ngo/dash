import { useConnectionState } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useCallback, useEffect, useRef, useState } from "react";

export function useResultSnapshot<T>(
  scopeKey: string,
  load: () => Promise<T>,
  enabled = true
) {
  const connection = useConnectionState();
  const connected = connection.name === "connected";
  const loadRef = useRef(load);
  loadRef.current = load;
  const [snapshot, setSnapshot] = useState<{
    scopeKey: string;
    data: T;
    fresh: boolean;
    error: boolean;
  }>();
  const [failedScope, setFailedScope] = useState<string | null>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const fetchSnapshot = async () => {
      const request = ++generation;
      if (!enabled || !connected) {
        setSnapshot((previous) =>
          previous?.scopeKey === scopeKey
            ? { ...previous, fresh: false }
            : previous
        );
        return;
      }
      try {
        const data = await loadRef.current();
        if (!disposed && request === generation) {
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
        if (!disposed && request === generation) {
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
