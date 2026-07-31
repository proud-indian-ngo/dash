import { readFileSync } from "node:fs";
import {
  ADMIN_PERMISSIONS,
  FINANCE_ADMIN_PERMISSIONS,
  PERMISSION_IDS,
} from "@pi-dash/db/permissions";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  redirect: () => new Error("redirected"),
}));

import { assertPermission } from "./route-guards";

describe("audit log permission", () => {
  it("is assignable but excluded from lower admin defaults", () => {
    expect(PERMISSION_IDS.has("audit_log.view")).toBe(true);
    expect(ADMIN_PERMISSIONS).not.toContain("audit_log.view");
    expect(FINANCE_ADMIN_PERMISSIONS).not.toContain("audit_log.view");
  });

  it("guards the page when the permission is absent", () => {
    expect(() =>
      assertPermission({ permissions: [] }, "audit_log.view")
    ).toThrow("redirected");
    expect(() =>
      assertPermission({ permissions: ["audit_log.view"] }, "audit_log.view")
    ).not.toThrow();
  });

  it("keeps independent permission checks in the page and API", () => {
    expect(
      readFileSync(
        new URL("../routes/_app/audit-log.tsx", import.meta.url),
        "utf8"
      )
    ).toContain('assertPermission(context, "audit_log.view")');
    expect(
      readFileSync(
        new URL("../routes/api/audit-log.ts", import.meta.url),
        "utf8"
      )
    ).toContain("assertPermission: assertServerPermission");
  });
});
