import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { type BudgetActual, getBudgetActuals } from "@/functions/budgets";

/** The year's actuals from the books; null while loading. */
export function useBudgetActuals(
  fiscalYearId: string | undefined
): BudgetActual[] | null {
  const load = useServerFn(getBudgetActuals);
  const [loaded, setLoaded] = useState<{
    actuals: BudgetActual[];
    fiscalYearId: string;
  } | null>(null);
  useEffect(() => {
    if (!fiscalYearId) {
      return;
    }
    let cancelled = false;
    load({ data: { fiscalYearId } })
      .then((actuals) => {
        if (!cancelled) {
          setLoaded({ actuals, fiscalYearId });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "budgets.loadActuals",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "useBudgetActuals",
          fiscalYearId,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [fiscalYearId, load]);
  return loaded && loaded.fiscalYearId === fiscalYearId ? loaded.actuals : null;
}
