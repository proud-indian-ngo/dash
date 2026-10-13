import { describe, expect, it } from "bun:test";

import { computeRunningTotalPaise, lineItemSchema } from "./form-schemas";

describe("computeRunningTotalPaise", () => {
  it("sums valid amounts", () => {
    const items = [
      {
        amount: "100.50",
        categoryId: "c",
        description: "a",
        generateVoucher: false,
        id: "1",
      },
      {
        amount: "200",
        categoryId: "c",
        description: "b",
        generateVoucher: false,
        id: "2",
      },
    ];
    expect(computeRunningTotalPaise(items)).toBe(30_050);
  });

  it("returns 0 for empty array", () => {
    expect(computeRunningTotalPaise([])).toBe(0);
  });

  it("treats non-numeric amounts as 0", () => {
    const items = [
      {
        amount: "abc",
        categoryId: "c",
        description: "a",
        generateVoucher: false,
        id: "1",
      },
      {
        amount: "",
        categoryId: "c",
        description: "b",
        generateVoucher: false,
        id: "2",
      },
      {
        amount: "50",
        categoryId: "c",
        description: "c",
        generateVoucher: false,
        id: "3",
      },
    ];
    expect(computeRunningTotalPaise(items)).toBe(5000);
  });
});

describe("lineItemSchema", () => {
  const valid = {
    amount: "150.50",
    categoryId: "cat-1",
    description: "Taxi fare",
    generateVoucher: false,
    id: "li-1",
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

  it("accepts amounts that float arithmetic would distort", () => {
    expect(
      lineItemSchema.safeParse({ ...valid, amount: "19.99" }).success
    ).toBe(true);
  });

  it("rejects amount with more than 2 decimal places", () => {
    expect(
      lineItemSchema.safeParse({ ...valid, amount: "10.123" }).success
    ).toBe(false);
  });
});
