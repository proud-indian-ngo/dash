import { describe, expect, it } from "bun:test";

import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { Route } from "@/routes/_app/kalakriti/$year/event-day";

import { canAccessKalakritiEventDay } from "./kalakriti-event-day-policy";
import { buildKalakritiNavGroups } from "./nav-items";

function context({
  role = "transport_lead",
  kind = "volunteer",
  lifecycle = "live",
  admin = false,
}: {
  role?: "transport_lead" | "liaison" | "food_lead";
  kind?: "guardian" | "volunteer";
  lifecycle?: "draft" | "live" | "archived";
  admin?: boolean;
} = {}): KalakritiEditionAccess {
  return {
    isGlobalAdmin: admin,
    edition: {
      id: "edition",
      year: 2162,
      lifecycle,
      name: "Edition",
      ageCutoffDate: "2162-06-30",
      eventDate: "2162-11-21",
      plannedRegistrationCloseAt: 1,
      teamEventId: "event",
      timezone: "Asia/Kolkata",
    },
    membership: {
      id: "membership",
      kind,
      responsibilities: [role],
      assignments: [
        {
          centerId: "center",
          competitionId: null,
          competitionCategoryId: null,
          responsibility: role,
        },
      ],
    },
  };
}
function guard(access: KalakritiEditionAccess) {
  const beforeLoad = Route.options.beforeLoad;
  if (!beforeLoad) throw new Error("Missing event day guard");
  return beforeLoad({
    context: { kalakritiEditionAccess: access },
  } as Parameters<typeof beforeLoad>[0]);
}
describe("Event day route and navigation", () => {
  it("runs the real route guard for authorized station staff and pre-live notice", () => {
    for (const access of [
      context(),
      context({ role: "liaison" }),
      context({ admin: true }),
      context({ lifecycle: "draft" }),
    ]) {
      expect(() => guard(access)).not.toThrow();
    }
  });
  it("denies Guardians, Food Leads and archived Editions at the actual route guard", () => {
    for (const access of [
      context({ kind: "guardian" }),
      context({ role: "food_lead" }),
      context({ admin: true, lifecycle: "archived" }),
    ]) {
      expect(() => guard(access)).toThrow();
    }
  });
  it("uses the same role and archive policy for the Event day navigation item", () => {
    for (const [access, visible] of [
      [context(), true],
      [context({ role: "liaison" }), true],
      [context({ role: "food_lead" }), false],
      [context({ kind: "guardian" }), false],
      [context({ admin: true, lifecycle: "archived" }), false],
    ] as const) {
      const items = buildKalakritiNavGroups({
        year: access.edition.year,
        canViewEventDay: canAccessKalakritiEventDay(access),
      }).flatMap((group) => group.items);
      expect(items.some((item) => item.url.endsWith("/event-day"))).toBe(
        visible
      );
    }
  });
});
