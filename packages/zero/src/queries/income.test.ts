import { describe, expect, it } from "bun:test";

import { canSeeIncome } from "./income";

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
