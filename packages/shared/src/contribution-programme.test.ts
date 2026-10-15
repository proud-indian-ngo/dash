import { describe, expect, it } from "vitest";

import { donationTypeProgrammeIssue } from "./contribution-programme";
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
