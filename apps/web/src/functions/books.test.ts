import { beforeEach, describe, expect, it, mock } from "bun:test";

const YEAR = "0190a000-0000-7000-8000-000000000001";
const DOC = "0190a000-0000-7000-8000-000000000002";
const ACCOUNT = "0190a000-0000-7000-8000-000000000003";
const FUND = "0190a000-0000-7000-8000-000000000004";

let granted: string[] = [];
let audits: { action: string; metadata?: unknown; target?: unknown }[] = [];
let calls: string[] = [];

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
    const result = await execute();
    audits.push(options);
    return result;
  },
}));
const record =
  (name: string, result: unknown = {}) =>
  async () => {
    calls.push(name);
    return result;
  };
mock.module("@/lib/books/server", () => ({
  closeFiscalYear: record("close", { label: "2026-27" }),
  loadYearCloseChecklist: record("checklist"),
  postOpeningBalances: record("post", { id: DOC }),
  postPendingNow: record("postPending", { checked: 3, posted: 2 }),
  queuePostingAfterReopen: () => {
    calls.push("queueAfterReopen");
  },
  reopenFiscalYear: record("reopen", { label: "2026-27" }),
  reverseOpeningBalances: record("reverse"),
}));
mock.module("@pi-dash/db/queries/ledger-sources", () => ({
  countWaitingLedgerSources: async () => 4,
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

const fns = await import("./books");
type Handler = (input: {
  context: { headers?: Headers; session: unknown };
  data: unknown;
}) => Promise<unknown>;
const call = (fn: unknown, data: unknown) =>
  (fn as Handler)({ context: { session: { user: { id: "u-1" } } }, data });

const opening = {
  caConfirmedOn: "2026-10-01",
  caName: "Private CA Name",
  fiscalYearId: YEAR,
  id: DOC,
  lines: [
    { amountPaise: 123_456, kind: "account", orgAccountId: ACCOUNT },
    { amountPaise: 123_456, fundId: FUND, kind: "fund" },
  ],
};

describe("books server functions", () => {
  beforeEach(() => {
    granted = [];
    audits = [];
    calls = [];
  });

  it("keeps each treasurer action behind its own permission", async () => {
    granted = ["finance.view", "finance.manage"];
    await expect(call(fns.postOpeningBalancesFn, opening)).rejects.toThrow(
      "Forbidden"
    );
    await expect(
      call(fns.reverseOpeningBalancesFn, { id: DOC, reason: "Corrected" })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.closeFiscalYearFn, { fiscalYearId: YEAR })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.reopenFiscalYearFn, { fiscalYearId: YEAR, reason: "Missed" })
    ).rejects.toThrow("Forbidden");
    expect(calls).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("posts pending records only for finance.post_pending, audited with the waiting count", async () => {
    granted = ["finance.view", "finance.manage", "finance.close_year"];
    await expect(call(fns.postPendingFn, {})).rejects.toThrow("Forbidden");
    expect(calls).toEqual([]);
    granted = ["finance.post_pending"];
    expect(await call(fns.postPendingFn, {})).toEqual({
      checked: 3,
      posted: 2,
    });
    expect(calls).toEqual(["postPending"]);
    expect(audits).toEqual([
      {
        action: "books.post_pending",
        metadata: { waitingCount: 4 },
        target: { type: "books" },
      },
    ]);
  });

  it("posts what waited for a year once it is reopened", async () => {
    granted = ["finance.reopen_year"];
    await call(fns.reopenFiscalYearFn, {
      fiscalYearId: YEAR,
      reason: "Missed",
    });
    expect(calls).toEqual(["reopen", "queueAfterReopen"]);
  });

  it("lets closing a year not imply reopening it", async () => {
    granted = ["finance.close_year"];
    await call(fns.closeFiscalYearFn, { fiscalYearId: YEAR });
    await expect(
      call(fns.reopenFiscalYearFn, { fiscalYearId: YEAR, reason: "Missed" })
    ).rejects.toThrow("Forbidden");
    expect(calls).toEqual(["close"]);
  });

  it("reads the checklist for book readers without auditing", async () => {
    granted = ["finance.view"];
    await call(fns.getYearCloseChecklist, { fiscalYearId: YEAR });
    expect(calls).toEqual(["checklist"]);
    expect(audits).toEqual([]);
    granted = ["donors.view"];
    await expect(
      call(fns.getYearCloseChecklist, { fiscalYearId: YEAR })
    ).rejects.toThrow("Forbidden");
  });

  it("audits treasurer actions with IDs and counts only", async () => {
    granted = [
      "finance.post_opening",
      "finance.close_year",
      "finance.reopen_year",
    ];
    await call(fns.postOpeningBalancesFn, opening);
    await call(fns.reverseOpeningBalancesFn, {
      id: DOC,
      reason: "Private reason text",
    });
    await call(fns.closeFiscalYearFn, { fiscalYearId: YEAR });
    await call(fns.reopenFiscalYearFn, {
      fiscalYearId: YEAR,
      reason: "Private reason text",
    });
    expect(audits).toEqual([
      {
        action: "books.opening_balance.post",
        metadata: {
          accountLineCount: 1,
          assetLineCount: 0,
          fundLineCount: 1,
          liabilityLineCount: 0,
        },
        target: { id: DOC, type: "opening_balance" },
      },
      {
        action: "books.opening_balance.reverse",
        target: { id: DOC, type: "opening_balance" },
      },
      { action: "books.year.close", target: { id: YEAR, type: "fiscal_year" } },
      {
        action: "books.year.reopen",
        target: { id: YEAR, type: "fiscal_year" },
      },
    ]);
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain("Private");
    expect(serialized).not.toContain("123456");
  });
});
