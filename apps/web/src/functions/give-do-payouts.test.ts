import { beforeEach, describe, expect, it, mock } from "bun:test";

const BATCH = "0190a000-0000-7000-8000-000000000001";
const ROW_A = "0190a000-0000-7000-8000-000000000002";
const ROW_B = "0190a000-0000-7000-8000-000000000003";

let granted: string[] = [];
let audits: { action: string; metadata?: unknown; target?: unknown }[] = [];
let serviceCalls: { args: unknown[]; name: string }[] = [];

const deny = (permission: string) => {
  if (!granted.includes(permission)) {
    throw new Error("Forbidden");
  }
};

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/api-auth", () => ({
  assertServerPermission: async (_session: unknown, permission: string) =>
    deny(permission),
}));
mock.module("@/lib/audit", () => ({
  runSessionAuditedAction: async (
    _session: unknown,
    _headers: unknown,
    options: { action: string; metadata?: unknown; target?: unknown },
    execute: () => Promise<unknown>,
    _classifyResult?: unknown,
    resolveSuccessTarget?: (result: unknown) => Promise<unknown> | unknown
  ) => {
    const result = await execute();
    audits.push({
      ...options,
      target: (await resolveSuccessTarget?.(result)) ?? options.target,
    });
    return result;
  },
}));
const service =
  (name: string, result: unknown) =>
  async (...args: unknown[]) => {
    serviceCalls.push({ args, name });
    return result;
  };
mock.module("@/lib/give-do-payout/server", () => ({
  createPayoutBatch: service("create", {
    review: { batch: { id: BATCH } },
  }),
  getPayoutReview: service("get", { review: { batch: { id: BATCH } } }),
  runPayoutBatch: service("run", {
    alreadyImported: false,
    changed: false,
    result: null,
    settlementId: "settlement-1",
  }),
}));
mock.module("@/lib/income-import/server", () => ({
  countChosenFills: async () => 2,
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

const fns = await import("./give-do-payouts");
type Handler = (input: {
  context: { headers?: Headers; session: unknown };
  data: unknown;
}) => Promise<unknown>;
const call = (fn: unknown, data: unknown) =>
  (fn as Handler)({
    context: { session: { user: { id: "u-1" } } },
    data,
  });

const createInput = {
  base64: "UHJpdmF0ZSBkb25vciByb3dz",
  fileName: "private-priya-payout.xlsx",
  fundId: BATCH,
  orgAccountId: BATCH,
};
const runInput = {
  batchId: BATCH,
  decisions: {
    [ROW_A]: { contribution: "import", donor: "new:private-priya" },
    [ROW_B]: { contribution: "skip" },
  },
  importUnknown: true,
  settledOn: "2026-10-14",
};

describe("give.do payout server functions", () => {
  beforeEach(() => {
    granted = [];
    audits = [];
    serviceCalls = [];
  });

  it("requires donors.manage independently for create, detail and run", async () => {
    granted = ["finance.manage"];
    await expect(
      call(fns.createGiveDoPayoutImport, createInput)
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.getGiveDoPayoutImport, { batchId: BATCH })
    ).rejects.toThrow("Forbidden");
    await expect(call(fns.runGiveDoPayoutImport, runInput)).rejects.toThrow(
      "Forbidden"
    );
    expect(serviceCalls).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("requires finance.manage independently for create, detail and run", async () => {
    granted = ["donors.manage"];
    await expect(
      call(fns.createGiveDoPayoutImport, createInput)
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.getGiveDoPayoutImport, { batchId: BATCH })
    ).rejects.toThrow("Forbidden");
    await expect(call(fns.runGiveDoPayoutImport, runInput)).rejects.toThrow(
      "Forbidden"
    );
    expect(serviceCalls).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("allows both permissions and audits only counts and target IDs", async () => {
    granted = ["donors.manage", "finance.manage"];
    await call(fns.createGiveDoPayoutImport, createInput);
    await call(fns.getGiveDoPayoutImport, { batchId: BATCH });
    await call(fns.runGiveDoPayoutImport, runInput);

    expect(serviceCalls.map((callRecord) => callRecord.name)).toEqual([
      "create",
      "get",
      "run",
    ]);
    expect(audits).toEqual([
      {
        action: "import_batch.create",
        metadata: {},
        target: { id: BATCH, type: "import_batch" },
      },
      {
        action: "import_batch.run",
        metadata: { decisionCount: 2, fillMissingCount: 2 },
        target: { id: BATCH, type: "import_batch" },
      },
    ]);
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain("private-priya");
    expect(serialized).not.toContain("UHJpdmF0ZSBkb25vciByb3dz");
    expect(serialized).not.toContain("2026-10-14");
  });
});
