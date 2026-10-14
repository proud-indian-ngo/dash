import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_NAME: "Proud Indian Dashboard" },
}));

import { Route as ImportRoute } from "@/routes/_app/income/import";

describe("income import route guard", () => {
  const { beforeLoad } = ImportRoute.options;

  it("redirects anyone without donors.manage, including viewers and finance", () => {
    expect(beforeLoad).toBeTypeOf("function");
    for (const permissions of [
      [],
      ["donors.view"],
      ["finance.view", "finance.manage"],
    ]) {
      expect(() =>
        beforeLoad?.({ context: { permissions } } as never)
      ).toThrow();
    }
  });

  it("allows donors.manage", () => {
    expect(() =>
      beforeLoad?.({ context: { permissions: ["donors.manage"] } } as never)
    ).not.toThrow();
  });
});
