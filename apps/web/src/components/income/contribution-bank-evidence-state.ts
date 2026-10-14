import type { ContributionBankEvidence } from "./contribution-filters";

const EMPTY_IDS: ReadonlySet<string> = new Set();
export const EMPTY_BANK_EVIDENCE: ContributionBankEvidence = {
  matchedContributionIds: EMPTY_IDS,
  processedContributionIds: EMPTY_IDS,
};

export interface ContributionBankEvidenceRequest {
  contributionIds: readonly string[];
}

export interface LoadedContributionBankEvidence {
  evidence: ContributionBankEvidence;
  request: ContributionBankEvidenceRequest;
}

export function selectContributionBankEvidence(
  active: boolean,
  request: ContributionBankEvidenceRequest,
  loaded: LoadedContributionBankEvidence | null,
  failedRequest: ContributionBankEvidenceRequest | null = null
): { error: boolean; evidence: ContributionBankEvidence; isLoading: boolean } {
  if (!active) {
    return { error: false, evidence: EMPTY_BANK_EVIDENCE, isLoading: false };
  }
  if (failedRequest === request) {
    return { error: true, evidence: EMPTY_BANK_EVIDENCE, isLoading: false };
  }
  if (loaded?.request !== request) {
    return { error: false, evidence: EMPTY_BANK_EVIDENCE, isLoading: true };
  }
  return { error: false, evidence: loaded.evidence, isLoading: false };
}
