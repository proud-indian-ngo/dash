import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_NAME: "Proud Indian Dashboard" },
}));

// Keep route-guard coverage independent of server functions loaded by the UI.
mock.module("@/components/income/payout/payout-import-wizard", () => ({
  PayoutImportWizard: () => null,
}));

const { Route } = await import("@/routes/_app/income/payout/import");

describe("give.do payout import route guard", () => {
  const { beforeLoad } = Route.options;

  it("denies each required permission independently", () => {
    expect(beforeLoad).toBeTypeOf("function");
    for (const permissions of [
      [],
      ["donors.manage"],
      ["finance.manage"],
      ["donors.view", "finance.view"],
    ]) {
      expect(() =>
        beforeLoad?.({ context: { permissions } } as never)
      ).toThrow();
    }
  });

  it("allows donors.manage together with finance.manage", () => {
    expect(() =>
      beforeLoad?.({
        context: { permissions: ["donors.manage", "finance.manage"] },
      } as never)
    ).not.toThrow();
  });
});
