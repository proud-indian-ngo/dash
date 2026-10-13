import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_NAME: "Proud Indian Dashboard" },
}));
mock.module("@/components/settings/sections/programmes-section", () => ({
  ProgrammesSection: () => null,
}));
mock.module("@/components/settings/settings-layout", () => ({
  SettingsPage: () => null,
}));

import { Route as ProgrammesRoute } from "@/routes/_app/settings/programmes";

describe("programmes settings route guard", () => {
  it("requires finance.manage", () => {
    const { beforeLoad } = ProgrammesRoute.options;

    expect(beforeLoad).toBeTypeOf("function");
    expect(() =>
      beforeLoad?.({
        context: { permissions: ["finance.view"] },
      } as never)
    ).toThrow();
    expect(() =>
      beforeLoad?.({
        context: { permissions: ["finance.manage"] },
      } as never)
    ).not.toThrow();
  });
});
