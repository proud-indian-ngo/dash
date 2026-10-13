import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_NAME: "Proud Indian Dashboard" },
}));

import { Route as IncomeRoute } from "@/routes/_app/income/route";

describe("income route guard", () => {
  const { beforeLoad } = IncomeRoute.options;

  it("redirects without a donors or finance permission", () => {
    expect(beforeLoad).toBeTypeOf("function");
    for (const permissions of [[], ["vendors.view_all", "requests.view_all"]]) {
      expect(() =>
        beforeLoad?.({ context: { permissions } } as never)
      ).toThrow();
    }
  });

  it("allows viewing or managing donors or finance", () => {
    for (const permission of [
      "donors.view",
      "finance.view",
      "donors.manage",
      "finance.manage",
    ]) {
      expect(() =>
        beforeLoad?.({ context: { permissions: [permission] } } as never)
      ).not.toThrow();
    }
  });
});
