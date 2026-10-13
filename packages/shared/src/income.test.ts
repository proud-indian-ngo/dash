import { describe, expect, it } from "vitest";

import {
  contributionRuleIssues,
  countsAsReceived,
  currentFinancialYear,
  defaultReportingMode,
  epochDayToIso,
  financialYearOf,
  isContributionEditable,
  isInFinancialYear,
  todayInKolkata,
} from "./income";

describe("defaultReportingMode", () => {
  it("maps cash and in-kind to their own mode and the rest to electronic", () => {
    expect(defaultReportingMode("cash")).toBe("cash");
    expect(defaultReportingMode("in_kind")).toBe("in_kind");
    for (const channel of [
      "razorpay",
      "give_do",
      "upi",
      "neft",
      "cheque",
    ] as const) {
      expect(defaultReportingMode(channel)).toBe("electronic_or_account_payee");
    }
  });
});

describe("financialYearOf", () => {
  it("starts on 1 April", () => {
    expect(financialYearOf("2026-04-01")).toEqual({
      endsOn: "2027-03-31",
      label: "2026-27",
      startsOn: "2026-04-01",
    });
    expect(financialYearOf("2027-03-31").label).toBe("2026-27");
    expect(financialYearOf("2026-03-31").label).toBe("2025-26");
    expect(financialYearOf("2000-01-15").label).toBe("1999-00");
  });

  it("rejects a malformed date", () => {
    expect(() => financialYearOf("not-a-date")).toThrow("Invalid date");
  });
});

describe("todayInKolkata", () => {
  it("uses the Indian calendar day, not UTC", () => {
    // 31 March 2027, 19:00 UTC is already 1 April in India.
    const lateMarchUtc = new Date("2027-03-31T19:00:00Z");
    expect(todayInKolkata(lateMarchUtc)).toBe("2027-04-01");
    expect(currentFinancialYear(lateMarchUtc).label).toBe("2027-28");
    expect(todayInKolkata(new Date("2027-03-31T18:00:00Z"))).toBe("2027-03-31");
  });
});

describe("isInFinancialYear", () => {
  const fy = financialYearOf("2026-10-13");
  it("includes both ends of the year", () => {
    expect(isInFinancialYear(Date.UTC(2026, 3, 1), fy)).toBe(true);
    expect(isInFinancialYear(Date.UTC(2027, 2, 31), fy)).toBe(true);
    expect(isInFinancialYear(Date.UTC(2026, 2, 31), fy)).toBe(false);
    expect(isInFinancialYear(Date.UTC(2027, 3, 1), fy)).toBe(false);
    expect(epochDayToIso(Date.UTC(2026, 9, 13))).toBe("2026-10-13");
  });
});

describe("contribution statuses", () => {
  it("edits only pending and received contributions", () => {
    expect(isContributionEditable("pending")).toBe(true);
    expect(isContributionEditable("received")).toBe(true);
    expect(isContributionEditable("receipted")).toBe(false);
    expect(isContributionEditable("refunded")).toBe(false);
  });

  it("does not count pending, refunded or reversed money as received", () => {
    expect(countsAsReceived("pending")).toBe(false);
    expect(countsAsReceived("received")).toBe(true);
    expect(countsAsReceived("receipted")).toBe(true);
    expect(countsAsReceived("refunded")).toBe(false);
    expect(countsAsReceived("reversed")).toBe(false);
  });
});

describe("contributionRuleIssues", () => {
  const base = {
    channel: "upi" as const,
    donationType: "voluntary" as const,
    orgAccountId: "acc-1",
    reportingMode: "electronic_or_account_payee" as const,
  };

  it("accepts an ordinary bank gift", () => {
    expect(contributionRuleIssues(base)).toEqual([]);
  });

  it("requires the deposit account unless the gift is in kind", () => {
    expect(
      contributionRuleIssues({ ...base, orgAccountId: null }).map((i) => i.path)
    ).toEqual(["orgAccountId"]);
  });

  it("requires descriptions for other reporting modes and donation types", () => {
    expect(
      contributionRuleIssues({
        ...base,
        donationType: "other",
        donationTypeDescription: "  ",
        reportingMode: "other",
      }).map((i) => i.path)
    ).toEqual(["reportingModeDescription", "donationTypeDescription"]);
    expect(
      contributionRuleIssues({
        ...base,
        donationType: "other",
        donationTypeDescription: "Event sponsorship",
        reportingMode: "other",
        reportingModeDescription: "Demand draft",
      })
    ).toEqual([]);
  });

  it("requires in-kind details and refuses an account for in-kind gifts", () => {
    expect(
      contributionRuleIssues({
        ...base,
        channel: "in_kind",
        reportingMode: "in_kind",
      }).map((i) => i.path)
    ).toEqual(["inKindDescription", "inKindValuationBasis", "orgAccountId"]);
    expect(
      contributionRuleIssues({
        ...base,
        channel: "in_kind",
        inKindDescription: "20 laptops",
        inKindValuationBasis: "Invoice value",
        orgAccountId: null,
        reportingMode: "in_kind",
      })
    ).toEqual([]);
  });
});
