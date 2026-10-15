import { describe, expect, it } from "bun:test";

import {
  type RenderedFrom,
  stillAsRendered,
  voucherPayee,
} from "./voucher-render-check";

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

describe("voucherPayee", () => {
  const claimant = { name: "Asha Rao", phone: "+919000000001" };

  it("prints a named payee with their own mobile", () => {
    expect(
      voucherPayee({ payeeName: " Ravi ", payeePhone: null }, claimant)
    ).toEqual({ paidTo: "Ravi", payeePhone: null });
  });

  it("prints the claimant and their mobile when no payee is stored", () => {
    expect(
      voucherPayee({ payeeName: null, payeePhone: null }, claimant)
    ).toEqual({ paidTo: "Asha Rao", payeePhone: "+919000000001" });
  });

  it("prints a claimant name outside the English-letters rule", () => {
    expect(
      voucherPayee(
        { payeeName: null, payeePhone: null },
        { name: "आशा राव", phone: null }
      )
    ).toEqual({ paidTo: "आशा राव", payeePhone: null });
  });

  it("leaves out a claimant mobile that isn't an Indian mobile", () => {
    expect(
      voucherPayee(
        { payeeName: null, payeePhone: null },
        { name: "Asha Rao", phone: "+14155550123" }
      ).payeePhone
    ).toBeNull();
  });

  it("falls back to Unknown without a claimant", () => {
    expect(
      voucherPayee({ payeeName: null, payeePhone: null }, undefined)
    ).toEqual({ paidTo: "Unknown", payeePhone: null });
  });
});
