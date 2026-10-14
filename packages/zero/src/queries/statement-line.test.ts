import { describe, expect, it } from "bun:test";

import { canSeeStatementLines } from "./statement-line";

const ctx = (permissions: string[]) =>
  ({ permissions, role: "finance_admin", userId: "u-1" }) as never;

describe("canSeeStatementLines", () => {
  it("admits viewing or managing finance", () => {
    expect(canSeeStatementLines(ctx(["finance.view"]))).toBe(true);
    expect(canSeeStatementLines(ctx(["finance.manage"]))).toBe(true);
  });

  it("refuses donor permissions alone and anonymous viewers", () => {
    expect(canSeeStatementLines(ctx(["donors.view", "donors.manage"]))).toBe(
      false
    );
    expect(canSeeStatementLines(null)).toBe(false);
  });
});
