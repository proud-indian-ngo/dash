import { describe, expect, it } from "bun:test";

import {
  createFilterQuery,
  createFilterRule,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import { financialYearOf } from "@pi-dash/shared/income";

import {
  contributionBankScope,
  createContributionFilterFields,
  foldReceiptedStatusFilter,
  getContributionFilterValue,
  hasReachedBankFilter,
  isMissingDetailsRow,
  reachedBankValue,
} from "./contribution-filters";
import type { ContributionRow } from "./income-types";

const fy = financialYearOf("2026-10-13");
const missing = new Set(["a"]);
const row = {
  partyId: "a",
  receivedOn: Date.UTC(2026, 8, 1),
  status: "received",
};

describe("isMissingDetailsRow", () => {
  it("flags this year's received gifts from a donor missing details", () => {
    expect(isMissingDetailsRow(row, missing, fy)).toBe(true);
    expect(
      isMissingDetailsRow({ ...row, status: "receipted" }, missing, fy)
    ).toBe(true);
  });

  it("leaves out other donors, other years and money not received", () => {
    expect(isMissingDetailsRow({ ...row, partyId: "b" }, missing, fy)).toBe(
      false
    );
    expect(
      isMissingDetailsRow(
        { ...row, receivedOn: Date.UTC(2026, 2, 31) },
        missing,
        fy
      )
    ).toBe(false);
    for (const status of ["pending", "refunded", "reversed"]) {
      expect(isMissingDetailsRow({ ...row, status }, missing, fy)).toBe(false);
    }
  });
});

describe("reachedBankValue", () => {
  const evidence = {
    matchedContributionIds: new Set(["matched"]),
    processedContributionIds: new Set(["settled"]),
  };
  const contribution = (
    id: string,
    channel:
      | "razorpay"
      | "give_do"
      | "upi"
      | "neft"
      | "cheque"
      | "cash"
      | "in_kind",
    orgAccountId: string | null = "account-1"
  ) => ({ channel, id, orgAccountId });

  it("is yes for a processed settlement item or matched bank line", () => {
    expect(reachedBankValue(contribution("settled", "give_do"), evidence)).toBe(
      "yes"
    );
    expect(reachedBankValue(contribution("matched", "upi"), evidence)).toBe(
      "yes"
    );
  });

  it("is not yet for unsettled gateway and unmatched direct deposits", () => {
    for (const channel of [
      "razorpay",
      "give_do",
      "upi",
      "neft",
      "cheque",
      "cash",
    ] as const) {
      expect(
        reachedBankValue(contribution("unmatched", channel), evidence)
      ).toBe("not_yet");
    }
  });

  it("is not applicable for in-kind and cash without an account", () => {
    expect(
      reachedBankValue(contribution("in-kind", "in_kind", null), evidence)
    ).toBe("not_applicable");
    expect(reachedBankValue(contribution("cash", "cash", null), evidence)).toBe(
      "not_applicable"
    );
  });

  it("keeps accountless UPI, NEFT and cheque gifts not yet", () => {
    for (const channel of ["upi", "neft", "cheque"] as const) {
      expect(
        reachedBankValue(
          contribution(`accountless-${channel}`, channel, null),
          evidence
        )
      ).toBe("not_yet");
    }
  });
});

describe("contributionBankScope", () => {
  const rule = (path: string, value: string) =>
    createFilterRule({
      id: `${path}-${value}`,
      operator: "is",
      path: [path],
      value,
    });

  it("fetches only rows matching the non-bank filters", () => {
    const query = createFilterQuery([
      rule("status", "received"),
      rule("reachedBank", "yes"),
    ]);
    const rows = [
      { id: "received", status: "received" },
      { id: "pending", status: "pending" },
    ] as ContributionRow[];

    expect(hasReachedBankFilter(query)).toBe(true);
    expect(contributionBankScope(rows, query, new Set(), "", fy)).toEqual([
      "received",
    ]);
  });

  it("does not request evidence without an active bank filter", () => {
    expect(
      contributionBankScope(
        [{ id: "received", status: "received" }] as ContributionRow[],
        createFilterQuery([rule("status", "received")]),
        new Set(),
        "",
        fy
      )
    ).toEqual([]);
  });

  it("keeps OR scopes conservative and then applies the table search", () => {
    const query = createFilterQuery(
      [rule("status", "received"), rule("reachedBank", "yes")],
      "or"
    );
    const rows = [
      {
        id: "received",
        party: { displayName: "Asha" },
        reference: "first",
        status: "received",
      },
      {
        id: "pending",
        party: { displayName: "Priya" },
        reference: "second",
        status: "pending",
      },
    ] as ContributionRow[];

    expect(contributionBankScope(rows, query, new Set(), "", fy)).toEqual([
      "received",
      "pending",
    ]);
    expect(contributionBankScope(rows, query, new Set(), "priya", fy)).toEqual([
      "pending",
    ]);
  });
});

describe("status and receipt filter values", () => {
  const gift = (overrides: Partial<ContributionRow>) =>
    ({
      amountPaise: 100_000,
      channel: "upi",
      currency: "INR",
      deductionEligible: "unknown",
      id: "g",
      partyId: "p",
      receipts: [],
      receivedOn: Date.UTC(2026, 4, 10),
      refunds: [],
      reportingMode: "electronic_or_account_payee",
      status: "received",
      ...overrides,
    }) as unknown as ContributionRow;
  const readiness = {
    cantIssue: new Map([["refunded", ["refund_recorded" as const]]]),
    needsDetails: new Set(["blocked"]),
    ready: new Set(["ready"]),
  };
  const value = getContributionFilterValue(new Set(), undefined, fy, readiness);

  it("filters receipted as received and offers no Receipted status", () => {
    expect(value(gift({ status: "receipted" }), ["status"])).toBe("received");
    const status = createContributionFilterFields([]).find(
      (field) => field.id === "status"
    );
    expect(status?.options?.map((option) => option.value)).toEqual([
      "pending",
      "received",
      "refunded",
      "reversed",
    ]);
  });

  it("derives the receipt value from synced data and the server's readiness", () => {
    expect(value(gift({ id: "ready" }), ["receipt"])).toBe("ready");
    expect(value(gift({ id: "blocked" }), ["receipt"])).toBe("needs_details");
    expect(value(gift({ id: "refunded" }), ["receipt"])).toBe("cant_issue");
    expect(value(gift({ id: "unknown" }), ["receipt"])).toBeNull();
    expect(value(gift({ channel: "razorpay" }), ["receipt"])).toBe("razorpay");
    expect(
      value(
        gift({
          receipts: [{ id: "r", number: "PI/2026-27/0001", voidedAt: null }],
          status: "receipted",
        } as unknown as Partial<ContributionRow>),
        ["receipt"]
      )
    ).toBe("issued");
    expect(value(gift({ status: "pending" }), ["receipt"])).toBe("none");
    expect(
      value(gift({ receivedOn: Date.UTC(2026, 2, 31) }), ["receipt"])
    ).toBe("not_needed");
  });

  it("offers the Receipt filter only to receipt readers", () => {
    const ids = (includeReceipt: boolean) =>
      createContributionFilterFields([], false, includeReceipt).map(
        (field) => field.id
      );
    expect(ids(false)).not.toContain("receipt");
    expect(ids(true)).toContain("receipt");
  });
});

describe("foldReceiptedStatusFilter", () => {
  const statusRule = (value: unknown) =>
    createFilterRule({ id: "s", operator: "is", path: ["status"], value });

  it("reads a saved Receipted status as Received", () => {
    const folded = foldReceiptedStatusFilter(
      createFilterQuery([
        statusRule(["receipted", "received", "pending"]),
        createFilterRule({
          id: "c",
          operator: "is",
          path: ["channel"],
          value: "receipted",
        }),
      ])
    );
    expect(folded?.rules).toMatchObject([
      { path: ["status"], value: ["received", "pending"] },
      { path: ["channel"], value: "receipted" },
    ]);
    expect(
      foldReceiptedStatusFilter(createFilterQuery([statusRule("receipted")]))
        ?.rules
    ).toMatchObject([{ value: "received" }]);
  });

  it("leaves other queries alone", () => {
    expect(
      foldReceiptedStatusFilter(createFilterQuery([statusRule("received")]))
    ).toBeNull();
  });
});
