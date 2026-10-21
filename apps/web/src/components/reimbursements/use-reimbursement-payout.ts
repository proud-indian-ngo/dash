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
  const [state, setState] = useState<PayoutState>({ kind: "loading" });
  const { id, updatedAt } = request;

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    load({ data: { id } })
      .then((payout) => {
        if (!cancelled) {
          setState({ kind: "ready", payout });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "reimbursement.loadPayout",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "useReimbursementPayout",
        });
        if (!cancelled) {
          setState({ kind: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, id, updatedAt, load]);

  return state;
}
