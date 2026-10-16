import { describe, expect, it } from "bun:test";

import { PROGRAMME_IDS } from "@pi-dash/shared/constants";

import {
  isMissingPaymentProof,
  MISSING_PROOF_FILTER,
} from "@/lib/payment-proof";
import type { RequestRow } from "@/lib/reimbursement-types";
import { requestToClearValue, TO_CLEAR_FILTER } from "@/lib/request-programme";

import { getReimbursementFilterValue } from "./reimbursement-filters";

const row = (fields: Record<string, unknown>) =>
  ({
    lineItems: [],
    type: "reimbursement",
    ...fields,
  }) as unknown as RequestRow;

describe("getReimbursementFilterValue", () => {
  it("compares the total in rupees", () => {
    const total = row({
      lineItems: [{ amountPaise: 1999 }, { amountPaise: 1 }],
    });
    expect(getReimbursementFilterValue(total, ["total"])).toBe(20);
  });

  it("keeps the To clear filter apart from the Unallocated programme", () => {
    const legacy = row({
      chargedProgrammeId: PROGRAMME_IDS.unallocated,
      chargedTo: "programme",
    });
    // Charged to an event whose programme is Unallocated: the Programme
    // filter's Unallocated matches it, but there is nothing to clear.
    const eventOnUnallocated = row({
      chargedTo: "event",
      event: { programmeId: PROGRAMME_IDS.unallocated },
    });
    const rows = [legacy, eventOnUnallocated];

    for (const r of rows) {
      expect(getReimbursementFilterValue(r, ["programme"])).toBe(
        PROGRAMME_IDS.unallocated
      );
    }
    const matching = rows.filter(
      (r) =>
        getReimbursementFilterValue(r, [TO_CLEAR_FILTER.path]) ===
        TO_CLEAR_FILTER.value
    );
    // The button's count uses the same rule as the filter it applies.
    const counted = rows.filter(
      (r) => requestToClearValue(r as never) !== null
    );
    expect(matching).toEqual([legacy]);
    expect(counted).toEqual(matching);
  });

  it("finds approved claims missing payment proof, as the button counts them", () => {
    const missing = row({ approvalScreenshotKey: null, status: "approved" });
    // 1 Apr 2026, 00:30 in India: from the cutover.
    const atCutover = row({
      approvalScreenshotKey: null,
      reviewedAt: Date.parse("2026-03-31T19:00:00Z"),
      status: "approved",
    });
    const rows = [
      missing,
      atCutover,
      row({ approvalScreenshotKey: "proof.png", status: "approved" }),
      row({ approvalScreenshotKey: null, status: "pending" }),
      row({ approvalScreenshotKey: null, status: "rejected" }),
      row({
        approvalScreenshotKey: null,
        status: "approved",
        voidedAt: 1_760_000_000_000,
      }),
      // Approved before 1 Apr 2026 in India (31 Mar, 23:00 IST): the books
      // never post it.
      row({
        approvalScreenshotKey: null,
        reviewedAt: Date.parse("2026-03-31T17:30:00Z"),
        status: "approved",
      }),
      // Advances don't post to the books.
      row({
        approvalScreenshotKey: null,
        status: "approved",
        type: "advance_payment",
      }),
    ];
    const matching = rows.filter(
      (r) =>
        getReimbursementFilterValue(r, [MISSING_PROOF_FILTER.path]) ===
        MISSING_PROOF_FILTER.value
    );
    expect(matching).toEqual([missing, atCutover]);
    expect(rows.filter(isMissingPaymentProof)).toEqual(matching);
  });
});
