import { describe, expect, it } from "vitest";

import {
  ADMIN_PERMISSIONS,
  FINANCE_ADMIN_PERMISSIONS,
  VOLUNTEER_BASELINE_PERMISSIONS,
} from "./permissions";

describe("finance permissions by role", () => {
  it("lets admin see but not change finance setup", () => {
    expect(ADMIN_PERMISSIONS).toContain("finance.view");
    expect(ADMIN_PERMISSIONS).not.toContain("finance.manage");
  });

  it("lets finance_admin see and change finance setup", () => {
    expect(FINANCE_ADMIN_PERMISSIONS).toContain("finance.view");
    expect(FINANCE_ADMIN_PERMISSIONS).toContain("finance.manage");
    expect(FINANCE_ADMIN_PERMISSIONS).toContain("finance.view_sensitive");
    expect(FINANCE_ADMIN_PERMISSIONS).toContain("donors.manage");
  });

  it("lets admin see donors but not their private details", () => {
    expect(ADMIN_PERMISSIONS).toContain("donors.view");
    expect(ADMIN_PERMISSIONS).not.toContain("donors.manage");
    expect(ADMIN_PERMISSIONS).not.toContain("finance.view_sensitive");
  });

  it("gives volunteers no finance setup permissions", () => {
    expect(VOLUNTEER_BASELINE_PERMISSIONS).not.toContain("finance.view");
    expect(VOLUNTEER_BASELINE_PERMISSIONS).not.toContain("finance.manage");
  });
});
