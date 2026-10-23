import { beforeEach, describe, expect, it, mock } from "bun:test";

let granted: string[] = [];
let audits: { action: string; target?: unknown }[] = [];
let deleted: string[] = [];

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/api-auth", () => ({
  assertServerAnyPermission: async (_s: unknown, permissions: string[]) => {
    if (!permissions.some((p) => granted.includes(p))) {
      throw new Error("Forbidden");
    }
  },
  assertServerPermission: async (_s: unknown, permission: string) => {
    if (!granted.includes(permission)) {
      throw new Error("Forbidden");
    }
  },
}));
mock.module("@/lib/audit", () => ({
  runSessionAuditedAction: async (
    _session: unknown,
    _headers: unknown,
    options: { action: string; target?: unknown },
    execute: () => Promise<unknown>
  ) => {
    audits.push(options);
    return await execute();
  },
}));
mock.module("@pi-dash/db/queries/party-private", () => ({
  deleteDonor: async (partyId: string) => {
    if (partyId === GIVER) {
      throw new Error("Cannot delete a donor with gifts");
    }
    deleted.push(partyId);
    return "party";
  },
  getPartyPrivate: async () => null,
  revealPartyIdNumber: async () => null,
  saveParty: async () => ({}),
}));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      handler: (handler: unknown) => handler,
      middleware: () => builder,
      validator: () => builder,
    };
    return builder;
  },
}));

const fns = await import("./parties");
type Handler = (input: {
  context: { headers?: Headers; session: unknown };
  data: unknown;
}) => Promise<unknown>;
const call = (fn: unknown, data: unknown) =>
  (fn as Handler)({
    context: { session: { user: { id: "u-1" } } },
    data,
  });

const PARTY = "0190a000-0000-7000-8000-000000000001";
const GIVER = "0190a000-0000-7000-8000-000000000002";

describe("deleteDonor", () => {
  beforeEach(() => {
    granted = [];
    audits = [];
    deleted = [];
  });

  it("needs donors.manage and deletes nothing when denied", async () => {
    granted = ["donors.view", "finance.manage"];
    await expect(call(fns.deleteDonor, { partyId: PARTY })).rejects.toThrow(
      "Forbidden"
    );
    expect(deleted).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("audits the delete as party.delete and says what was removed", async () => {
    granted = ["donors.manage"];
    expect(await call(fns.deleteDonor, { partyId: PARTY })).toEqual({
      partyId: PARTY,
      removed: "party",
    });
    expect(audits).toEqual([
      { action: "party.delete", target: { id: PARTY, type: "party" } },
    ]);
  });

  it("passes the refusal for a donor with gifts through", async () => {
    granted = ["donors.manage"];
    await expect(call(fns.deleteDonor, { partyId: GIVER })).rejects.toThrow(
      "Cannot delete a donor with gifts"
    );
    expect(deleted).toEqual([]);
  });
});
