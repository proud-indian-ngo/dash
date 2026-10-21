import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import {
  getGrantUtilisation,
  type GrantUtilisationRows,
} from "@/functions/grants";

interface Range {
  from: string | null;
  /** One grant, or every grant when null. */
  grantId: string | null;
  to: string;
}

/**
 * Received and spent money under grants for a range, from the server: null
 * while the first load for the range runs, the error when it failed.
 * Reloads when the window regains focus (the books change as records post)
 * and on `retry`, which callers also use after linking a contribution.
 */
export function useGrantUtilisation(range: Range | null) {
  const load = useServerFn(getGrantUtilisation);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    rows: GrantUtilisationRows;
  } | null>(null);
  const [failed, setFailed] = useState<{ error: unknown; key: string } | null>(
    null
  );
  const key = range ? `${range.grantId}:${range.from}:${range.to}` : null;

  useEffect(() => {
    const reload = () => setAttempt((n) => n + 1);
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);

  const grantId = range?.grantId ?? null;
  const from = range?.from ?? null;
  const to = range?.to ?? null;
  useEffect(() => {
    if (!(key && to)) {
      return;
    }
    let cancelled = false;
    load({ data: { from, grantId, to } })
      .then((rows) => {
        if (!cancelled) {
          setLoaded({ key, rows });
          setFailed(null);
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "grants.loadUtilisation",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "useGrantUtilisation",
          grantId,
        });
        if (!cancelled) {
          setFailed({ error, key });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, from, grantId, key, load, to]);

  const rows = loaded && loaded.key === key ? loaded.rows : null;
  const error = failed && failed.key === key ? failed.error : null;
  return {
    // A refresh that fails keeps the figures already shown.
    error: rows ? null : error,
    retry: () => {
      setFailed(null);
      setAttempt((n) => n + 1);
    },
    rows,
  };
}
