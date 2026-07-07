import { describe, expect, it } from "vitest";
import type { Context } from "./context";
import {
  assertHasPermission,
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
  can,
} from "./permissions";

function makeCtx(
  overrides: Partial<Context> & { role: string; userId: string }
): Context {
  return { permissions: [], ...overrides };
}

describe("assertIsLoggedIn", () => {
  it("throws when authData is undefined", () => {
    expect(() => assertIsLoggedIn(undefined)).toThrow("Unauthorized");
  });

  it("does not throw for valid context", () => {
    expect(() =>
      assertIsLoggedIn(makeCtx({ role: "volunteer", userId: "u1" }))
    ).not.toThrow();
  });

  it("narrows the type after assertion", () => {
    const ctx: Context | undefined = makeCtx({
      role: "admin",
      userId: "u1",
    });
    assertIsLoggedIn(ctx);
    expect(ctx.userId).toBe("u1");
  });
});

describe("can", () => {
  it("returns true when permission is in context", () => {
    const ctx = makeCtx({
      permissions: ["requests.create", "users.view"],
      role: "admin",
      userId: "u1",
    });
    expect(can(ctx, "requests.create")).toBe(true);
  });

  it("returns false when permission is not in context", () => {
    const ctx = makeCtx({
      permissions: ["requests.create"],
      role: "volunteer",
      userId: "u1",
    });
    expect(can(ctx, "users.view")).toBe(false);
  });

  it("returns false when permissions array is empty", () => {
    const ctx = makeCtx({
      permissions: [],
      role: "volunteer",
      userId: "u1",
    });
    expect(can(ctx, "requests.create")).toBe(false);
  });

  it("caches permission set on context", () => {
    const ctx = makeCtx({
      permissions: ["requests.create"],
      role: "admin",
      userId: "u1",
    });
    can(ctx, "requests.create");
    expect(ctx._permissionSet).toBeInstanceOf(Set);
    expect(ctx._permissionSet?.size).toBe(1);
  });
});

describe("assertHasPermission", () => {
  it("throws when not logged in", () => {
    expect(() => assertHasPermission(undefined, "requests.create")).toThrow(
      "Unauthorized"
    );
  });

  it("throws when permission is missing", () => {
    const ctx = makeCtx({
      permissions: [],
      role: "volunteer",
      userId: "u1",
    });
    expect(() => assertHasPermission(ctx, "requests.create")).toThrow(
      "Unauthorized"
    );
  });

  it("does not throw when permission is present", () => {
    const ctx = makeCtx({
      permissions: ["requests.create"],
      role: "volunteer",
      userId: "u1",
    });
    expect(() => assertHasPermission(ctx, "requests.create")).not.toThrow();
  });
});

describe("assertHasPermissionOrTeamLead", () => {
  it("does not throw when permission is present", () => {
    const ctx = makeCtx({
      permissions: ["events.create"],
      role: "volunteer",
      userId: "u1",
    });
    expect(() =>
      assertHasPermissionOrTeamLead(ctx, "events.create", false)
    ).not.toThrow();
  });

  it("does not throw when user is team lead", () => {
    const ctx = makeCtx({
      permissions: [],
      role: "volunteer",
      userId: "u1",
    });
    expect(() =>
      assertHasPermissionOrTeamLead(ctx, "events.create", true)
    ).not.toThrow();
  });

  it("does not throw when both permission and team lead", () => {
    const ctx = makeCtx({
      permissions: ["events.create"],
      role: "volunteer",
      userId: "u1",
    });
    expect(() =>
      assertHasPermissionOrTeamLead(ctx, "events.create", true)
    ).not.toThrow();
  });

  it("throws when neither permission nor team lead", () => {
    const ctx = makeCtx({
      permissions: [],
      role: "volunteer",
      userId: "u1",
    });
    expect(() =>
      assertHasPermissionOrTeamLead(ctx, "events.create", false)
    ).toThrow("Unauthorized");
  });
});
