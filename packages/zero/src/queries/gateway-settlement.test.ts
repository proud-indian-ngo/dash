import { describe, expect, it } from "bun:test";

import { canSeeSettlements } from "./gateway-settlement";

const ctx = (permissions: string[]) =>
  ({ permissions, role: "finance_admin", userId: "u-1" }) as never;

describe("canSeeSettlements", () => {
  it("admits viewing or managing finance", () => {
    expect(canSeeSettlements(ctx(["finance.view"]))).toBe(true);
    expect(canSeeSettlements(ctx(["finance.manage"]))).toBe(true);
  });

  it("refuses donor permissions alone and anonymous viewers", () => {
    expect(canSeeSettlements(ctx(["donors.view"]))).toBe(false);
    expect(canSeeSettlements(ctx(["donors.view", "donors.manage"]))).toBe(
      false
    );
    expect(canSeeSettlements(null)).toBe(false);
    expect(canSeeSettlements(undefined)).toBe(false);
  });
});
