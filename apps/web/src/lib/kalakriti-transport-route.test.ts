import { describe, expect, it } from "bun:test";

import { Route } from "@/routes/_app/kalakriti/$year/transport";

import { canManageKalakritiTransport } from "./kalakriti-transport-policy";
import { buildKalakritiNavGroups } from "./nav-items";

function access(responsibility: string, centerId: string | null = null) {
  return {
    isGlobalAdmin: false,
    edition: { lifecycle: "live" },
    membership: {
      kind: "volunteer",
      assignments: [{ responsibility, centerId }],
    },
  };
}
function guard(actor: ReturnType<typeof access>) {
  const beforeLoad = Route.options.beforeLoad;
  if (!beforeLoad) throw new Error("Missing guard");
  return beforeLoad({
    context: { kalakritiEditionAccess: actor },
  } as Parameters<typeof beforeLoad>[0]);
}

describe("Transport directory access", () => {
  it("admits managers and scoped readers without granting reader writes", () => {
    for (const responsibility of ["edition_admin", "transport_lead"]) {
      expect(() => guard(access(responsibility))).not.toThrow();
      expect(canManageKalakritiTransport(access(responsibility))).toBe(true);
    }
    for (const responsibility of [
      "liaison",
      "center_liaison_lead",
      "liaison_volunteer",
    ]) {
      const actor = access(responsibility, "center-a");
      expect(() => guard(actor)).not.toThrow();
      expect(canManageKalakritiTransport(actor)).toBe(false);
      expect(() => guard(access(responsibility))).toThrow();
    }
    const guardian = {
      ...access(""),
      membership: { kind: "guardian", assignments: [] },
    };
    expect(() => guard(guardian)).not.toThrow();
    expect(canManageKalakritiTransport(guardian)).toBe(false);
  });
  it("denies unrelated staff and archived readers", () => {
    for (const responsibility of [
      "food_lead",
      "overall_events_lead",
      "volunteer_coordinator",
      "liaison_lead",
    ])
      expect(() => guard(access(responsibility))).toThrow();
    const archived = {
      ...access("transport_lead"),
      edition: { lifecycle: "archived" },
    };
    expect(() => guard(archived)).toThrow();
    expect(() => guard({ ...archived, isGlobalAdmin: true })).not.toThrow();
    expect(
      canManageKalakritiTransport({ ...archived, isGlobalAdmin: true })
    ).toBe(false);
  });
  it("only adds the navigation item when authorized", () => {
    const titles = (canViewTransport: boolean) =>
      buildKalakritiNavGroups({ year: 2026, canViewTransport }).flatMap(
        (group) => group.items.map((item) => item.title)
      );
    expect(titles(false)).not.toContain("Transport");
    expect(titles(true)).toContain("Transport");
  });
});
