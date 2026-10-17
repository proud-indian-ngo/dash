import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_NAME: "Proud Indian Dashboard" },
}));

import { Route } from "@/routes/_app/finance/budgets";

const allows = (permissions: string[]) => {
  try {
    (Route.options.beforeLoad as (input: never) => unknown)({
      context: { permissions },
    } as never);
    return true;
  } catch {
    return false;
  }
};

describe("budgets route guard", () => {
  it("opens Budgets to finance.view only", () => {
    expect(allows([])).toBe(false);
    expect(allows(["donors.view", "finance.adjust"])).toBe(false);
    expect(allows(["finance.view"])).toBe(true);
  });
});
