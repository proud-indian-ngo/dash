import {
  ADMIN_PERMISSIONS,
  FINANCE_ADMIN_PERMISSIONS,
  isAssignablePermissionId,
  PERMISSION_IDS,
  SYSTEM_ONLY_PERMISSION_IDS,
} from "@pi-dash/db/permissions";
import { describe, expect, it } from "vitest";

describe("requests.export permission policy", () => {
  it("keeps export known but reserved for the super-admin role", () => {
    expect(PERMISSION_IDS.has("requests.export")).toBe(true);
    expect(SYSTEM_ONLY_PERMISSION_IDS).toContain("requests.export");
    expect(isAssignablePermissionId("requests.export")).toBe(false);
    expect(ADMIN_PERMISSIONS).not.toContain("requests.export");
    expect(FINANCE_ADMIN_PERMISSIONS).not.toContain("requests.export");
  });

  it("keeps ordinary known permissions assignable", () => {
    expect(isAssignablePermissionId("requests.view_own")).toBe(true);
    expect(isAssignablePermissionId("unknown.permission")).toBe(false);
  });
});
