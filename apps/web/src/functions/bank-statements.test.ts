import { beforeEach, describe, expect, it, mock } from "bun:test";

let granted: string[] = [];
let audits: { action: string; metadata?: unknown; target?: unknown }[] = [];
let serviceCalls: { args: unknown[]; name: string }[] = [];

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
const service =
  (name: string, result: unknown = {}) =>
  async (...args: unknown[]) => {
    serviceCalls.push({ args, name });
    return result;
  };
mock.module("@/lib/bank-statement/server", () => ({
  actOnStatementLine: service("act", { lineId: "l" }),
  createStatementBatch: service("create", { batchId: "b" }),
  describeStatementAction: async (input: { action: string }) =>
    input.action === "accept"
      ? { kind: "settlement", targetId: "0190a000-0000-7000-8000-000000000009" }
      : {},
  previewStatementMatches: async () => ({ matched: 2, suggested: 1 }),
  previewStatementRun: async () => ({
    error: 0,
    existing: 2,
    new: 5,
    skipped: 4,
  }),
  findStatementMatches: service("match", { matched: 0, suggested: 0 }),
  reviewStatementBatch: service("review"),
  runStatementBatch: service("run"),
  statementLinkCandidates: service("candidates"),
}));
mock.module("@pi-dash/db/queries/statement-lines", () => ({
  statementSummary: service("summary", { closing: null }),
}));
mock.module("@pi-dash/db/queries/razorpay-settlements", () => ({
  razorpaySettlementSummary: service("razorpay", { awaitingPaise: 5 }),
}));
mock.module("@/lib/razorpay/config", () => ({
  razorpaySetup: () => ({ enabled: false }),
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

const fns = await import("./bank-statements");
type Handler = (input: {
  context: { headers?: Headers; session: unknown };
  data: unknown;
}) => Promise<unknown>;
const call = (fn: unknown, data: unknown) =>
  (fn as Handler)({
    context: { session: { user: { id: "u-1" } } },
    data,
  });

const CSV =
  "Date,Narration,Withdrawal Amt.,Deposit Amt.\n01/10/2026,UPI-PRIYA RAO priya@okaxis,,500.00\n";
const ID = "0190a000-0000-7000-8000-000000000001";
const LINE = "0190a000-0000-7000-8000-000000000002";

describe("bank statement server functions", () => {
  beforeEach(() => {
    granted = [];
    audits = [];
    serviceCalls = [];
  });

  it("needs finance.manage for every write, and does nothing when denied", async () => {
    granted = ["finance.view", "donors.manage"];
    await expect(
      call(fns.createBankStatementImport, {
        csv: CSV,
        fileName: "x.csv",
        orgAccountId: ID,
      })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.reviewBankStatementImport, { batchId: ID, mapping: {} })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.runBankStatementImport, { batchId: ID })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.findBankStatementMatches, { orgAccountId: ID })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.updateStatementLine, { action: "unmatch", lineId: LINE })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.getStatementLinkCandidates, { lineId: LINE })
    ).rejects.toThrow("Forbidden");
    expect(serviceCalls).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("lets finance.view read, not donors.view", async () => {
    granted = ["donors.view", "donors.manage"];
    await expect(
      call(fns.getBankStatementSummary, { orgAccountId: ID })
    ).rejects.toThrow("Forbidden");
    granted = ["finance.view"];
    await call(fns.getBankStatementSummary, { orgAccountId: ID });
    expect(serviceCalls.map((c) => c.name)).toEqual(["summary"]);
    // Reads are not audited.
    expect(audits).toEqual([]);
  });

  it("audits an upload with the row count, never the file name or cells", async () => {
    granted = ["finance.manage"];
    await call(fns.createBankStatementImport, {
      csv: CSV,
      fileName: "priya-hdfc.csv",
      orgAccountId: ID,
    });
    expect(audits).toEqual([
      {
        action: "import_batch.create",
        metadata: { rowCount: 1, source: "bank_csv" },
        target: { type: "import_batch" },
      },
    ]);
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain("priya");
    expect(serialized).not.toContain("PRIYA");
    expect(serialized).not.toContain("500");
  });

  it("audits line actions with kinds, reasons and IDs only", async () => {
    granted = ["finance.manage"];
    await call(fns.updateStatementLine, {
      action: "link",
      kind: "settlement",
      lineId: LINE,
      targetId: ID,
    });
    await call(fns.updateStatementLine, {
      action: "ignore",
      lineId: LINE,
      note: "Priya's refund of a deposit",
      reason: "other",
    });
    await call(fns.updateStatementLine, {
      action: "note",
      lineId: LINE,
      note: "call Priya",
    });
    expect(audits).toEqual([
      {
        action: "statement_line.link",
        metadata: { kind: "settlement", relatedIds: { settlementId: ID } },
        target: { id: LINE, type: "statement_line" },
      },
      {
        action: "statement_line.ignore",
        metadata: { reason: "other" },
        target: { id: LINE, type: "statement_line" },
      },
      {
        action: "statement_line.note",
        metadata: {},
        target: { id: LINE, type: "statement_line" },
      },
    ]);
    expect(JSON.stringify(audits)).not.toContain("Priya");
    expect(serviceCalls.map((c) => c.name)).toEqual(["act", "act", "act"]);
  });

  it("audits Find matches and a run with planned counts", async () => {
    granted = ["finance.manage"];
    await call(fns.findBankStatementMatches, { orgAccountId: ID });
    await call(fns.runBankStatementImport, { batchId: ID });
    expect(audits).toEqual([
      {
        action: "statement_line.find_matches",
        metadata: { matchCount: 2, suggestionCount: 1 },
        target: { id: ID, type: "org_account" },
      },
      {
        action: "import_batch.run",
        metadata: {
          errorCount: 0,
          existingCount: 2,
          newLineCount: 5,
          skippedCount: 4,
          source: "bank_csv",
        },
        target: { id: ID, type: "import_batch" },
      },
    ]);
  });

  it("audits an accepted suggestion with its kind and record", async () => {
    granted = ["finance.manage"];
    await call(fns.updateStatementLine, { action: "accept", lineId: LINE });
    expect(audits).toEqual([
      {
        action: "statement_line.accept",
        metadata: {
          kind: "settlement",
          relatedIds: {
            settlementId: "0190a000-0000-7000-8000-000000000009",
          },
        },
        target: { id: LINE, type: "statement_line" },
      },
    ]);
  });
});
