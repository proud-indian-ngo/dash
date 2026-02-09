import { describe, expect, it } from "vitest";
import { assertIsAdmin, assertIsLoggedIn } from "./permissions";

describe("assertIsLoggedIn", () => {
  it("throws when authData is undefined", () => {
    expect(() => assertIsLoggedIn(undefined)).toThrow("Unauthorized");
  });

  it("does not throw for valid context", () => {
    expect(() =>
      assertIsLoggedIn({ userId: "u1", role: "volunteer" })
    ).not.toThrow();
  });

  it("narrows the type after assertion", () => {
    const ctx: { userId: string; role: "admin" | "volunteer" } | undefined = {
      userId: "u1",
      role: "admin",
    };
    assertIsLoggedIn(ctx);
    // If this compiles, type narrowing works
    expect(ctx.userId).toBe("u1");
  });
});

describe("assertIsAdmin", () => {
  it("throws when authData is undefined", () => {
    expect(() => assertIsAdmin(undefined)).toThrow("Unauthorized");
  });

  it("throws when role is not admin", () => {
    expect(() => assertIsAdmin({ userId: "u1", role: "volunteer" })).toThrow(
      "Unauthorized"
    );
  });

  it("does not throw for admin role", () => {
    expect(() => assertIsAdmin({ userId: "u1", role: "admin" })).not.toThrow();
  });
});
