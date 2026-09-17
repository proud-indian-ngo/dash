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

import { Route as EditionRoute } from "@/routes/_app/kalakriti/$year/settings/edition";
import { Route } from "@/routes/_app/kalakriti/$year/settings/eligibility";
import { Route as SettingsRoute } from "@/routes/_app/kalakriti/$year/settings/route";

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

  it("rejects a Competition Category Lead", () => {
    expect(() =>
      runBeforeLoad({
        isGlobalAdmin: false,
        membership: { responsibilities: ["competition_category_lead"] },
      })
    ).toThrow();
  });
});

describe("Kalakriti Edition settings route guard", () => {
  const beforeLoad = EditionRoute.options.beforeLoad;
  if (!beforeLoad) throw new Error("Edition settings route guard is missing");

  it("allows an Edition Administrator", () => {
    expect(() =>
      beforeLoad({
        context: {
          kalakritiEditionAccess: {
            isGlobalAdmin: false,
            membership: { responsibilities: ["edition_admin"] },
          },
        },
      } as Parameters<typeof beforeLoad>[0])
    ).not.toThrow();
  });

  it("rejects a Competition Category Lead", () => {
    expect(() =>
      beforeLoad({
        context: {
          kalakritiEditionAccess: {
            isGlobalAdmin: false,
            membership: { responsibilities: ["competition_category_lead"] },
          },
        },
      } as Parameters<typeof beforeLoad>[0])
    ).toThrow();
  });
});

describe("Kalakriti settings route guard", () => {
  function runSettingsBeforeLoad(access: {
    edition: { lifecycle: string };
    isGlobalAdmin: boolean;
    membership: { responsibilities: string[] } | null;
  }) {
    const beforeLoad = SettingsRoute.options.beforeLoad;
    if (!beforeLoad) throw new Error("Settings route guard is missing");
    return beforeLoad({
      context: { kalakritiEditionAccess: access },
    } as Parameters<typeof beforeLoad>[0]);
  }

  it("allows category leads during registration", () => {
    expect(() =>
      runSettingsBeforeLoad({
        edition: { lifecycle: "registration_open" },
        isGlobalAdmin: false,
        membership: { responsibilities: ["competition_category_lead"] },
      })
    ).not.toThrow();
  });

  it("rejects an unassigned Guardian", () => {
    expect(() =>
      runSettingsBeforeLoad({
        edition: { lifecycle: "registration_open" },
        isGlobalAdmin: false,
        membership: { responsibilities: [] },
      })
    ).toThrow();
  });

  it("rejects archived access unless globally administered", () => {
    expect(() =>
      runSettingsBeforeLoad({
        edition: { lifecycle: "archived" },
        isGlobalAdmin: false,
        membership: { responsibilities: ["edition_admin"] },
      })
    ).toThrow();
  });

  it("allows global administrators to inspect archived settings", () => {
    expect(() =>
      runSettingsBeforeLoad({
        edition: { lifecycle: "archived" },
        isGlobalAdmin: true,
        membership: null,
      })
    ).not.toThrow();
  });
});
