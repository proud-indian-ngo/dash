import { describe, expect, it } from "bun:test";

import { MAX_AMOUNT_PAISE } from "@pi-dash/shared/money";
import z from "zod";

import { createSchema } from "../vendor-payment-transaction";

const approveSchema = z.object({
  id: z.string(),
  note: z.string().optional(),
});

const rejectSchema = z.object({
  id: z.string(),
  reason: z.string().trim().min(1),
});

const deleteSchema = z.object({ id: z.string() });

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

    it("rejects missing vendorPaymentId", () => {
      const { vendorPaymentId: _, ...rest } = validInput;
      expect(createSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects string amount", () => {
      expect(
        createSchema.safeParse({ ...validInput, amountPaise: "500" }).success
      ).toBe(false);
    });
  });

  describe("approve", () => {
    it("accepts valid input with note", () => {
      expect(
        approveSchema.safeParse({ id: "txn-1", note: "Verified" }).success
      ).toBe(true);
    });

    it("accepts valid input without note", () => {
      expect(approveSchema.safeParse({ id: "txn-1" }).success).toBe(true);
    });

    it("rejects missing id", () => {
      expect(approveSchema.safeParse({}).success).toBe(false);
    });
  });

  describe("reject", () => {
    it("accepts valid input with reason", () => {
      expect(
        rejectSchema.safeParse({ id: "txn-1", reason: "Duplicate payment" })
          .success
      ).toBe(true);
    });

    it("rejects empty reason", () => {
      expect(rejectSchema.safeParse({ id: "txn-1", reason: "" }).success).toBe(
        false
      );
    });

    it("rejects whitespace-only reason", () => {
      expect(
        rejectSchema.safeParse({ id: "txn-1", reason: "   " }).success
      ).toBe(false);
    });
  });

  describe("delete", () => {
    it("accepts valid input", () => {
      expect(deleteSchema.safeParse({ id: "txn-1" }).success).toBe(true);
    });

    it("rejects missing id", () => {
      expect(deleteSchema.safeParse({}).success).toBe(false);
    });
  });
});
