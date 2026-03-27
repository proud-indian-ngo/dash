import { describe, expect, it } from "vitest";
import z from "zod";

const attachmentSchema = z.object({
  id: z.string(),
  type: z.enum(["file", "url"]),
  objectKey: z.string().optional(),
  url: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
});

const createSchema = z.object({
  id: z.string(),
  vendorPaymentId: z.string(),
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .multipleOf(0.01, "Amount must have at most 2 decimal places"),
  description: z.string().trim().optional(),
  transactionDate: z.number(),
  paymentMethod: z.string().trim().optional(),
  paymentReference: z.string().trim().optional(),
  attachments: z.array(attachmentSchema),
});

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
      id: "txn-1",
      vendorPaymentId: "vp-1",
      amount: 500.0,
      transactionDate: Date.now(),
      attachments: [],
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
      expect(createSchema.safeParse({ ...validInput, amount: 0 }).success).toBe(
        false
      );
    });

    it("rejects negative amount", () => {
      expect(
        createSchema.safeParse({ ...validInput, amount: -100 }).success
      ).toBe(false);
    });

    it("rejects amount with more than 2 decimal places", () => {
      expect(
        createSchema.safeParse({ ...validInput, amount: 10.123 }).success
      ).toBe(false);
    });

    it("accepts amount with exactly 2 decimal places", () => {
      expect(
        createSchema.safeParse({ ...validInput, amount: 10.12 }).success
      ).toBe(true);
    });

    it("rejects missing vendorPaymentId", () => {
      const { vendorPaymentId: _, ...rest } = validInput;
      expect(createSchema.safeParse(rest).success).toBe(false);
    });

    it("rejects string amount", () => {
      expect(
        createSchema.safeParse({ ...validInput, amount: "500" }).success
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
