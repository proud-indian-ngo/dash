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
  buildSessionContext: async () => ({
    permissions: granted,
    role: "test",
    userId: "u-1",
  }),
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
  postAuditedFiguresNow: record("postAudited", { id: DOC }),
  postOpeningBalances: record("post", { id: DOC }),
  postPendingNow: record("postPending", { checked: 3, posted: 2 }),
  queuePostingAfterReopen: () => {
    calls.push("queueAfterReopen");
  },
  reopenFiscalYear: record("reopen", { label: "2026-27" }),
  reverseAuditedFiguresNow: record("reverseAudited"),
  reverseOpeningBalances: record("reverse"),
  skipAuditedFiguresNow: record("skipAudited"),
}));
let workbookInputs: { fiscalYearId: string; includeDonors: boolean }[] = [];
mock.module("@/lib/ca-workbook/server", () => ({
  buildCaWorkbook: async (input: {
    fiscalYearId: string;
    includeDonors: boolean;
  }) => {
    calls.push("workbook");
    workbookInputs.push(input);
    return {
      counts: {
        balanceItemCount: 12,
        entryCount: 30,
        giftCount: 7,
        movementCount: 40,
      },
      file: {
        base64: "UEsDBA==",
        filename: "proud-indian-ca-workbook-2026-27.xlsx",
      },
      financialYear: "2026-27",
      donorListIncluded: input.includeDonors,
    };
  },
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
    workbookInputs = [];
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

  it("matches, skips and reverses audited figures only for finance.adjust, audited with counts only", async () => {
    const audited = {
      added: [
        {
          accountHeadId: FUND,
          auditedPaise: 98_765,
          kind: "liability",
          memo: "Private liability name",
        },
      ],
      caName: "Private CA Name",
      fiscalYearId: YEAR,
      id: DOC,
      lines: [
        {
          auditedPaise: 123_456,
          booksPaise: 123_456,
          key: `account:${ACCOUNT}`,
        },
        { auditedPaise: 100, booksPaise: 400, key: `fund:${FUND}` },
      ],
      signedOn: "2027-09-30",
      transfers: [],
    };
    granted = [
      "finance.view",
      "finance.manage",
      "finance.post_opening",
      "finance.close_year",
    ];
    await expect(call(fns.postAuditedFiguresFn, audited)).rejects.toThrow(
      "Forbidden"
    );
    await expect(
      call(fns.skipAuditedFiguresFn, {
        fiscalYearId: YEAR,
        id: DOC,
        reason: "Private reason text",
      })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.reverseAuditedFiguresFn, { id: DOC, reason: "Corrected" })
    ).rejects.toThrow("Forbidden");
    expect(calls).toEqual([]);

    granted = ["finance.adjust"];
    await call(fns.postAuditedFiguresFn, audited);
    await call(fns.skipAuditedFiguresFn, {
      fiscalYearId: YEAR,
      id: DOC,
      reason: "Private reason text",
    });
    await call(fns.reverseAuditedFiguresFn, {
      id: DOC,
      reason: "Private reason text",
    });
    expect(calls).toEqual([
      "postAudited",
      "skipAudited",
      "reverseAudited",
      "queueAfterReopen",
    ]);
    expect(audits).toEqual([
      {
        action: "books.audited_figures.post",
        metadata: {
          addedLineCount: 1,
          differenceCount: 2,
          lineCount: 2,
          transferCount: 0,
        },
        target: { id: DOC, type: "audited_figures" },
      },
      {
        action: "books.audited_figures.skip",
        target: { id: DOC, type: "audited_figures" },
      },
      {
        action: "books.audited_figures.reverse",
        target: { id: DOC, type: "audited_figures" },
      },
    ]);
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain("Private");
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("98765");
  });

  it("exports the CA workbook to book readers, the donor list only with a donor permission, audited with counts", async () => {
    granted = ["donors.view", "finance.post_pending"];
    await expect(
      call(fns.exportCaWorkbook, { fiscalYearId: YEAR })
    ).rejects.toThrow("Forbidden");
    expect(calls).toEqual([]);

    granted = ["finance.view"];
    const file = await call(fns.exportCaWorkbook, { fiscalYearId: YEAR });
    expect(file).toEqual({
      base64: "UEsDBA==",
      filename: "proud-indian-ca-workbook-2026-27.xlsx",
    });
    granted = ["finance.manage", "donors.view"];
    await call(fns.exportCaWorkbook, { fiscalYearId: YEAR });
    granted = ["finance.view", "finance.view_sensitive"];
    await call(fns.exportCaWorkbook, { fiscalYearId: YEAR });
    expect(workbookInputs).toEqual([
      { fiscalYearId: YEAR, includeDonors: false },
      { fiscalYearId: YEAR, includeDonors: true },
      { fiscalYearId: YEAR, includeDonors: true },
    ]);
    const audit = (donorListIncluded: boolean) => ({
      action: "books.ca_workbook.export",
      metadata: {
        balanceItemCount: 12,
        donorListIncluded,
        entryCount: 30,
        financialYear: "2026-27",
        giftCount: 7,
        movementCount: 40,
      },
      target: { id: YEAR, type: "fiscal_year" },
    });
    expect(audits).toEqual([audit(false), audit(true), audit(true)]);
  });
});
