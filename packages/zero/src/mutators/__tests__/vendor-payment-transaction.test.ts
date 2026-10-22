import { describe, expect, it } from "bun:test";

import { MAX_AMOUNT_PAISE } from "@pi-dash/shared/money";

import { createSchema } from "../vendor-payment-transaction";

describe("vendorPaymentTransaction mutator schemas", () => {
  describe("create", () => {
    const validInput = {
      amountPaise: 50_000,
      attachments: [],
      id: "txn-1",
      transactionDate: Date.now(),
      vendorPaymentId: "vp-1",
    };

    it("accepts valid input", () => {
      expect(createSchema.safeParse(validInput).success).toBe(true);
    });

    it("accepts valid input with optional fields", () => {
      const result = createSchema.safeParse({
        ...validInput,
        description: "Wire transfer",
        paymentMethod: "Bank transfer",
        paymentReference: "REF-123",
      });
      expect(result.success).toBe(true);
    });

    it("rejects zero amount", () => {
      expect(
        createSchema.safeParse({ ...validInput, amountPaise: 0 }).success
      ).toBe(false);
    });

    it("rejects negative amount", () => {
      expect(
        createSchema.safeParse({ ...validInput, amountPaise: -100 }).success
      ).toBe(false);
    });

    it("rejects fractional paise", () => {
      expect(
        createSchema.safeParse({ ...validInput, amountPaise: 1012.3 }).success
      ).toBe(false);
    });

    it("accepts whole paise", () => {
      expect(
        createSchema.safeParse({ ...validInput, amountPaise: 1012 }).success
      ).toBe(true);
    });

    it("caps the amount at the old numeric(12,2) limit", () => {
      expect(
        createSchema.safeParse({ ...validInput, amountPaise: MAX_AMOUNT_PAISE })
          .success
      ).toBe(true);
      expect(
        createSchema.safeParse({
          ...validInput,
          amountPaise: MAX_AMOUNT_PAISE + 1,
        }).success
      ).toBe(false);
    });

    it("rejects string amount", () => {
      expect(
        createSchema.safeParse({ ...validInput, amountPaise: "500" }).success
      ).toBe(false);
    });
  });
});
