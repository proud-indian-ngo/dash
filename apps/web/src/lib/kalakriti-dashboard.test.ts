import { describe, expect, it } from "bun:test";

import {
  KALAKRITI_EDITION_RESPONSIBILITIES,
  type KalakritiResponsibility,
} from "@pi-dash/shared/kalakriti";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";

import {
  dashboardAccessKey,
  getDashboardActions,
  getDashboardScanActions,
  prioritizeDashboardAttention,
} from "./kalakriti-dashboard";

function access(
  roles: KalakritiResponsibility[],
  lifecycle: KalakritiEditionAccess["edition"]["lifecycle"] = "live"
): KalakritiEditionAccess {
  return {
    edition: {
      id: "edition",
      year: 2026,
      lifecycle,
      name: "Kalakriti",
      eventDate: "2026-11-01",
      ageCutoffDate: "2026-01-01",
      timezone: "Asia/Kolkata",
      plannedRegistrationCloseAt: 0,
      teamEventId: "event",
    },
    isGlobalAdmin: false,
    membership: {
      id: "member",
      kind: "volunteer",
      responsibilities: roles,
      assignments: roles.map((responsibility) => ({
        responsibility,
        centerId: "center",
        competitionCategoryId: "category",
        competitionId: "competition",
      })),
    },
  };
}

describe("Kalakriti dashboard work areas", () => {
  it.each([...KALAKRITI_EDITION_RESPONSIBILITIES])(
    "produces unique actions for %s",
    (role) => {
      const actions = [
        ...getDashboardActions(access([role])),
        ...getDashboardScanActions(access([role])),
      ];
      expect(new Set(actions.map((action) => action.id)).size).toBe(
        actions.length
      );
    }
  );
  it("combines food and logistics without granting registration access", () => {
    const current = access(["food_member", "food_lead", "logistics_member"]);
    expect(getDashboardActions(current).map((a) => a.destination)).toEqual([
      "food",
      "inventory",
    ]);
    expect(getDashboardScanActions(current).map((a) => a.activity)).toEqual([
      "meals",
      "dispatch",
      "return",
    ]);
  });
  it("offers competition volunteers attendance without entry or configuration access", () => {
    expect(getDashboardActions(access(["competition_volunteer"]))).toEqual([]);
    expect(
      getDashboardScanActions(access(["competition_volunteer"])).map(
        (a) => a.activity
      )
    ).toEqual(["attendance"]);
  });
  it.each([
    "liaison",
    "liaison_lead",
    "center_liaison_lead",
    "liaison_volunteer",
  ] as const)("shows Guardians to %s", (role) => {
    expect(
      getDashboardActions(access([role])).map((action) => action.destination)
    ).toContain("guardians");
  });
  it.each([
    "venue_member",
    "media_member",
    "fundraising_member",
    "transit_volunteer",
    "escort_volunteer",
  ] as const)("preserves %s without invented operations", (role) => {
    expect(getDashboardActions(access([role]))).toEqual([]);
    expect(getDashboardScanActions(access([role]))).toEqual([]);
  });
  it.each(["awards_lead", "awards_member"] as const)(
    "shows the Competition and Awards workspaces to %s without scan actions",
    (role) => {
      expect(
        getDashboardActions(access([role])).map((a) => a.destination)
      ).toEqual(["competitions", "awards"]);
      expect(getDashboardScanActions(access([role]))).toEqual([]);
    }
  );
  it("keeps inventory available before Live but labels event-day recording unavailable", () => {
    const actions = getDashboardScanActions(access(["edition_admin"], "draft"));
    expect(
      actions.find((a) => a.activity === "meals")?.unavailable
    ).toBeTruthy();
    expect(
      actions.find((a) => a.activity === "dispatch")?.unavailable
    ).toBeUndefined();
  });
  it("does not expose archived operations to nonadministrators", () => {
    const current = access(["edition_admin"], "archived");
    expect(getDashboardScanActions(current)).toEqual([]);
    expect(getDashboardActions(current).map((a) => a.destination)).toEqual([
      "schedule",
    ]);
  });
  it("gives Guardians scoped work screens without recording", () => {
    const current = access([]);
    if (current.membership) current.membership.kind = "guardian";
    expect(getDashboardActions(current).map((a) => a.destination)).toEqual([
      "students",
      "competitions",
      "centers",
      "food",
      "transport",
    ]);
    expect(getDashboardScanActions(current)).toEqual([]);
  });
  it("changes snapshot identity for users, scopes and role revocation", () => {
    expect(dashboardAccessKey(access(["food_member"]), "a")).not.toBe(
      dashboardAccessKey(access(["food_member"]), "b")
    );
    expect(dashboardAccessKey(access(["food_member"]), "a")).not.toBe(
      dashboardAccessKey(access([]), "a")
    );
  });
  it("limits attention to five nonzero unique groups with blockers first", () => {
    const items = Array.from({ length: 7 }, (_, n) => ({
      id: String(n),
      label: "Task",
      count: n,
      priority: n === 6 ? 0 : 2,
    }));
    expect(
      prioritizeDashboardAttention([...items, ...items.slice(6)], "live").map(
        (a) => a.id
      )
    ).toEqual(["6", "1", "2", "3", "4"]);
    expect(prioritizeDashboardAttention(items, "archived")).toEqual([]);
  });
});
