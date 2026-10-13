import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/env/web", () => ({
  env: { VITE_APP_NAME: "Proud Indian Dashboard" },
}));

import { Route as DonorsRoute } from "@/routes/_app/donors/route";

describe("donors route guard", () => {
  it("requires donors.view", () => {
    const { beforeLoad } = DonorsRoute.options;
    expect(beforeLoad).toBeTypeOf("function");
    expect(() =>
      beforeLoad?.({ context: { permissions: ["vendors.view_all"] } } as never)
    ).toThrow();
    expect(() =>
      beforeLoad?.({ context: { permissions: ["donors.view"] } } as never)
    ).not.toThrow();
  });
});
