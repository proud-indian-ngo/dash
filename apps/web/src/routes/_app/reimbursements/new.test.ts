import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/reimbursements/reimbursement-form", () => ({
  ReimbursementForm: () => null,
}));

import { Route } from "./new";

describe("new reimbursement route", () => {
  it("requires requests.create", () => {
    const { beforeLoad } = Route.options;

    expect(beforeLoad).toBeTypeOf("function");
    expect(() =>
      beforeLoad?.({
        context: { permissions: ["requests.view_own"] },
      } as never)
    ).toThrow();
    expect(() =>
      beforeLoad?.({
        context: { permissions: ["requests.create"] },
      } as never)
    ).not.toThrow();
  });
});
