import { describe, expect, it } from "vitest";
import { computeRunningTotal, formatINR, lineItemSchema } from "./form-schemas";

describe("computeRunningTotal", () => {
  it("sums valid amounts", () => {
    const items = [
      {
        id: "1",
        categoryId: "c",
        description: "a",
        generateVoucher: false,
        amount: "100.50",
      },
      {
        id: "2",
        categoryId: "c",
        description: "b",
        generateVoucher: false,
        amount: "200",
      },
    ];
    expect(computeRunningTotal(items)).toBeCloseTo(300.5);
  });

  it("returns 0 for empty array", () => {
    expect(computeRunningTotal([])).toBe(0);
  });

  it("treats non-numeric amounts as 0", () => {
    const items = [
      {
        id: "1",
        categoryId: "c",
        description: "a",
        generateVoucher: false,
        amount: "abc",
      },
      {
        id: "2",
        categoryId: "c",
        description: "b",
        generateVoucher: false,
        amount: "",
      },
      {
        id: "3",
        categoryId: "c",
        description: "c",
        generateVoucher: false,
        amount: "50",
      },
    ];
    expect(computeRunningTotal(items)).toBe(50);
  });
});

describe("formatINR", () => {
  it("formats decimal", () => {
    const result = formatINR(1234.56);
    expect(result).toContain("1,234.56");
  });

  it("uses Indian number grouping for lakhs", () => {
    const result = formatINR(100_000);
    expect(result).toContain("1,00,000");
  });
});

describe("lineItemSchema", () => {
  const valid = {
    id: "li-1",
    categoryId: "cat-1",
    description: "Taxi fare",
    amount: "150.50",
    generateVoucher: false,
  };

  it("accepts valid line item", () => {
    expect(lineItemSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects empty categoryId", () => {
    expect(lineItemSchema.safeParse({ ...valid, categoryId: "" }).success).toBe(
      false
    );
  });

  it("rejects whitespace-only description", () => {
    expect(
      lineItemSchema.safeParse({ ...valid, description: "   " }).success
    ).toBe(false);
  });

  it("rejects empty amount", () => {
    expect(lineItemSchema.safeParse({ ...valid, amount: "" }).success).toBe(
      false
    );
  });

  it("rejects non-positive amounts", () => {
    expect(lineItemSchema.safeParse({ ...valid, amount: "0" }).success).toBe(
      false
    );
    expect(lineItemSchema.safeParse({ ...valid, amount: "-10" }).success).toBe(
      false
    );
  });

  it("rejects amount with more than 2 decimal places", () => {
    expect(
      lineItemSchema.safeParse({ ...valid, amount: "10.123" }).success
    ).toBe(false);
  });
});
