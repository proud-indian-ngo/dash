import { beforeEach, describe, expect, it, mock } from "bun:test";

const GIFT = "0190a000-0000-7000-8000-000000000001";
const RECEIPT = "0190a000-0000-7000-8000-000000000002";

let granted: string[] = [];
let audits: {
  action: string;
  finalMetadata?: unknown;
  finalTarget?: unknown;
  metadata?: unknown;
  target?: unknown;
}[] = [];
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
  MAX_ID_VALUES: 50,
  runSessionAuditedAction: async (
    _session: unknown,
    _headers: unknown,
    options: { action: string; metadata?: unknown; target?: unknown },
    execute: () => Promise<unknown>,
    _classify?: unknown,
    resolveTarget?: (result: unknown) => unknown,
    resolveMetadata?: (result: unknown) => unknown
  ) => {
    const result = await execute();
    audits.push({
      ...options,
      ...(resolveTarget ? { finalTarget: resolveTarget(result) } : {}),
      ...(resolveMetadata ? { finalMetadata: resolveMetadata(result) } : {}),
    });
    return result;
  },
}));
const record =
  (name: string, result: unknown = {}) =>
  async () => {
    calls.push(name);
    return result;
  };
mock.module("@/lib/receipts/server", () => ({
  issueReceipts: record("issue", {
    issued: [{ contributionId: GIFT, id: RECEIPT, number: "PI/2026-27/0001" }],
    skipped: [],
  }),
  loadCandidates: record("candidates", {
    blocked: [],
    configGaps: [],
    eligible: [],
    other: [],
  }),
  loadReadiness: record("readiness", {
    cantIssue: [],
    needsDetails: [],
    ready: [GIFT],
  }),
  queueReceiptEmail: record("email", { contributionId: GIFT }),
  voidReceipt: record("void", { contributionId: GIFT, id: RECEIPT }),
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

const fns = await import("./contribution-receipts");
type Handler = (input: {
  context: { headers?: Headers; session: unknown };
  data: unknown;
}) => Promise<unknown>;
const call = (fn: unknown, data: unknown) =>
  (fn as Handler)({ context: { session: { user: { id: "u-1" } } }, data });

describe("receipt server functions", () => {
  beforeEach(() => {
    granted = [];
    audits = [];
    calls = [];
  });

  it("keeps every receipt action behind donors.receipt", async () => {
    granted = ["donors.manage", "finance.manage", "finance.view_sensitive"];
    await expect(
      call(fns.issueContributionReceipts, { giftIds: [GIFT] })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.voidContributionReceipt, {
        reason: "Wrong donor",
        receiptId: RECEIPT,
      })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.emailContributionReceipt, { receiptId: RECEIPT })
    ).rejects.toThrow("Forbidden");
    await expect(
      call(fns.getReceiptCandidates, { giftIds: null })
    ).rejects.toThrow("Forbidden");
    expect(calls).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("audits issue, void and email with IDs and counts only", async () => {
    granted = ["donors.receipt"];
    await call(fns.issueContributionReceipts, { giftIds: [GIFT] });
    await call(fns.voidContributionReceipt, {
      reason: "Private reason text",
      receiptId: RECEIPT,
    });
    await call(fns.emailContributionReceipt, { receiptId: RECEIPT });
    expect(calls).toEqual(["issue", "void", "email"]);
    expect(audits).toEqual([
      {
        action: "contribution_receipt.issue",
        finalMetadata: {
          contributionIds: [GIFT],
          issuedCount: 1,
          skippedCount: 0,
        },
        finalTarget: { id: RECEIPT, type: "contribution_receipt" },
        metadata: { requestedCount: 1 },
        target: { type: "contribution_receipt" },
      },
      {
        action: "contribution_receipt.void",
        target: { id: RECEIPT, type: "contribution_receipt" },
      },
      {
        action: "contribution_receipt.email",
        target: { id: RECEIPT, type: "contribution_receipt" },
      },
    ]);
    expect(JSON.stringify(audits)).not.toContain("Private reason text");
  });

  it("lets receipt readers load readiness, unaudited", async () => {
    granted = ["finance.view"];
    await expect(
      call(fns.getContributionReceiptReadiness, {})
    ).resolves.toEqual({ cantIssue: [], needsDetails: [], ready: [GIFT] });
    expect(calls).toEqual(["readiness"]);
    expect(audits).toEqual([]);
  });

  it("refuses readiness without both an income and a receipt-view permission", async () => {
    // donors.receipt alone opens nothing (no income permission).
    granted = ["donors.receipt"];
    await expect(call(fns.getContributionReceiptReadiness, {})).rejects.toThrow(
      "Forbidden"
    );
    // donors.view sees income but not receipts.
    granted = ["donors.view"];
    await expect(call(fns.getContributionReceiptReadiness, {})).rejects.toThrow(
      "Forbidden"
    );
    expect(calls).toEqual([]);
  });

  it("reads candidates without auditing", async () => {
    granted = ["donors.receipt"];
    await call(fns.getReceiptCandidates, { giftIds: [GIFT] });
    expect(calls).toEqual(["candidates"]);
    expect(audits).toEqual([]);
  });
});
