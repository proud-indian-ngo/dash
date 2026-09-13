import { useConnectionState } from "@rocicorp/zero/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getKalakritiFoodAttendees } from "@/functions/kalakriti-food";

import type { FoodTableRow } from "./food-table";

const EMPTY_ROWS: FoodTableRow[] = [];

export function useFoodAttendees(
  year: number,
  scopeKey: string,
  enabled: boolean
) {
  const connection = useConnectionState();
  const connected = connection.name === "connected";
  const [snapshot, setSnapshot] = useState<{
    scopeKey: string;
    rows: FoodTableRow[];
    complete: boolean;
  }>();
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const load = async () => {
      const request = ++generation;
      setSnapshot((previous) =>
        previous?.scopeKey === scopeKey
          ? { ...previous, complete: false }
          : undefined
      );
      if (!enabled || !connected) return;
      try {
        const rows = await getKalakritiFoodAttendees({ data: { year } });
        if (!disposed && request === generation)
          setSnapshot({ scopeKey, rows, complete: true });
      } catch {
        // Keep the last roster visible, but disable writes until a successful refresh.
      }
    };
    refreshRef.current = load;
    void load();
    const timer = setInterval(() => {
      void load();
    }, 5000);
    const focus = () => {
      void load();
    };
    window.addEventListener("focus", focus);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [year, scopeKey, enabled, connected]);
  return {
    rows:
      enabled && snapshot?.scopeKey === scopeKey ? snapshot.rows : EMPTY_ROWS,
    complete:
      !enabled ||
      (connected &&
        snapshot?.scopeKey === scopeKey &&
        snapshot.complete === true),
    refresh,
  };
}
