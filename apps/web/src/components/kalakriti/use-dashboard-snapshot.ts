import { useConnectionState } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useCallback, useEffect, useRef, useState } from "react";

import { getKalakritiDashboardSummary } from "@/functions/kalakriti-dashboard-summary";

export async function loadKalakritiDashboard(year: number) {
  const summary = await getKalakritiDashboardSummary({ data: { year } });
  if (!summary) return null;
  return { summary, projections: summary.projections };
}

export type DashboardSnapshot = Awaited<
  ReturnType<typeof loadKalakritiDashboard>
>;

export function useDashboardSnapshot({
  initial,
  scopeKey,
  year,
  live,
}: {
  initial: DashboardSnapshot | undefined;
  scopeKey: string;
  year: number;
  live: boolean;
}) {
  const connection = useConnectionState();
  const connected = connection.name === "connected";
  const [state, setState] = useState(() => ({
    key: scopeKey,
    data: initial,
    error: false,
  }));
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const refresh = useCallback(() => refreshRef.current(), []);

  const polling =
    state.key === scopeKey && state.data
      ? state.data.summary.access.edition.lifecycle === "live"
      : live;

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const fetchSnapshot = async () => {
      if (!connected) return;
      generation += 1;
      const request = generation;
      try {
        const data = await loadKalakritiDashboard(year);
        if (!disposed && request === generation)
          setState({ key: scopeKey, data, error: false });
      } catch (error) {
        log.error({
          component: "KalakritiDashboard",
          action: "refresh",
          year,
          error: error instanceof Error ? error.message : String(error),
        });
        if (!disposed && request === generation)
          setState((previous) => ({
            key: scopeKey,
            data: previous.key === scopeKey ? previous.data : undefined,
            error: true,
          }));
      }
    };
    refreshRef.current = fetchSnapshot;
    void fetchSnapshot();
    window.addEventListener("focus", fetchSnapshot);
    return () => {
      disposed = true;
      window.removeEventListener("focus", fetchSnapshot);
    };
  }, [scopeKey, connected, year]);

  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [polling, refresh]);

  const data = state.key === scopeKey ? state.data : undefined;
  return {
    data,
    refresh,
    error: state.key === scopeKey && state.error,
    fresh: connected && state.key === scopeKey && !state.error,
  };
}
