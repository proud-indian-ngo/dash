import { describe, expect, it } from "vitest";

import {
  contributionDisplayStatus,
  contributionRuleIssues,
  countsAsReceived,
  currentFinancialYear,
  defaultReportingMode,
  epochDayToIso,
  financialYearOf,
  isContributionDeletable,
  isContributionEditable,
  isInFinancialYear,
  netReceivedPaise,
  refundedPaise,
  refundLockedChanges,
  refundSummary,
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
  it("shows receipted as received: receipting has its own column", () => {
    expect(contributionDisplayStatus("receipted")).toBe("received");
    expect(contributionDisplayStatus(null)).toBe("received");
    expect(contributionDisplayStatus("pending")).toBe("pending");
    expect(contributionDisplayStatus("refunded")).toBe("refunded");
    expect(contributionDisplayStatus("reversed")).toBe("reversed");
  });

  it("edits only pending and received contributions", () => {
    expect(isContributionEditable("pending")).toBe(true);
    expect(isContributionEditable("received")).toBe(true);
    expect(isContributionEditable("receipted")).toBe(false);
    expect(isContributionEditable("refunded")).toBe(false);
  });

  it("keeps a refunded contribution editable but no longer deletable", () => {
    expect(isContributionDeletable("received", [])).toBe(true);
    expect(isContributionDeletable("received", [{ id: "r" }])).toBe(false);
    expect(isContributionDeletable("receipted", [])).toBe(false);
    // A voided receipt still keeps the gift.
    expect(isContributionDeletable("received", [], [{ id: "r" }])).toBe(false);
    expect(isContributionDeletable("received", [], [])).toBe(true);
  });

  it("names the refund-locked fields an edit would change", () => {
    const existing = {
      amountPaise: 100,
      channel: "razorpay",
      orgAccountId: "a",
      partyId: "p",
      receivedOn: 1,
    };
    expect(refundLockedChanges(existing, { ...existing })).toEqual([]);
    expect(
      refundLockedChanges(existing, {
        ...existing,
        amountPaise: 99,
        orgAccountId: null,
      })
    ).toEqual(["amountPaise", "orgAccountId"]);
  });

  it("does not count pending, refunded or reversed money as received", () => {
    expect(countsAsReceived("pending")).toBe(false);
    expect(countsAsReceived("received")).toBe(true);
    expect(countsAsReceived("receipted")).toBe(true);
    expect(countsAsReceived("refunded")).toBe(false);
    expect(countsAsReceived("reversed")).toBe(false);
  });
});

describe("net received", () => {
  const gift = (status: string, refunds: number[] = []) => ({
    amountPaise: 50_000,
    refunds: refunds.map((amountPaise) => ({ amountPaise })),
    status,
  });

  it("takes partial refunds off received and receipted gifts", () => {
    expect(netReceivedPaise(gift("received"))).toBe(50_000);
    expect(netReceivedPaise(gift("received", [10_000, 5000]))).toBe(35_000);
    expect(netReceivedPaise(gift("receipted", [20_000]))).toBe(30_000);
    expect(refundedPaise([{ amountPaise: 1 }, { amountPaise: 2 }])).toBe(3);
    expect(refundedPaise(null)).toBe(0);
  });

  it("counts nothing for pending, refunded or reversed gifts, and never goes below zero", () => {
    expect(netReceivedPaise(gift("pending"))).toBe(0);
    expect(netReceivedPaise(gift("refunded", [50_000]))).toBe(0);
    expect(netReceivedPaise(gift("reversed"))).toBe(0);
    // A refund after receipt keeps the status; the money still went back.
    expect(netReceivedPaise(gift("receipted", [60_000]))).toBe(0);
    // Refunds not loaded: the whole amount, as before refunds existed.
    expect(netReceivedPaise({ amountPaise: 1000, status: "received" })).toBe(
      1000
    );
  });

  it("reads partly refunded only while some, not all, has gone back", () => {
    expect(refundSummary(gift("received"))).toBeNull();
    expect(refundSummary(gift("received", [20_000]))).toEqual({
      partly: true,
      refundedPaise: 20_000,
    });
    expect(refundSummary(gift("refunded", [50_000]))).toEqual({
      partly: false,
      refundedPaise: 50_000,
    });
    // A receipted gift its refunds cover keeps its status.
    expect(refundSummary(gift("receipted", [50_000]))).toEqual({
      partly: false,
      refundedPaise: 50_000,
    });
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

  it("fixes the reporting mode of cash and in-kind gifts", () => {
    expect(
      contributionRuleIssues({ ...base, channel: "cash" }).map((i) => i.path)
    ).toEqual(["reportingMode"]);
    expect(
      contributionRuleIssues({
        ...base,
        channel: "cash",
        reportingMode: "cash",
      })
    ).toEqual([]);
    expect(
      contributionRuleIssues({
        ...base,
        channel: "in_kind",
        inKindDescription: "Books",
        inKindValuationBasis: "Invoice",
        orgAccountId: null,
      }).map((i) => i.path)
    ).toEqual(["reportingMode"]);
  });

  it("requires a reason when a gift is excluded from the donations return", () => {
    expect(
      contributionRuleIssues({ ...base, deductionEligible: "no" }).map(
        (i) => i.path
      )
    ).toEqual(["eligibilityReason"]);
    expect(
      contributionRuleIssues({
        ...base,
        deductionEligible: "no",
        eligibilityReason: "Donor declined",
      })
    ).toEqual([]);
    expect(
      contributionRuleIssues({ ...base, deductionEligible: "yes" })
    ).toEqual([]);
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
        // Only a cheque may be reported as other (a bearer cheque).
        channel: "cheque",
        donationType: "other",
        donationTypeDescription: "  ",
        reportingMode: "other",
      }).map((i) => i.path)
    ).toEqual(["reportingModeDescription", "donationTypeDescription"]);
    expect(
      contributionRuleIssues({
        ...base,
        channel: "cheque",
        donationType: "other",
        donationTypeDescription: "Event sponsorship",
        reportingMode: "other",
        reportingModeDescription: "Bearer cheque",
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
