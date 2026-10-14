import { describe, expect, it } from "bun:test";

import {
  EMPTY_BANK_EVIDENCE,
  selectContributionBankEvidence,
} from "./contribution-bank-evidence-state";

describe("selectContributionBankEvidence", () => {
  it("does not load until the filter is active with a non-empty scope", () => {
    expect(
      selectContributionBankEvidence(false, { contributionIds: [] }, null)
    ).toEqual({
      error: false,
      evidence: EMPTY_BANK_EVIDENCE,
      isLoading: false,
    });
  });

  it("hides stale evidence while the current scope is loading", () => {
    const oldRequest = { contributionIds: ["a"] };
    const currentRequest = { contributionIds: ["b"] };
    const oldEvidence = {
      matchedContributionIds: new Set(["a"]),
      processedContributionIds: new Set<string>(),
    };
    expect(
      selectContributionBankEvidence(true, currentRequest, {
        evidence: oldEvidence,
        request: oldRequest,
      })
    ).toEqual({ error: false, evidence: EMPTY_BANK_EVIDENCE, isLoading: true });
  });

  it("publishes evidence only for the complete matching request", () => {
    const request = { contributionIds: ["a", "b"] };
    const evidence = {
      matchedContributionIds: new Set(["a"]),
      processedContributionIds: new Set(["b"]),
    };
    expect(
      selectContributionBankEvidence(true, request, {
        evidence,
        request,
      })
    ).toEqual({ error: false, evidence, isLoading: false });
  });

  it("reports a failed current request without exposing empty evidence as data", () => {
    const request = { contributionIds: ["a"] };
    expect(
      selectContributionBankEvidence(true, request, null, request)
    ).toEqual({ error: true, evidence: EMPTY_BANK_EVIDENCE, isLoading: false });
  });
});
