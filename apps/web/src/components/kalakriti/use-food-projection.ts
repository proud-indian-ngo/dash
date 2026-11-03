import { useConnectionState } from "@rocicorp/zero/react";
import { useEffect, useRef, useState } from "react";

import {
  getKalakritiFoodAttendees,
  getKalakritiFoodMemberships,
} from "@/functions/kalakriti-food";

import type { FoodTableRow } from "./food-table";

const EMPTY_ROWS: FoodTableRow[] = [];

export function useFoodProjection(
  year: number,
  editionId: string,
  scopeKey: string,
  attendeesEnabled: boolean
) {
  const connection = useConnectionState();
  const connected = connection.name === "connected";
  const [snapshot, setSnapshot] = useState<{
    scopeKey: string;
    attendees: FoodTableRow[];
    memberships: FoodTableRow[];
    complete: boolean;
  }>();
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const refresh = () => refreshRef.current();
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const isCurrent = (request: number) => !disposed && request === generation;
    const load = async () => {
      generation += 1;
      const request = generation;
      setSnapshot((previous) =>
        previous?.scopeKey === scopeKey
          ? { ...previous, complete: false }
          : undefined
      );
      if (!connected) return;
      const attendeesRequest = attendeesEnabled
        ? getKalakritiFoodAttendees({ data: { year } })
        : Promise.resolve(EMPTY_ROWS);
      try {
        const [attendees, memberships] = await Promise.all([
          attendeesRequest,
          getKalakritiFoodMemberships({ data: { editionId } }),
        ]);
        if (isCurrent(request))
          setSnapshot({ scopeKey, attendees, memberships, complete: true });
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
  }, [year, editionId, scopeKey, attendeesEnabled, connected]);
  const current = snapshot?.scopeKey === scopeKey ? snapshot : undefined;
  return {
    attendees: attendeesEnabled && current ? current.attendees : EMPTY_ROWS,
    memberships: current?.memberships ?? EMPTY_ROWS,
    complete: connected && current?.complete === true,
    refresh,
  };
}
