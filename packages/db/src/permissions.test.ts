import { describe, expect, it } from "vitest";

import {
  ADMIN_PERMISSIONS,
  FINANCE_ADMIN_PERMISSIONS,
  PERMISSION_IDS,
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

  it("gives finance admins, not admins, the book-keeping permissions", () => {
    const books = [
      "finance.post_opening",
      "finance.close_year",
      "finance.reopen_year",
      "finance.adjust",
      "finance.post_pending",
    ];
    for (const id of books) {
      expect(PERMISSION_IDS.has(id)).toBe(true);
      expect(ADMIN_PERMISSIONS).not.toContain(id);
      expect(FINANCE_ADMIN_PERMISSIONS).toContain(id);
      expect(VOLUNTEER_BASELINE_PERMISSIONS).not.toContain(id);
    }
  });

  it("lets finance admins and super admins, not admins or volunteers, claim for others", () => {
    expect(PERMISSION_IDS.has("requests.create_for_others")).toBe(true);
    expect(FINANCE_ADMIN_PERMISSIONS).toContain("requests.create_for_others");
    expect(ADMIN_PERMISSIONS).not.toContain("requests.create_for_others");
    expect(VOLUNTEER_BASELINE_PERMISSIONS).not.toContain(
      "requests.create_for_others"
    );
  });

  it("lets finance admins and super admins, not admins or volunteers, void requests", () => {
    expect(PERMISSION_IDS.has("requests.void")).toBe(true);
    expect(FINANCE_ADMIN_PERMISSIONS).toContain("requests.void");
    expect(ADMIN_PERMISSIONS).not.toContain("requests.void");
    expect(VOLUNTEER_BASELINE_PERMISSIONS).not.toContain("requests.void");
  });
});

describe("governance permissions by role", () => {
  it("lets admins run governance but not reveal trustee KYC", () => {
    expect(ADMIN_PERMISSIONS).toContain("governance.view");
    expect(ADMIN_PERMISSIONS).toContain("governance.manage");
    expect(ADMIN_PERMISSIONS).not.toContain("governance.kyc.view");
  });

  it("lets finance admins see the register but not change it", () => {
    expect(FINANCE_ADMIN_PERMISSIONS).toContain("governance.view");
    expect(FINANCE_ADMIN_PERMISSIONS).not.toContain("governance.manage");
    expect(FINANCE_ADMIN_PERMISSIONS).not.toContain("governance.kyc.view");
  });

  it("gives volunteers no governance permissions", () => {
    for (const id of ["governance.view", "governance.manage"]) {
      expect(PERMISSION_IDS.has(id)).toBe(true);
      expect(VOLUNTEER_BASELINE_PERMISSIONS).not.toContain(id);
    }
  });
});
