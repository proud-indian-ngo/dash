import { describe, expect, it } from "bun:test";

import { mutatorLineItemSchema } from "./shared-schemas";

describe("mutatorLineItemSchema", () => {
  const valid = {
    amountPaise: 15_050,
    categoryId: "cat-1",
    description: "Taxi fare",
    id: "li-1",
    sortOrder: 0,
  };

  it("accepts valid line item", () => {
    expect(mutatorLineItemSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects zero amount", () => {
    expect(
      mutatorLineItemSchema.safeParse({ ...valid, amountPaise: 0 }).success
    ).toBe(false);
  });

  it("rejects negative amount", () => {
    expect(
      mutatorLineItemSchema.safeParse({ ...valid, amountPaise: -10 }).success
    ).toBe(false);
  });

  it("rejects fractional and unsafe paise", () => {
    expect(
      mutatorLineItemSchema.safeParse({ ...valid, amountPaise: 1012.3 }).success
    ).toBe(false);
    expect(
      mutatorLineItemSchema.safeParse({
        ...valid,
        amountPaise: Number.MAX_SAFE_INTEGER + 1,
      }).success
    ).toBe(false);
  });

  it("rejects empty description", () => {
    expect(
      mutatorLineItemSchema.safeParse({ ...valid, description: "" }).success
    ).toBe(false);
  });

  it("rejects whitespace-only description", () => {
    expect(
      mutatorLineItemSchema.safeParse({ ...valid, description: "   " }).success
    ).toBe(false);
  });
});
