import { describe, expect, it } from "bun:test";

import type { RequestRow } from "@/lib/reimbursement-types";

import { getReimbursementFilterValue } from "./reimbursement-filters";

describe("getReimbursementFilterValue", () => {
  it("compares the total in rupees", () => {
    const row = {
      lineItems: [{ amountPaise: 1999 }, { amountPaise: 1 }],
      type: "reimbursement",
    } as unknown as RequestRow;
    expect(getReimbursementFilterValue(row, ["total"])).toBe(20);
  });
});
