import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_NAME: "Proud Indian Dashboard" },
}));

import { Route as BooksRoute } from "@/routes/_app/finance/books/index";
import { Route as OpeningRoute } from "@/routes/_app/finance/books/opening";

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

describe("books route guards", () => {
  it("shows the books to finance.view or finance.manage, not donor roles", () => {
    const { beforeLoad } = BooksRoute.options;
    expect(beforeLoad).toBeTypeOf("function");
    expect(allows(beforeLoad as never, [])).toBe(false);
    expect(allows(beforeLoad as never, ["donors.view", "donors.manage"])).toBe(
      false
    );
    expect(allows(beforeLoad as never, ["finance.view"])).toBe(true);
    expect(allows(beforeLoad as never, ["finance.manage"])).toBe(true);
  });

  it("opens the opening balances to book readers and the treasurer", () => {
    const { beforeLoad } = OpeningRoute.options;
    expect(beforeLoad).toBeTypeOf("function");
    expect(allows(beforeLoad as never, ["donors.view"])).toBe(false);
    expect(allows(beforeLoad as never, ["finance.view"])).toBe(true);
    expect(allows(beforeLoad as never, ["finance.post_opening"])).toBe(true);
  });
});
