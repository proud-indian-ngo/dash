import { describe, expect, it } from "bun:test";

import { Route } from "@/routes/_app/kalakriti/$year/inventory";

import {
  canManageKalakritiInventory,
  canViewKalakritiInventory,
} from "./kalakriti-inventory-policy";
import { buildKalakritiNavGroups } from "./nav-items";

function access(responsibility: string, lifecycle = "live") {
  return {
    isGlobalAdmin: false,
    edition: { lifecycle },
    membership: {
      kind: "volunteer",
      assignments: [{ responsibility }],
    },
  };
}

function guard(actor: ReturnType<typeof access>) {
  const beforeLoad = Route.options.beforeLoad;
  if (!beforeLoad) throw new Error("Missing inventory route guard");
  return beforeLoad({
    context: { kalakritiEditionAccess: actor },
  } as Parameters<typeof beforeLoad>[0]);
}

describe("Kalakriti inventory access", () => {
  it("allows administrators and logistics staff to view and manage nonarchived editions", () => {
    for (const responsibility of [
      "edition_admin",
      "logistics_lead",
      "logistics_member",
    ]) {
      const actor = access(responsibility);
      expect(() => guard(actor)).not.toThrow();
      expect(canViewKalakritiInventory(actor)).toBe(true);
      expect(canManageKalakritiInventory(actor)).toBe(true);
    }
    const global = { ...access(""), isGlobalAdmin: true };
    expect(() => guard(global)).not.toThrow();
    expect(canManageKalakritiInventory(global)).toBe(true);
  });

  it("denies unrelated roles and limits archived editions to global admin read access", () => {
    for (const responsibility of [
      "food_lead",
      "transport_lead",
      "overall_events_lead",
      "volunteer_coordinator",
    ]) {
      expect(() => guard(access(responsibility))).toThrow();
    }
    const archived = access("logistics_lead", "archived");
    expect(() => guard(archived)).toThrow();
    const global = { ...archived, isGlobalAdmin: true };
    expect(() => guard(global)).not.toThrow();
    expect(canManageKalakritiInventory(global)).toBe(false);
  });

  it("shows the inventory sidebar link only when authorized", () => {
    const titles = (canViewInventory: boolean) =>
      buildKalakritiNavGroups({ year: 2026, canViewInventory }).flatMap(
        (group) => group.items.map((item) => item.title)
      );
    expect(titles(false)).not.toContain("Inventory");
    expect(titles(true)).toContain("Inventory");
  });
});
