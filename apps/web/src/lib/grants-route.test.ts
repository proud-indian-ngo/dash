import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_NAME: "Proud Indian Dashboard" },
}));

import { Route as GrantRoute } from "@/routes/_app/finance/grants/$id";
import { Route as GrantsRoute } from "@/routes/_app/finance/grants/index";

const allows = (
  route: { options: { beforeLoad?: unknown } },
  permissions: string[]
) => {
  try {
    (route.options.beforeLoad as (input: never) => unknown)({
      context: { permissions },
    } as never);
    return true;
  } catch {
    return false;
  }
};

describe("grants route guards", () => {
  it("opens Grants and a grant to finance.view only", () => {
    for (const route of [GrantsRoute, GrantRoute]) {
      expect(allows(route, [])).toBe(false);
      expect(allows(route, ["donors.view", "finance.manage"])).toBe(false);
      expect(allows(route, ["finance.view"])).toBe(true);
    }
  });
});
