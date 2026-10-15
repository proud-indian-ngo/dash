import { describe, expect, it } from "bun:test";

import { type RenderedFrom, stillAsRendered } from "./voucher-render-check";

const rendered: RenderedFrom = {
  amountPaise: 80_000,
  categoryId: "cat-1",
  claimantId: "claimant-1",
  description: "Cleaning",
  expenseDate: "2026-10-01",
  payeeName: "Test Payee",
  payeePhone: "+919876543210",
};
const { claimantId, expenseDate, ...item } = rendered;
const request = { claimantId, expenseDate };

describe("stillAsRendered", () => {
  it("links a voucher whose item and date are unchanged", () => {
    expect(stillAsRendered(item, request, rendered)).toBe(true);
  });

  it.each([
    ["amount", { amountPaise: 90_000 }],
    ["category", { categoryId: "cat-2" }],
    ["description", { description: "Painting" }],
    ["payee", { payeeName: "Other Payee" }],
    ["mobile", { payeePhone: null }],
  ])("discards a render when the %s changed", (_, change) => {
    expect(stillAsRendered({ ...item, ...change }, request, rendered)).toBe(
      false
    );
  });

  it("discards a render when the day changed or the item is gone", () => {
    expect(
      stillAsRendered(item, { ...request, expenseDate: "2026-10-02" }, rendered)
    ).toBe(false);
    expect(stillAsRendered(undefined, request, rendered)).toBe(false);
    expect(stillAsRendered(item, undefined, rendered)).toBe(false);
  });

  it("discards a render when the claimant changed", () => {
    expect(
      stillAsRendered(item, { ...request, claimantId: "claimant-2" }, rendered)
    ).toBe(false);
  });
});
