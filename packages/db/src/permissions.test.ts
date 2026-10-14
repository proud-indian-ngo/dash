import { describe, expect, it } from "vitest";

import {
  ADMIN_PERMISSIONS,
  FINANCE_ADMIN_PERMISSIONS,
  PERMISSION_IDS,
  TREASURER_PERMISSIONS,
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

  it("lets admin see donors and contact details but not manage them or reveal identifiers", () => {
    expect(ADMIN_PERMISSIONS).toContain("donors.view");
    expect(ADMIN_PERMISSIONS).not.toContain("donors.manage");
    expect(ADMIN_PERMISSIONS).not.toContain("finance.view_sensitive");
  });

  it("gives volunteers no finance setup permissions", () => {
    expect(VOLUNTEER_BASELINE_PERMISSIONS).not.toContain("finance.view");
    expect(VOLUNTEER_BASELINE_PERMISSIONS).not.toContain("finance.manage");
  });

  it("keeps the treasurer's book-keeping permissions off admin and on finance_admin", () => {
    const books = [
      "finance.post_opening",
      "finance.close_year",
      "finance.reopen_year",
      "finance.adjust",
    ];
    for (const id of books) {
      expect(PERMISSION_IDS.has(id)).toBe(true);
      expect(ADMIN_PERMISSIONS).not.toContain(id);
      expect(FINANCE_ADMIN_PERMISSIONS).toContain(id);
      expect(TREASURER_PERMISSIONS).toContain(id);
      expect(VOLUNTEER_BASELINE_PERMISSIONS).not.toContain(id);
    }
    expect(TREASURER_PERMISSIONS).toContain("finance.view");
  });
});
