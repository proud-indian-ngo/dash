import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_NAME: "Proud Indian Dashboard" },
}));
mock.module("@/components/settings/sections/programmes-section", () => ({
  ProgrammesSection: () => null,
}));
mock.module("@/components/settings/sections/cost-centres-section", () => ({
  CostCentresSection: () => null,
}));
mock.module("@/components/settings/sections/org-accounts-section", () => ({
  OrgAccountsSection: () => null,
}));
mock.module("@/components/settings/sections/projects-section", () => ({
  ProjectsSection: () => null,
}));
mock.module("@/components/settings/sections/razorpay-section", () => ({
  RazorpaySection: () => null,
}));
mock.module("@/components/settings/settings-layout", () => ({
  SettingsPage: () => null,
}));

import { Route as CostCentresRoute } from "@/routes/_app/settings/cost-centres";
import { Route as IntegrationsRoute } from "@/routes/_app/settings/integrations";
import { Route as OrgAccountsRoute } from "@/routes/_app/settings/org-accounts";
import { Route as ProgrammesRoute } from "@/routes/_app/settings/programmes";
import { Route as ProjectsRoute } from "@/routes/_app/settings/projects";

describe("projects settings route guard", () => {
  it("requires finance.manage", () => {
    const { beforeLoad } = ProjectsRoute.options;
    expect(() =>
      beforeLoad?.({ context: { permissions: ["finance.view"] } } as never)
    ).toThrow();
    expect(() =>
      beforeLoad?.({ context: { permissions: ["finance.manage"] } } as never)
    ).not.toThrow();
  });
});

describe("cost centres settings route guard", () => {
  it("requires finance.manage", () => {
    const { beforeLoad } = CostCentresRoute.options;
    expect(() =>
      beforeLoad?.({ context: { permissions: ["finance.view"] } } as never)
    ).toThrow();
    expect(() =>
      beforeLoad?.({ context: { permissions: ["finance.manage"] } } as never)
    ).not.toThrow();
  });
});

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

describe("organisation accounts settings route guard", () => {
  it("requires finance.view", () => {
    const { beforeLoad } = OrgAccountsRoute.options;
    for (const permissions of [[], ["donors.view"], ["donors.manage"]]) {
      expect(() =>
        beforeLoad?.({ context: { permissions } } as never)
      ).toThrow();
    }
    expect(() =>
      beforeLoad?.({ context: { permissions: ["finance.view"] } } as never)
    ).not.toThrow();
  });
});

describe("integrations settings route guard", () => {
  it("requires finance.view, which finance.manage roles also hold", () => {
    const { beforeLoad } = IntegrationsRoute.options;
    for (const permissions of [[], ["donors.view"], ["donors.manage"]]) {
      expect(() =>
        beforeLoad?.({ context: { permissions } } as never)
      ).toThrow();
    }
    expect(() =>
      beforeLoad?.({ context: { permissions: ["finance.view"] } } as never)
    ).not.toThrow();
  });
});
