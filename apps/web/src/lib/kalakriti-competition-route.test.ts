import { describe, expect, it } from "bun:test";

import { Route } from "@/routes/_app/kalakriti/$year/competitions/route";

function load(
  responsibilities: string[],
  lifecycle = "draft",
  kind = "volunteer",
  isGlobalAdmin = false
) {
  const beforeLoad = Route.options.beforeLoad;
  if (!beforeLoad) throw new Error("Competition guard missing");
  return beforeLoad({
    context: {
      kalakritiEditionAccess: {
        isGlobalAdmin,
        edition: { lifecycle },
        membership: { kind, responsibilities },
      },
    },
  } as Parameters<typeof beforeLoad>[0]);
}
describe("Competition workspace access", () => {
  it("keeps Guardians in the workspace without configuration controls", () => {
    expect(load([], "registration_open", "guardian")).toMatchObject({
      kalakritiCompetitionAccess: {
        canManage: false,
        canEditSchedule: false,
        canManageCancellations: false,
        canViewConfiguration: false,
      },
    });
  });
  it("keeps coordinators scoped and read-only", () => {
    expect(load(["competition_coordinator"], "live")).toMatchObject({
      kalakritiCompetitionAccess: {
        canManage: false,
        canEditSchedule: false,
        canManageCancellations: false,
      },
    });
  });
  it("allows category leads to read configuration without modifying it", () => {
    expect(load(["competition_category_lead"])).toMatchObject({
      kalakritiCompetitionAccess: {
        canViewConfiguration: true,
        canManage: false,
      },
    });
  });
  it("allows managers to edit structure during registration", () => {
    expect(load(["overall_events_lead"], "registration_open")).toMatchObject({
      kalakritiCompetitionAccess: {
        canManage: true,
        canEditSchedule: true,
        canManageCancellations: true,
      },
    });
  });
  it("locks structure before Live and all edits during Live", () => {
    expect(load(["edition_admin"], "registration_locked")).toMatchObject({
      kalakritiCompetitionAccess: {
        canManage: false,
        canEditSchedule: true,
        canManageCancellations: true,
      },
    });
    expect(load(["edition_admin"], "live")).toMatchObject({
      kalakritiCompetitionAccess: {
        canManage: false,
        canEditSchedule: false,
        canManageCancellations: true,
      },
    });
    expect(load([], "archived", "volunteer", true)).toMatchObject({
      kalakritiCompetitionAccess: {
        canManage: false,
        canEditSchedule: false,
        canManageCancellations: false,
      },
    });
  });
  it("denies archived configuration access to non-global roles", () => {
    for (const role of [
      "edition_admin",
      "overall_events_lead",
      "competition_category_lead",
    ])
      expect(() => load([role], "archived")).toThrow();
  });
  it("denies scan-only and unrelated roles", () => {
    for (const role of [
      "food_member",
      "competition_volunteer",
      "awards_lead",
      "volunteer_coordinator",
    ])
      expect(() => load([role])).toThrow();
  });
});
