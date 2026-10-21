import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import {
  getReimbursementPayout,
  type ReimbursementPayout,
} from "@/functions/reimbursement-payout";

export type PayoutState =
  | { kind: "error" }
  | { kind: "loading" }
  | { kind: "ready"; payout: ReimbursementPayout };

/**
 * The claimant's payee details, which Zero doesn't sync (programme leads see
 * the request, not where the claimant is paid). Loads for the claimant and
 * `requests.view_all` holders, and again whenever the request changes.
 */
export function useReimbursementPayout(
  request: { id: string; updatedAt?: null | number },
  enabled: boolean
): PayoutState {
  const load = useServerFn(getReimbursementPayout);
  // Keyed by request: after navigating from A to B, A's details are never
  // shown or saved for B.
  const [loaded, setLoaded] = useState<{ id: string; state: PayoutState }>({
    id: "",
    state: { kind: "loading" },
  });
  const { id, updatedAt } = request;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    load({ data: { id } })
      .then((payout) => {
        if (!cancelled) {
          setLoaded({ id, state: { kind: "ready", payout } });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "reimbursement.loadPayout",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "useReimbursementPayout",
        });
        if (!cancelled) {
          setLoaded({ id, state: { kind: "error" } });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, id, updatedAt, load]);

  return payoutStateFor(loaded, id);
}

/** Another request's result reads as loading. */
export function payoutStateFor(
  loaded: { id: string; state: PayoutState },
  id: string
): PayoutState {
  return loaded.id === id ? loaded.state : { kind: "loading" };
}
