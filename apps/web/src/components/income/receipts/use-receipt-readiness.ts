import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { getContributionReceiptReadiness } from "@/functions/contribution-receipts";

import type { ReceiptReadinessSets } from "./receipt-column";

/**
 * Which open direct gifts are ready to issue and which need details, for
 * the Income table's Receipt column. Server-only (it reads donors' private
 * details), so a server function returning gift IDs only. Refetched when
 * the contributions change (`refreshKey`; issuing or voiding changes the
 * gift's status) and when the window regains focus, since donor details
 * are edited elsewhere. Null until loaded, or when not `enabled`.
 */
export function useReceiptReadiness(
  enabled: boolean,
  refreshKey: string
): ReceiptReadinessSets | null {
  const load = useServerFn(getContributionReceiptReadiness);
  const [state, setState] = useState<ReceiptReadinessSets | null>(null);
  const [focusCount, setFocusCount] = useState(0);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const onFocus = () => setFocusCount((n) => n + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled]);
  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }
    let cancelled = false;
    load()
      .then((result) => {
        if (!cancelled) {
          setState({
            blocked: new Set(result.blocked),
            ready: new Set(result.ready),
          });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "income.receiptReadiness",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "ContributionsTable",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey, focusCount, load]);
  return state;
}
