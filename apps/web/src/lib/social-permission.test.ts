import { describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";

import {
  ADMIN_PERMISSIONS,
  FINANCE_ADMIN_PERMISSIONS,
  isAssignablePermissionId,
  VOLUNTEER_BASELINE_PERMISSIONS,
} from "@pi-dash/db/permissions";

mock.module("@tanstack/react-router", () => ({
  redirect: () => new Error("redirected"),
}));

import { buildNavGroups } from "./nav-items";
import { assertPermission } from "./route-guards";

describe("social.manage", () => {
  it("is granted to admin by default, not to finance admins or volunteers", () => {
    expect(isAssignablePermissionId("social.manage")).toBe(true);
    expect(ADMIN_PERMISSIONS).toContain("social.manage");
    expect(FINANCE_ADMIN_PERMISSIONS).not.toContain("social.manage");
    expect(VOLUNTEER_BASELINE_PERMISSIONS).not.toContain("social.manage");
  });

  it("guards the Social page", () => {
    expect(() =>
      assertPermission({ permissions: ["events.view_all"] }, "social.manage")
    ).toThrow("redirected");
    expect(() =>
      assertPermission({ permissions: ["social.manage"] }, "social.manage")
    ).not.toThrow();
    expect(
      readFileSync(
        new URL("../routes/_app/social.tsx", import.meta.url),
        "utf8"
      )
    ).toContain('assertPermission(context, "social.manage")');
  });

  it("shows Social after Events only with the permission", () => {
    const titles = (permissions: string[]) =>
      buildNavGroups(permissions)
        .find((group) => group.label === "Organization")
        ?.items.map((item) => item.title);
    expect(titles(["events.view_all"])).toEqual(["Events"]);
    expect(titles(["events.view_all", "social.manage"])).toEqual([
      "Events",
      "Social",
    ]);
  });
});
