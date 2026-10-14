import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useMemo } from "react";

import type { ContributionBankEvidence } from "./contribution-filters";

const EMPTY_IDS: ReadonlySet<string> = new Set();
const EMPTY_EVIDENCE: ContributionBankEvidence = {
  matchedContributionIds: EMPTY_IDS,
  processedContributionIds: EMPTY_IDS,
};

/** Finance-only evidence used to derive whether each contribution reached bank. */
export function useContributionBankEvidence(enabled: boolean): {
  evidence: ContributionBankEvidence;
  isLoading: boolean;
} {
  const [settlementItems, settlementResult] = useQuery(
    queries.contributionBankStatus.processedPaymentItems(),
    { enabled }
  );
  const [statementLines, statementResult] = useQuery(
    queries.contributionBankStatus.matchedContributionLines(),
    { enabled }
  );
  const evidence = useMemo<ContributionBankEvidence>(() => {
    if (!enabled) {
      return EMPTY_EVIDENCE;
    }
    return {
      matchedContributionIds: new Set(
        statementLines.flatMap((line) =>
          line.matchedContributionId ? [line.matchedContributionId] : []
        )
      ),
      processedContributionIds: new Set(
        settlementItems.flatMap((item) =>
          item.contributionId ? [item.contributionId] : []
        )
      ),
    };
  }, [enabled, settlementItems, statementLines]);
  const isLoading =
    enabled &&
    ((settlementItems.length === 0 && settlementResult.type !== "complete") ||
      (statementLines.length === 0 && statementResult.type !== "complete"));
  return { evidence, isLoading };
}
