import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_NAME: "Proud Indian Dashboard" },
}));

import { Route as IncomeRoute } from "@/routes/_app/income/route";

describe("income route guard", () => {
  const { beforeLoad } = IncomeRoute.options;

  it("redirects without donors.view or finance.view", () => {
    expect(beforeLoad).toBeTypeOf("function");
    for (const permissions of [[], ["vendors.view_all", "donors.manage"]]) {
      expect(() =>
        beforeLoad?.({ context: { permissions } } as never)
      ).toThrow();
    }
  });

  it("allows donors.view or finance.view", () => {
    for (const permission of ["donors.view", "finance.view"]) {
      expect(() =>
        beforeLoad?.({ context: { permissions: [permission] } } as never)
      ).not.toThrow();
    }
  });
});
