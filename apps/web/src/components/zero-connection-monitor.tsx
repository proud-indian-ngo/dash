import { useConnectionState, useZero } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";
import { log } from "evlog";
import debounce from "lodash/debounce";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const showSyncErrorToast = debounce(
  () => toast.error("Couldn't sync data. Check your connection."),
  3000,
  { leading: true, trailing: false }
);

// Zero stops retrying in `error`, but some server errors are transient (a
// reload racing the previous page's connection can drop shared query work, in
// bursts), so reconnect, up to a limit per minute, before telling the user.
const MAX_ERROR_RECONNECTS_PER_MINUTE = 10;

function extractReason(state: { reason?: unknown }): string {
  return typeof state.reason === "string"
    ? state.reason
    : JSON.stringify(state.reason ?? "unknown");
}

/**
 * Reconnects Zero after a transient error, sends the person to log in when
 * Zero needs auth, and reports a sync failure that keeps coming back.
 */
export function ZeroConnectionMonitor({
  onConnected,
}: {
  onConnected?: () => void;
}) {
  const zero = useZero();
  const state = useConnectionState();
  const prevName = useRef<string | null>(null);
  const errorReconnectTimes = useRef<number[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (state.name === prevName.current) {
      return;
    }

    if (state.name === "connected") {
      onConnected?.();
    } else if (state.name === "needs-auth") {
      log.error({
        component: "ZeroConnectionMonitor",
        message: "Zero connection: needs-auth",
        reason: extractReason(state),
      });
      navigate({
        search: { redirect: window.location.pathname },
        to: "/login",
      });
    } else if (state.name === "error") {
      log.error({
        component: "ZeroConnectionMonitor",
        message: `Zero connection: ${state.name}`,
        reason: extractReason(state),
      });
      const now = Date.now();
      errorReconnectTimes.current = errorReconnectTimes.current.filter(
        (time) => now - time < 60_000
      );
      if (
        errorReconnectTimes.current.length < MAX_ERROR_RECONNECTS_PER_MINUTE
      ) {
        errorReconnectTimes.current.push(now);
        zero.connection.connect();
      } else {
        showSyncErrorToast();
      }
    }

    prevName.current = state.name;
  }, [state, navigate, onConnected, zero]);

  return null;
}
