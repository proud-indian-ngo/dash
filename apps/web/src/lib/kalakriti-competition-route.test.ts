import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/design-system/components/ui/tabs", () => ({
  Tabs: () => null,
  TabsList: () => null,
  TabsTrigger: () => null,
}));

import { Route } from "@/routes/_app/kalakriti/$year/competitions/route";

function runBeforeLoad(access: {
  edition: { lifecycle: "archived" | "draft" };
  isGlobalAdmin: boolean;
  membership: { responsibilities: string[] } | null;
}) {
  const { beforeLoad } = Route.options;
  if (!beforeLoad) {
    throw new Error("Competition route guard is missing");
  }
  return beforeLoad({
    context: { kalakritiEditionAccess: access },
  } as Parameters<typeof beforeLoad>[0]);
}

describe("Kalakriti Competition route guard", () => {
  it.each([
    ["global administrator", true, []],
    ["Edition Administrator", false, ["edition_admin"]],
    ["Overall Events Lead", false, ["overall_events_lead"]],
    ["Category Lead", false, ["competition_category_lead"]],
  ])("allows a %s", (_label, isGlobalAdmin, responsibilities) => {
    expect(() =>
      runBeforeLoad({
        edition: { lifecycle: "draft" },
        isGlobalAdmin,
        membership: { responsibilities },
      })
    ).not.toThrow();
  });

  it("rejects an unrelated Edition member", () => {
    expect(() =>
      runBeforeLoad({
        edition: { lifecycle: "draft" },
        isGlobalAdmin: false,
        membership: { responsibilities: ["volunteer_coordinator"] },
      })
    ).toThrow();
  });

  it.each([
    ["Edition Administrator", ["edition_admin"]],
    ["Overall Events Lead", ["overall_events_lead"]],
    ["Category Lead", ["competition_category_lead"]],
  ])("rejects an archived Edition for a %s", (_label, responsibilities) => {
    expect(() =>
      runBeforeLoad({
        edition: { lifecycle: "archived" },
        isGlobalAdmin: false,
        membership: { responsibilities },
      })
    ).toThrow();
  });

  it("allows a global administrator to inspect an archived Edition", () => {
    expect(() =>
      runBeforeLoad({
        edition: { lifecycle: "archived" },
        isGlobalAdmin: true,
        membership: null,
      })
    ).not.toThrow();
  });
});
