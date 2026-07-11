import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/reimbursements/reimbursement-form", () => ({
  ReimbursementForm: () => null,
}));

import { Route as NewReimbursementRoute } from "@/routes/_app/reimbursements/new";

describe("route guards", () => {
  it("requires requests.create for a new reimbursement", () => {
    const { beforeLoad } = NewReimbursementRoute.options;

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
