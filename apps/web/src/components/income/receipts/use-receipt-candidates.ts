import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import {
  getReceiptCandidates,
  type ReceiptCandidatesResponse,
} from "@/functions/contribution-receipts";

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

/**
 * Loads the gifts a receipt could be issued for: every direct gift without
 * one (`contributionIds` null) or exactly the given gifts. Reloads when
 * `refreshKey` changes.
 */
export function useReceiptCandidates(
  enabled: boolean,
  contributionIds: string[] | null,
  refreshKey: string
) {
  const load = useServerFn(getReceiptCandidates);
  const [state, setState] = useState<ReceiptCandidatesResponse | null>(null);
  const idsKey = contributionIds?.join(",") ?? "";
  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }
    let cancelled = false;
    load({
      data: { giftIds: idsKey ? idsKey.split(",") : null },
    })
      .then((result) => {
        if (!cancelled) {
          setState(result);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "receipts.candidates",
          caughtError: errorMessage(error),
          component: "IssueReceipts",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, idsKey, refreshKey, load]);
  return state;
}
