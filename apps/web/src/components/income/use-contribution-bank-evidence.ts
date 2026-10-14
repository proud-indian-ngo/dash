import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getContributionBankEvidence } from "@/functions/income";

import {
  type ContributionBankEvidenceRequest,
  type LoadedContributionBankEvidence,
  selectContributionBankEvidence,
} from "./contribution-bank-evidence-state";
import type { ContributionBankEvidence } from "./contribution-filters";

/** Finance-only evidence used to derive whether scoped contributions reached bank. */
export function useContributionBankEvidence(
  enabled: boolean,
  contributionIds: readonly string[]
): {
  error: boolean;
  evidence: ContributionBankEvidence;
  isLoading: boolean;
  retry: () => void;
} {
  const load = useServerFn(getContributionBankEvidence);
  const active = enabled && contributionIds.length > 0;
  const [retryCount, setRetryCount] = useState(0);
  const retry = useCallback(() => setRetryCount((count) => count + 1), []);
  const scopeKey = contributionIds.join(",");
  const request = useMemo<ContributionBankEvidenceRequest>(
    () => ({ contributionIds: scopeKey ? scopeKey.split(",") : [] }),
    [active, retryCount, scopeKey]
  );
  const [loaded, setLoaded] = useState<LoadedContributionBankEvidence | null>(
    null
  );
  const [failedRequest, setFailedRequest] =
    useState<ContributionBankEvidenceRequest | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    load({ data: { contributionIds: [...request.contributionIds] } })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setLoaded({
          evidence: {
            matchedContributionIds: new Set(result.matchedContributionIds),
            processedContributionIds: new Set(result.processedContributionIds),
          },
          request,
        });
        setFailedRequest(null);
      })
      .catch(() => {
        if (!cancelled) {
          log.error({
            action: "income.contributionBankEvidence",
            component: "ContributionsTable",
          });
          setFailedRequest(request);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, load, request]);

  const selected = useMemo(
    () =>
      selectContributionBankEvidence(active, request, loaded, failedRequest),
    [active, failedRequest, loaded, request]
  );
  return { ...selected, retry };
}
