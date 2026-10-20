import { beforeEach, describe, expect, it, mock } from "bun:test";

let resolve: () => Promise<string[]>;

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: () => resolve(),
}));
mock.module("@pi-dash/db/queries/policies", () => ({
  hasOutstandingPolicies: async () => false,
}));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      handler: (handler: unknown) => handler,
      middleware: () => builder,
    };
    return builder;
  },
}));

const { getAuth } = await import("./get-auth");
const handler = getAuth as unknown as (input: {
  context: { session: unknown };
}) => Promise<{ permissions: string[] } | null>;

const session = { user: { id: "u-1", role: "finance_admin" } };

describe("getAuth", () => {
  beforeEach(() => {
    resolve = async () => ["finance.view"];
  });

  it("returns the role's permissions", async () => {
    const result = await handler({ context: { session } });
    expect(result?.permissions).toEqual(["finance.view"]);
  });

  it("returns null without a session", async () => {
    expect(await handler({ context: { session: null } })).toBeNull();
  });

  it("throws when permissions can't be read, rather than granting none", async () => {
    resolve = async () => {
      throw new Error("connection closed");
    };
    await expect(handler({ context: { session } })).rejects.toThrow(
      "connection closed"
    );
  });
});
