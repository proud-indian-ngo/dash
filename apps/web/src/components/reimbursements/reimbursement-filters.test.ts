import { describe, expect, it } from "bun:test";

import { PROGRAMME_IDS } from "@pi-dash/shared/constants";

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
});
