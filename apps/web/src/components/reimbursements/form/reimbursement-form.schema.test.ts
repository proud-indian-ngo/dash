import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reimbursementFormSchema } from "./reimbursement-form.schema";

const validLineItem = {
  id: "test-id-1",
  categoryId: "cat-1",
  description: "Office supplies",
  amount: "100.00",
};

const validData = {
  title: "Monthly Reimbursement",
  city: "bangalore" as const,
  expenseDate: "2025-06-01",
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

describe("reimbursementFormSchema", () => {
  it("accepts valid data", () => {
    const result = reimbursementFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = reimbursementFormSchema.safeParse({
      ...validData,
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects undefined city", () => {
    const result = reimbursementFormSchema.safeParse({
      ...validData,
      city: undefined,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty bank account name", () => {
    const result = reimbursementFormSchema.safeParse({
      ...validData,
      bankAccountName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty line items", () => {
    const result = reimbursementFormSchema.safeParse({
      ...validData,
      lineItems: [],
    });
    expect(result.success).toBe(false);
  });

  describe("expenseDate", () => {
    it("rejects empty expense date", () => {
      const result = reimbursementFormSchema.safeParse({
        ...validData,
        expenseDate: "",
      });
      expect(result.success).toBe(false);
    });

    it("rejects future expense date", () => {
      const result = reimbursementFormSchema.safeParse({
        ...validData,
        expenseDate: "2025-12-31",
      });
      expect(result.success).toBe(false);
    });

    it("accepts today as expense date", () => {
      const result = reimbursementFormSchema.safeParse({
        ...validData,
        expenseDate: "2025-06-15",
      });
      expect(result.success).toBe(true);
    });

    it("accepts past expense date", () => {
      const result = reimbursementFormSchema.safeParse({
        ...validData,
        expenseDate: "2025-01-01",
      });
      expect(result.success).toBe(true);
    });
  });
});
