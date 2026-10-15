import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useCallback, useEffect, useRef, useState } from "react";

import { getContributionReceiptReadiness } from "@/functions/contribution-receipts";

import {
  createReadinessLoader,
  type ReadinessLoader,
} from "./readiness-loader";
import { type ReceiptReadinessSets, toReadinessSets } from "./receipt-column";

const DEBOUNCE_MS = 400;

export interface ReceiptReadinessState {
  /** The last load failed; cells needing it show Unavailable. */
  error: boolean;
  /**
   * Some rows still lack a split after the one refetch for this refresh
   * key (they show Unavailable until the next change or Retry).
   */
  gaveUp: boolean;
  readiness: ReceiptReadinessSets | null;
  retry: () => void;
}

/**
 * Which open direct gifts are ready to issue, need details or can't be
 * issued, for the Income table's Receipt column. Server-only (it reads
 * donors' private details), so a server function returning gift IDs and
 * block codes only.
 *
 * Loads once the contributions query is complete (`synced`), then again
 * when the contributions change (`refreshKey`; issuing or voiding changes
 * the gift's status) and when the tab is shown again, since donor details
 * are edited elsewhere. Requests are debounced, skipped while the tab is
 * hidden, and never overlap (see `createReadinessLoader`). When an answer
 * leaves some row unclassified (`hasUnclassified`), it refetches once per
 * refresh key.
 */
export function useReceiptReadiness({
  enabled,
  hasUnclassified,
  refreshKey,
  synced,
}: {
  enabled: boolean;
  hasUnclassified: (readiness: ReceiptReadinessSets) => boolean;
  refreshKey: string;
  synced: boolean;
}): ReceiptReadinessState {
  const load = useServerFn(getContributionReceiptReadiness);
  const loadRef = useRef(load);
  loadRef.current = load;
  const [readiness, setReadiness] = useState<ReceiptReadinessSets | null>(null);
  const [error, setError] = useState(false);
  // The start number of the load the current answer came from.
  const [answeredSeq, setAnsweredSeq] = useState(0);
  const [missRefetch, setMissRefetch] = useState<{
    /** Loads started when the refetch was asked for; later ones answer it. */
    afterStarted: number;
    key: string;
  } | null>(null);
  const loaderRef = useRef<ReadinessLoader | null>(null);
  const active = enabled && synced;

  useEffect(() => {
    if (!active) {
      return;
    }
    const loader = createReadinessLoader({
      debounceMs: DEBOUNCE_MS,
      isHidden: () => document.hidden,
      load: () => loadRef.current(),
      onError: (caught) => {
        log.error({
          action: "income.receiptReadiness",
          caughtError:
            caught instanceof Error ? caught.message : String(caught),
          component: "ContributionsTable",
        });
        setError(true);
      },
      onResult: (result, seq) => {
        setReadiness(toReadinessSets(result));
        setError(false);
        setAnsweredSeq(seq);
      },
    });
    loaderRef.current = loader;
    // A new loader numbers its loads from 1 again.
    setAnsweredSeq(0);
    setMissRefetch(null);
    const onVisibility = () => {
      if (!document.hidden) {
        loader.request();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      loader.dispose();
      loaderRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (!enabled) {
      setReadiness(null);
      setError(false);
    }
  }, [enabled]);

  // The first load once synced, and again whenever the contributions change.
  useEffect(() => {
    if (active) {
      loaderRef.current?.request();
    }
  }, [active, refreshKey]);

  const unclassified = readiness !== null && hasUnclassified(readiness);
  // A row the answer doesn't cover (such as a gift synced after the server
  // read): refetch once for this refresh key.
  useEffect(() => {
    const loader = loaderRef.current;
    if (loader && active && unclassified && missRefetch?.key !== refreshKey) {
      setMissRefetch({ afterStarted: loader.started(), key: refreshKey });
      loader.request();
    }
  }, [active, unclassified, missRefetch, refreshKey]);

  const retry = useCallback(() => {
    setError(false);
    setMissRefetch(null);
    loaderRef.current?.request();
  }, []);

  const gaveUp =
    unclassified &&
    missRefetch?.key === refreshKey &&
    // Only an answer from a load that started after the refetch was asked
    // for; an older in-flight answer arriving first doesn't count.
    answeredSeq > missRefetch.afterStarted;
  return { error, gaveUp, readiness, retry };
}
