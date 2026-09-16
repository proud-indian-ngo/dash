import { describe, expect, it } from "bun:test";

import { Route as Guests } from "@/routes/_app/kalakriti/$year/guests";
import { Route as Judges } from "@/routes/_app/kalakriti/$year/judges";

import {
  canManageKalakritiAttendees,
  canViewKalakritiAttendees,
} from "./kalakriti-attendee-policy";
import { buildKalakritiNavGroups } from "./nav-items";
function guard(route: typeof Guests | typeof Judges, access: unknown) {
  const beforeLoad: typeof Guests.options.beforeLoad =
    route === Guests
      ? Guests.options.beforeLoad
      : (Judges.options.beforeLoad as typeof Guests.options.beforeLoad);
  if (!beforeLoad) throw new Error("Missing guard");
  return beforeLoad({
    context: { kalakritiEditionAccess: access },
  } as Parameters<typeof beforeLoad>[0]);
}
function access(responsibility: string, scope = {}) {
  return {
    isGlobalAdmin: false,
    edition: { lifecycle: "live" },
    membership: {
      kind: "volunteer" as const,
      assignments: [{ responsibility, ...scope }],
    },
  };
}
describe("attendee direct route guards", () => {
  it("lets Overall Events Leads manage Judges without granting Guest management", () => {
    const lead = access("overall_events_lead");
    expect(canManageKalakritiAttendees(lead, "judge")).toBe(true);
    expect(canManageKalakritiAttendees(lead, "guest")).toBe(false);
    expect(
      canManageKalakritiAttendees(
        { ...lead, edition: { lifecycle: "archived" } },
        "judge"
      )
    ).toBe(false);
    expect(
      canManageKalakritiAttendees(
        { ...lead, membership: { ...lead.membership, kind: "guardian" } },
        "judge"
      )
    ).toBe(false);
    for (const responsibility of [
      "volunteer_coordinator",
      "competition_category_lead",
      "competition_coordinator",
      "food_lead",
    ])
      expect(canManageKalakritiAttendees(access(responsibility), "judge")).toBe(
        false
      );
    expect(canManageKalakritiAttendees(access("edition_admin"), "guest")).toBe(
      true
    );
  });
  it("shows only explicitly authorized roster navigation", () => {
    const titles = (options: Parameters<typeof buildKalakritiNavGroups>[0]) =>
      buildKalakritiNavGroups(options).flatMap((group) =>
        group.items.map((item) => item.title)
      );
    expect(titles({ year: 2026 })).not.toContain("Guests");
    expect(titles({ year: 2026 })).not.toContain("Judges");
    expect(titles({ year: 2026, canViewJudges: true })).toContain("Judges");
    expect(titles({ year: 2026, canViewJudges: true })).not.toContain("Guests");
    expect(titles({ year: 2026, canViewGuests: true })).toContain("Guests");
  });
  it("admits admins and read-only volunteer coordinators to both", () => {
    for (const route of [Guests, Judges]) {
      for (const actor of [
        { isGlobalAdmin: true },
        access("edition_admin"),
        access("volunteer_coordinator"),
      ])
        expect(() => guard(route, actor)).not.toThrow();
      expect(() => guard(route, null)).toThrow();
      expect(() => guard(route, access("food_member"))).toThrow();
    }
    expect(
      canManageKalakritiAttendees(access("volunteer_coordinator"), "guest")
    ).toBe(false);
    expect(canManageKalakritiAttendees(access("edition_admin"), "guest")).toBe(
      true
    );
  });
  it("restricts event staff to judges and requires assigned scopes", () => {
    for (const actor of [
      access("overall_events_lead"),
      access("competition_category_lead", {
        competitionCategoryId: "category",
      }),
      access("competition_coordinator", { competitionId: "competition" }),
    ]) {
      expect(() => guard(Judges, actor)).not.toThrow();
      expect(() => guard(Guests, actor)).toThrow();
      expect(canManageKalakritiAttendees(actor, "guest")).toBe(false);
    }
    expect(() => guard(Judges, access("competition_category_lead"))).toThrow();
    expect(() => guard(Judges, access("competition_coordinator"))).toThrow();
  });
  it("gives Hospitality Leads Guest roster and CRUD access only", () => {
    const lead = access("hospitality_lead");
    expect(() => guard(Guests, lead)).not.toThrow();
    expect(() => guard(Judges, lead)).toThrow();
    expect(canViewKalakritiAttendees(lead, "guest")).toBe(true);
    expect(canManageKalakritiAttendees(lead, "guest")).toBe(true);
    expect(canManageKalakritiAttendees(lead, "judge")).toBe(false);
    expect(() => guard(Guests, access("hospitality_member"))).toThrow();
    expect(
      canManageKalakritiAttendees(access("hospitality_member"), "guest")
    ).toBe(false);
    expect(
      canManageKalakritiAttendees(
        { ...lead, membership: { ...lead.membership, kind: "guardian" } },
        "guest"
      )
    ).toBe(false);
    expect(
      canManageKalakritiAttendees(
        { ...lead, edition: { lifecycle: "archived" } },
        "guest"
      )
    ).toBe(false);
  });
  it("keeps archived editions read-only and global-admin-only", () => {
    const actor = {
      ...access("edition_admin"),
      edition: { lifecycle: "archived" },
    };
    expect(() => guard(Judges, actor)).toThrow();
    expect(() =>
      guard(Guests, { ...actor, isGlobalAdmin: true })
    ).not.toThrow();
    expect(
      canManageKalakritiAttendees({ ...actor, isGlobalAdmin: true }, "judge")
    ).toBe(false);
  });
});
