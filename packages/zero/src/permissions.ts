import type { Context } from "./context";

export function assertIsLoggedIn(
  authData: Context | undefined
): asserts authData is Context {
  if (!authData) {
    throw new Error("Unauthorized");
  }
}

export function assertIsAdmin(
  authData: Context | undefined
): asserts authData is Context & { role: "admin" } {
  assertIsLoggedIn(authData);
  if (authData.role !== "admin") {
    throw new Error("Unauthorized");
  }
}
