import { describe, expect, it } from "bun:test";

import { getVendorPaymentFilterValue } from "./vendor-payment-filters";
import type { VendorPaymentWithRelations } from "./vendor-payment-types";

describe("getVendorPaymentFilterValue", () => {
  it("compares the total in rupees", () => {
    const row = {
      lineItems: [{ amountPaise: 1999 }, { amountPaise: 1 }],
    } as unknown as VendorPaymentWithRelations;
    expect(getVendorPaymentFilterValue(row, ["total"])).toBe(20);
  });
});
