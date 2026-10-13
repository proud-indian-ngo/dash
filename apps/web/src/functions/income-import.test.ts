import { beforeEach, describe, expect, it, mock } from "bun:test";

let granted: string[] = [];
let audits: { action: string; metadata?: unknown; target?: unknown }[] = [];
let serviceCalls: string[] = [];

const deny = (permissions: readonly string[]) => {
  if (!permissions.some((p) => granted.includes(p))) {
    throw new Error("Forbidden");
  }
};

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/api-auth", () => ({
  assertServerAnyPermission: async (_s: unknown, permissions: string[]) =>
    deny(permissions),
  assertServerPermission: async (_s: unknown, permission: string) =>
    deny([permission]),
}));
mock.module("@/lib/audit", () => ({
  runSessionAuditedAction: async (
    _session: unknown,
    _headers: unknown,
    options: { action: string; metadata?: unknown; target?: unknown },
    execute: () => Promise<unknown>
  ) => {
    audits.push(options);
    return await execute();
  },
}));
mock.module("@/lib/income-import/server", () => ({
  createImportBatch: async () => {
    serviceCalls.push("create");
    return { batchId: "b" };
  },
  getImportBatchDetail: async () => {
    serviceCalls.push("detail");
    return { columns: [], review: null };
  },
  reviewImportBatch: async () => {
    serviceCalls.push("review");
    return {};
  },
  runImportBatch: async () => {
    serviceCalls.push("run");
    return {};
  },
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

const fns = await import("./income-import");
type Handler = (input: {
  context: { headers?: Headers; session: unknown };
  data: unknown;
}) => Promise<unknown>;
const call = (fn: unknown, data: unknown) =>
  (fn as Handler)({
    context: { session: { user: { id: "u-1" } } },
    data,
  });

const CSV = "Name,Amount,Date\nPriya Rao,100,01/10/2026\nAsha,5,02/10/2026\n";
const BATCH = "0190a000-0000-7000-8000-000000000001";

describe("contribution import server functions", () => {
  beforeEach(() => {
    granted = [];
    audits = [];
    serviceCalls = [];
  });

  it("needs donors.manage to upload, review or import, and does nothing when denied", async () => {
    granted = ["donors.view", "finance.manage"];
    await expect(
      call(fns.createContributionImport, { csv: CSV, fileName: "x.csv" })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.reviewContributionImport, { batchId: BATCH, mapping: {} })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.runContributionImport, { batchId: BATCH, decisions: {} })
    ).rejects.toThrow("Forbidden");
    expect(serviceCalls).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("audits an upload with the row count only, never the file name or cells", async () => {
    granted = ["donors.manage"];
    await call(fns.createContributionImport, {
      csv: CSV,
      defaultChannel: "upi",
      fileName: "priya-donations.csv",
      fundId: BATCH,
      orgAccountId: BATCH,
      programmeId: null,
      projectId: null,
      source: "generic_csv",
    });
    expect(serviceCalls).toEqual(["create"]);
    expect(audits).toEqual([
      {
        action: "import_batch.create",
        metadata: { rowCount: 2 },
        target: { type: "import_batch" },
      },
    ]);
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain("priya");
    expect(serialized).not.toContain("Priya");
  });

  it("audits review and run with counts against the batch", async () => {
    granted = ["donors.manage"];
    await call(fns.reviewContributionImport, {
      batchId: BATCH,
      dateFormat: "dmy",
      defaultChannel: "upi",
      mapping: { Amount: "amount", Date: "receivedOn", Name: "donorName" },
    });
    await call(fns.runContributionImport, {
      batchId: BATCH,
      decisions: { [BATCH]: { donor: "new" } },
    });
    expect(audits).toEqual([
      {
        action: "import_batch.review",
        metadata: { mappedColumnCount: 3 },
        target: { id: BATCH, type: "import_batch" },
      },
      {
        action: "import_batch.run",
        metadata: { decisionCount: 1 },
        target: { id: BATCH, type: "import_batch" },
      },
    ]);
  });

  it("shows batch rows to donor roles only, without auditing the read", async () => {
    granted = ["finance.view", "finance.manage"];
    await expect(
      call(fns.getContributionImport, { batchId: BATCH })
    ).rejects.toThrow("Forbidden");
    granted = ["donors.view"];
    await call(fns.getContributionImport, { batchId: BATCH });
    expect(serviceCalls).toEqual(["detail"]);
    expect(audits).toEqual([]);
  });
});
