import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advancePaymentRequestFormSchema,
  reimbursementRequestFormSchema,
  requestFormSchema,
} from "./request-form.schema";

const validLineItem = {
  id: "test-id-1",
  categoryId: "cat-1",
  description: "Office supplies",
  amount: "100.00",
};

const validReimbursement = {
  type: "reimbursement" as const,
  title: "Monthly Reimbursement",
  city: "bangalore" as const,
  expenseDate: new Date(2025, 5, 1),
  bankAccountName: "HDFC Savings",
  bankAccountNumber: "1234567890",
  bankAccountIfscCode: "HDFC0001234",
  lineItems: [validLineItem],
  attachments: [],
};

const validAdvancePayment = {
  type: "advance_payment" as const,
  title: "Travel Advance",
  city: "mumbai" as const,
  bankAccountName: "HDFC Savings",
  bankAccountNumber: "1234567890",
  bankAccountIfscCode: "HDFC0001234",
  lineItems: [validLineItem],
  attachments: [],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2025, 5, 15));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reimbursementRequestFormSchema", () => {
  it("accepts valid reimbursement data", () => {
    const result = reimbursementRequestFormSchema.safeParse(validReimbursement);
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = reimbursementRequestFormSchema.safeParse({
      ...validReimbursement,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects undefined city", () => {
    const result = reimbursementRequestFormSchema.safeParse({
      ...validReimbursement,
      city: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty line items", () => {
    const result = reimbursementRequestFormSchema.safeParse({
      ...validReimbursement,
      lineItems: [],
    });
    expect(result.success).toBe(false);
  });

  describe("expenseDate", () => {
    it("rejects empty expense date", () => {
      const result = reimbursementRequestFormSchema.safeParse({
        ...validReimbursement,
        expenseDate: undefined,
      });
      expect(result.success).toBe(false);
    });

    it("rejects future expense date", () => {
      const result = reimbursementRequestFormSchema.safeParse({
        ...validReimbursement,
        expenseDate: new Date(2025, 11, 31),
      });
      expect(result.success).toBe(false);
    });

    it("accepts today as expense date", () => {
      const result = reimbursementRequestFormSchema.safeParse({
        ...validReimbursement,
        expenseDate: new Date(),
      });
      expect(result.success).toBe(true);
    });

    it("accepts past expense date", () => {
      const result = reimbursementRequestFormSchema.safeParse({
        ...validReimbursement,
        expenseDate: new Date(2025, 0, 1),
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("advancePaymentRequestFormSchema", () => {
  it("accepts valid advance payment data (no expenseDate)", () => {
    const result =
      advancePaymentRequestFormSchema.safeParse(validAdvancePayment);
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = advancePaymentRequestFormSchema.safeParse({
      ...validAdvancePayment,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects undefined city", () => {
    const result = advancePaymentRequestFormSchema.safeParse({
      ...validAdvancePayment,
      city: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty line items", () => {
    const result = advancePaymentRequestFormSchema.safeParse({
      ...validAdvancePayment,
      lineItems: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("requestFormSchema (discriminated union)", () => {
  it("selects reimbursement schema for type reimbursement", () => {
    const result = requestFormSchema.safeParse(validReimbursement);
    expect(result.success).toBe(true);
  });

  it("selects advance payment schema for type advance_payment", () => {
    const result = requestFormSchema.safeParse(validAdvancePayment);
    expect(result.success).toBe(true);
  });

  it("rejects reimbursement with undefined expenseDate via discriminated union", () => {
    const result = requestFormSchema.safeParse({
      ...validReimbursement,
      expenseDate: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("accepts advance payment without expenseDate via discriminated union", () => {
    const result = requestFormSchema.safeParse(validAdvancePayment);
    expect(result.success).toBe(true);
  });
});
