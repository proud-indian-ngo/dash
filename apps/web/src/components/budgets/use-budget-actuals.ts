import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { type BudgetActual, getBudgetActuals } from "@/functions/budgets";

/**
 * The year's actuals from the books: null while the first load runs, the
 * error when it failed. Reloads when the window regains focus (the books
 * change as records post) and on `retry`.
 */
export function useBudgetActuals(fiscalYearId: string | undefined) {
  const load = useServerFn(getBudgetActuals);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    actuals: BudgetActual[];
    fiscalYearId: string;
  } | null>(null);
  const [failed, setFailed] = useState<{
    error: unknown;
    fiscalYearId: string;
  } | null>(null);

  useEffect(() => {
    const reload = () => setAttempt((n) => n + 1);
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);

  useEffect(() => {
    if (!fiscalYearId) {
      return;
    }
    let cancelled = false;
    load({ data: { fiscalYearId } })
      .then((actuals) => {
        if (!cancelled) {
          setLoaded({ actuals, fiscalYearId });
          setFailed(null);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "budgets.loadActuals",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "useBudgetActuals",
          fiscalYearId,
        });
        if (!cancelled) {
          setFailed({ error, fiscalYearId });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, fiscalYearId, load]);

  const actuals =
    loaded && loaded.fiscalYearId === fiscalYearId ? loaded.actuals : null;
  const error =
    failed && failed.fiscalYearId === fiscalYearId ? failed.error : null;
  return {
    actuals,
    // A refresh that fails keeps the figures already shown.
    error: actuals ? null : error,
    retry: () => {
      setFailed(null);
      setAttempt((n) => n + 1);
    },
  };
}
