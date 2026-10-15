import { describe, expect, it } from "vitest";

import { CORPUS_FUND_ID, GENERAL_FUND_ID } from "./constants";
import {
  donationTypeFundIssue,
  donationTypeProgrammeIssue,
  fundForDonationType,
} from "./contribution-programme";
import { contributionRuleIssues } from "./income";

describe("donationTypeProgrammeIssue", () => {
  it("lets voluntary and other gifts name a programme or not", () => {
    for (const donationType of ["voluntary", "other"] as const) {
      expect(donationTypeProgrammeIssue({ donationType })).toBe(null);
      expect(
        donationTypeProgrammeIssue({ donationType, programmeId: "p" })
      ).toBe(null);
    }
  });

  it("needs the programme for a specific grant or a CSR gift", () => {
    expect(donationTypeProgrammeIssue({ donationType: "specific_grant" })).toBe(
      "A specific grant needs the programme it's for"
    );
    expect(
      donationTypeProgrammeIssue({ donationType: "csr", programmeId: null })
    ).toBe("A CSR gift needs the programme it's for");
    expect(
      donationTypeProgrammeIssue({ donationType: "csr", programmeId: "p" })
    ).toBe(null);
    // A project sets the programme.
    expect(
      donationTypeProgrammeIssue({
        donationType: "specific_grant",
        projectId: "k",
      })
    ).toBe(null);
  });

  it("gives a corpus gift no programme or project", () => {
    expect(donationTypeProgrammeIssue({ donationType: "corpus" })).toBe(null);
    expect(
      donationTypeProgrammeIssue({ donationType: "corpus", programmeId: "p" })
    ).toBe("A corpus gift has no programme");
    expect(
      donationTypeProgrammeIssue({ donationType: "corpus", projectId: "k" })
    ).toBe("A corpus gift has no programme");
  });

  it("is part of the contribution rules, on the programme field", () => {
    expect(
      contributionRuleIssues({
        channel: "neft",
        donationType: "csr",
        orgAccountId: "bank",
        reportingMode: "electronic_or_account_payee",
      })
    ).toEqual([
      {
        message: "A CSR gift needs the programme it's for",
        path: "programmeId",
      },
    ]);
  });
});

describe("donationTypeFundIssue", () => {
  it("locks a corpus gift to the Corpus Fund", () => {
    expect(fundForDonationType("corpus")).toBe(CORPUS_FUND_ID);
    expect(
      donationTypeFundIssue({ donationType: "corpus", fundId: CORPUS_FUND_ID })
    ).toBe(null);
    expect(
      donationTypeFundIssue({ donationType: "corpus", fundId: GENERAL_FUND_ID })
    ).toBe("A corpus gift goes to the Corpus Fund");
  });

  it("keeps every other type out of the Corpus Fund", () => {
    for (const donationType of [
      "voluntary",
      "specific_grant",
      "csr",
      "other",
    ] as const) {
      expect(fundForDonationType(donationType)).toBe(null);
      expect(
        donationTypeFundIssue({ donationType, fundId: GENERAL_FUND_ID })
      ).toBe(null);
      expect(
        donationTypeFundIssue({ donationType, fundId: CORPUS_FUND_ID })
      ).toBe("Only a corpus gift goes to the Corpus Fund");
    }
  });

  it("is part of the contribution rules, on the fund field, when a fund is given", () => {
    const gift = {
      channel: "neft",
      donationType: "corpus",
      orgAccountId: "bank",
      reportingMode: "electronic_or_account_payee",
    } as const;
    expect(contributionRuleIssues(gift)).toEqual([]);
    expect(
      contributionRuleIssues({ ...gift, fundId: GENERAL_FUND_ID })
    ).toEqual([
      { message: "A corpus gift goes to the Corpus Fund", path: "fundId" },
    ]);
  });
});
