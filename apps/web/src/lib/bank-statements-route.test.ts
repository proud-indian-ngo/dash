import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_NAME: "Proud Indian Dashboard" },
}));

import { Route as BankImportRoute } from "@/routes/_app/income/bank/import";
import { Route as BankRoute } from "@/routes/_app/income/bank/index";

const allows = (
  beforeLoad: ((input: never) => unknown) | undefined,
  permissions: string[]
) => {
  try {
    beforeLoad?.({ context: { permissions } } as never);
    return true;
  } catch {
    return false;
  }
};

describe("bank statements route guards", () => {
  it("shows the page to finance.view or finance.manage, not donor roles", () => {
    const { beforeLoad } = BankRoute.options;
    expect(beforeLoad).toBeTypeOf("function");
    expect(allows(beforeLoad as never, [])).toBe(false);
    expect(allows(beforeLoad as never, ["donors.view", "donors.manage"])).toBe(
      false
    );
    expect(allows(beforeLoad as never, ["finance.view"])).toBe(true);
    expect(allows(beforeLoad as never, ["finance.manage"])).toBe(true);
  });

  it("opens the importer to finance.manage only", () => {
    const { beforeLoad } = BankImportRoute.options;
    expect(beforeLoad).toBeTypeOf("function");
    expect(allows(beforeLoad as never, ["finance.view", "donors.manage"])).toBe(
      false
    );
    expect(allows(beforeLoad as never, ["finance.manage"])).toBe(true);
  });
});
