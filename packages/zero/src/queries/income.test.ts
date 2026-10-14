import { describe, expect, it } from "bun:test";

import { canSeeIncome, canSeeReceipts } from "./income";

const ctx = (permissions: string[]) =>
  ({ permissions, role: "finance_admin", userId: "u-1" }) as never;

describe("canSeeIncome", () => {
  it("admits viewing or managing donors or finance", () => {
    for (const permission of [
      "donors.view",
      "finance.view",
      "donors.manage",
      "finance.manage",
    ]) {
      expect(canSeeIncome(ctx([permission]))).toBe(true);
    }
  });

  it("refuses everyone else and anonymous viewers", () => {
    expect(canSeeIncome(ctx(["requests.view_all"]))).toBe(false);
    expect(canSeeIncome(null)).toBe(false);
    expect(canSeeIncome(undefined)).toBe(false);
  });
});

describe("canSeeReceipts", () => {
  it("admits finance roles, donor managers and receipt issuers who see income", () => {
    for (const permission of [
      "finance.view",
      "finance.manage",
      "donors.manage",
    ]) {
      expect(canSeeReceipts(ctx([permission]))).toBe(true);
    }
    expect(canSeeReceipts(ctx(["donors.view", "donors.receipt"]))).toBe(true);
  });

  it("opens nothing with donors.receipt alone", () => {
    expect(canSeeReceipts(ctx(["donors.receipt"]))).toBe(false);
  });

  it("refuses donor viewers alone and anonymous viewers", () => {
    expect(canSeeReceipts(ctx(["donors.view"]))).toBe(false);
    expect(canSeeReceipts(null)).toBe(false);
  });
});
