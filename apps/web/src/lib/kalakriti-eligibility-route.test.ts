import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/design-system/components/ui/button", () => ({
  Button: () => null,
}));
mock.module("@/components/kalakriti/age-category-form-dialog", () => ({
  AgeCategoryFormDialog: () => null,
}));
mock.module("@/components/kalakriti/age-categories-table", () => ({
  AgeCategoriesTable: () => null,
}));
mock.module("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

import { Route } from "@/routes/_app/kalakriti/$year/eligibility";

function runBeforeLoad(access: {
  isGlobalAdmin: boolean;
  membership: { responsibilities: string[] } | null;
}) {
  const { beforeLoad } = Route.options;
  if (!beforeLoad) {
    throw new Error("Eligibility route guard is missing");
  }
  return beforeLoad({
    context: { kalakritiEditionAccess: access },
  } as Parameters<typeof beforeLoad>[0]);
}

describe("Kalakriti eligibility route guard", () => {
  it("allows a global administrator", () => {
    expect(() =>
      runBeforeLoad({ isGlobalAdmin: true, membership: null })
    ).not.toThrow();
  });

  it("allows an assigned Edition Administrator", () => {
    expect(() =>
      runBeforeLoad({
        isGlobalAdmin: false,
        membership: { responsibilities: ["edition_admin"] },
      })
    ).not.toThrow();
  });

  it("rejects a Guardian without Edition Administrator responsibility", () => {
    expect(() =>
      runBeforeLoad({
        isGlobalAdmin: false,
        membership: { responsibilities: [] },
      })
    ).toThrow();
  });
});
