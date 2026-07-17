import { describe, expect, it, vi } from "vitest";

vi.mock("@pi-dash/design-system/components/ui/button", () => ({
  Button: () => null,
}));
vi.mock("@/components/kalakriti/competition-category-form-dialog", () => ({
  CompetitionCategoryFormDialog: () => null,
}));
vi.mock("@/components/kalakriti/competition-configuration-sections", () => ({
  CompetitionCatalogSection: () => null,
  ScheduleSection: () => null,
  VenueSection: () => null,
}));
vi.mock("@/components/kalakriti/competition-form-dialog", () => ({
  CompetitionFormDialog: () => null,
}));
vi.mock("@/components/kalakriti/competition-session-form-dialog", () => ({
  CompetitionSessionFormDialog: () => null,
}));
vi.mock("@/components/kalakriti/venue-form-dialog", () => ({
  VenueFormDialog: () => null,
}));
vi.mock("@/components/loader", () => ({ Loader: () => null }));
vi.mock("@/components/shared/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

import { Route } from "@/routes/_app/kalakriti/$year/competitions";

function runBeforeLoad(access: {
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
        isGlobalAdmin,
        membership: { responsibilities },
      })
    ).not.toThrow();
  });

  it("rejects an unrelated Edition member", () => {
    expect(() =>
      runBeforeLoad({
        isGlobalAdmin: false,
        membership: { responsibilities: ["volunteer_coordinator"] },
      })
    ).toThrow();
  });
});
