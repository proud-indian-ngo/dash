import { describe, expect, it } from "vitest";
import { isPublicBetterAuthAdminPath } from "./auth-route-policy";

describe("Better Auth route policy", () => {
  it("blocks direct public admin endpoints", () => {
    expect(
      isPublicBetterAuthAdminPath(
        "https://dashboard.test/api/auth/admin/set-role"
      )
    ).toBe(true);
  });

  it("allows normal authentication endpoints", () => {
    expect(
      isPublicBetterAuthAdminPath(
        "https://dashboard.test/api/auth/sign-in/email"
      )
    ).toBe(false);
  });
});
