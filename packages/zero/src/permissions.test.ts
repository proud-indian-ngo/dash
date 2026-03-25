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
      assertIsLoggedIn(makeCtx({ userId: "u1", role: "volunteer" }))
    ).not.toThrow();
  });

  it("narrows the type after assertion", () => {
    const ctx: Context | undefined = makeCtx({
      userId: "u1",
      role: "admin",
    });
    assertIsLoggedIn(ctx);
    expect(ctx.userId).toBe("u1");
  });
});

describe("can", () => {
  it("returns true when permission is in context", () => {
    const ctx = makeCtx({
      userId: "u1",
      role: "admin",
      permissions: ["requests.create", "users.view"],
    });
    expect(can(ctx, "requests.create")).toBe(true);
  });

  it("returns false when permission is not in context", () => {
    const ctx = makeCtx({
      userId: "u1",
      role: "volunteer",
      permissions: ["requests.create"],
    });
    expect(can(ctx, "users.view")).toBe(false);
  });

  it("returns false when permissions array is empty", () => {
    const ctx = makeCtx({
      userId: "u1",
      role: "volunteer",
      permissions: [],
    });
    expect(can(ctx, "requests.create")).toBe(false);
  });

  it("caches permission set on context", () => {
    const ctx = makeCtx({
      userId: "u1",
      role: "admin",
      permissions: ["requests.create"],
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
      userId: "u1",
      role: "volunteer",
      permissions: [],
    });
    expect(() => assertHasPermission(ctx, "requests.create")).toThrow(
      "Unauthorized"
    );
  });

  it("does not throw when permission is present", () => {
    const ctx = makeCtx({
      userId: "u1",
      role: "volunteer",
      permissions: ["requests.create"],
    });
    expect(() => assertHasPermission(ctx, "requests.create")).not.toThrow();
  });
});

describe("assertHasPermissionOrTeamLead", () => {
  it("does not throw when permission is present", () => {
    const ctx = makeCtx({
      userId: "u1",
      role: "volunteer",
      permissions: ["events.create"],
    });
    expect(() =>
      assertHasPermissionOrTeamLead(ctx, "events.create", false)
    ).not.toThrow();
  });

  it("does not throw when user is team lead", () => {
    const ctx = makeCtx({
      userId: "u1",
      role: "volunteer",
      permissions: [],
    });
    expect(() =>
      assertHasPermissionOrTeamLead(ctx, "events.create", true)
    ).not.toThrow();
  });

  it("does not throw when both permission and team lead", () => {
    const ctx = makeCtx({
      userId: "u1",
      role: "volunteer",
      permissions: ["events.create"],
    });
    expect(() =>
      assertHasPermissionOrTeamLead(ctx, "events.create", true)
    ).not.toThrow();
  });

  it("throws when neither permission nor team lead", () => {
    const ctx = makeCtx({
      userId: "u1",
      role: "volunteer",
      permissions: [],
    });
    expect(() =>
      assertHasPermissionOrTeamLead(ctx, "events.create", false)
    ).toThrow("Unauthorized");
  });
});
