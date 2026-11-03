import { useConnectionState } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";

import {
  getKalakritiInventoryVolunteers,
  type KalakritiInventoryVolunteer,
} from "@/functions/kalakriti-inventory";

const NO_VOLUNTEERS: KalakritiInventoryVolunteer[] = [];

/**
 * Contact-free Volunteers for inventory. Reloads on reconnect, window focus
 * and every few seconds, so scan stations stay current while they stay open.
 * A failed load keeps the last list and retries on the next of those.
 */
export function useInventoryVolunteers(editionId: string) {
  const connection = useConnectionState();
  const connected = connection.name === "connected";
  const [snapshot, setSnapshot] = useState<{
    editionId: string;
    volunteers: KalakritiInventoryVolunteer[];
  }>();
  const refreshRef = useRef<
    () => Promise<KalakritiInventoryVolunteer[] | undefined>
  >(async () => undefined);
  const refresh = () => refreshRef.current();
  useEffect(() => {
    let disposed = false;
    let inflight: Promise<KalakritiInventoryVolunteer[] | undefined> | null =
      null;
    const fetchVolunteers = async () => {
      try {
        const volunteers = await getKalakritiInventoryVolunteers({
          data: { editionId },
        });
        if (disposed) return undefined;
        setSnapshot({ editionId, volunteers });
        return volunteers;
      } catch (error) {
        if (!disposed)
          log.error({
            component: "useInventoryVolunteers",
            action: "load",
            editionId,
            error: error instanceof Error ? error.message : String(error),
          });
        return undefined;
      }
    };
    // One request at a time: ticks and scans while one is out share it.
    const load = () => {
      if (!connected) return Promise.resolve(undefined);
      if (!inflight)
        inflight = fetchVolunteers().finally(() => {
          inflight = null;
        });
      return inflight;
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
  }, [editionId, connected]);
  return {
    volunteers:
      snapshot?.editionId === editionId ? snapshot.volunteers : NO_VOLUNTEERS,
    complete: snapshot?.editionId === editionId,
    refresh,
  };
}
