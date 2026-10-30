import { beforeEach, describe, expect, it, mock } from "bun:test";

let allowed = true;
let audited: string[] = [];
let updates: unknown[] = [];
let deletes: string[] = [];

const actual = await import("@pi-dash/db/queries/resolutions");
const { ResolutionError } = actual;

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/api-auth", () => ({
  assertServerPermission: async (_session: unknown, permission: string) => {
    if (!(allowed && permission === "governance.manage")) {
      throw new Error("Forbidden");
    }
  },
}));
mock.module("@/lib/audit", () => ({
  runAuditedAction: async (_options: unknown, run: () => Promise<unknown>) =>
    await run(),
  runSessionAuditedAction: async (
    _session: unknown,
    _headers: unknown,
    options: { action: string },
    run: () => Promise<unknown>
  ) => {
    audited.push(options.action);
    return await run();
  },
}));
mock.module("@pi-dash/db/queries/resolutions", () => ({
  ...actual,
  deleteHistoricalResolution: async (id: string) => {
    if (id === "cited") {
      throw new ResolutionError(
        "Other records cite this resolution, so it can't be deleted."
      );
    }
    deletes.push(id);
  },
  updateHistoricalResolution: async (input: unknown) => {
    updates.push(input);
  },
}));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      handler: (handler: unknown) => handler,
      validator: () => ({ handler: (handler: unknown) => handler }),
    }),
  }),
}));

const { deleteHistoricalResolutionFn, updateHistoricalResolutionFn } =
  await import("./resolutions");
const context = { headers: new Headers(), session: { user: { id: "admin" } } };
const call = (fn: unknown, data: unknown) =>
  (fn as (input: unknown) => Promise<unknown>)({ context, data });

const edit = {
  decidedOn: "2025-12-07",
  documentId: null,
  id: "res-1",
  number: "PI/TR/2025-26/002",
  templateKey: "ordinary",
  title: "Co-opt a trustee",
  validityNote: null,
};

describe("correcting a resolution recorded from paper", () => {
  beforeEach(() => {
    allowed = true;
    audited = [];
    deletes = [];
    updates = [];
  });

  it("saves every field, with the year and sequence from the number", async () => {
    await call(updateHistoricalResolutionFn, edit);
    expect(audited).toEqual(["resolution.update_historical"]);
    expect(updates).toEqual([{ ...edit, fiscalYear: "2025-26", sequence: 2 }]);
  });

  it("refuses a number outside the register's format", async () => {
    await expect(
      call(updateHistoricalResolutionFn, { ...edit, number: "2025/2" })
    ).rejects.toThrow("number format");
    expect(updates).toEqual([]);
  });

  it("needs governance.manage", async () => {
    allowed = false;
    await expect(call(updateHistoricalResolutionFn, edit)).rejects.toThrow(
      "Forbidden"
    );
    await expect(
      call(deleteHistoricalResolutionFn, { id: "res-1" })
    ).rejects.toThrow("Forbidden");
    expect(updates).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it("deletes one nothing cites and passes on the refusal for one that is", async () => {
    await call(deleteHistoricalResolutionFn, { id: "res-1" });
    expect(deletes).toEqual(["res-1"]);
    await expect(
      call(deleteHistoricalResolutionFn, { id: "cited" })
    ).rejects.toThrow("cite this resolution");
    expect(audited).toEqual([
      "resolution.delete_historical",
      "resolution.delete_historical",
    ]);
  });
});
