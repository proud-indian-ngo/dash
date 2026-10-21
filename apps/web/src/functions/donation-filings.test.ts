import { beforeEach, describe, expect, it, mock } from "bun:test";

let granted: string[] = [];
let calls: string[] = [];
let audits: Record<string, unknown>[] = [];

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/api-auth", () => ({
  assertServerAnyPermission: async (
    _session: unknown,
    permissions: readonly string[]
  ) => {
    if (!permissions.some((permission) => granted.includes(permission))) {
      throw new Error("Forbidden");
    }
  },
  assertServerPermission: async (_session: unknown, permission: string) => {
    if (!granted.includes(permission)) {
      throw new Error("Forbidden");
    }
  },
}));
mock.module("@/lib/audit", () => ({
  runSessionAuditedAction: async (
    _session: unknown,
    _headers: unknown,
    options: Record<string, unknown>,
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
mock.module("@/lib/donation-filings/server", () => ({
  discard: async () => {
    calls.push("discard");
  },
  loadRows: async () => {
    calls.push("rows");
    return [];
  },
  queueCertificateEmails: async (_id: string, ids?: string[]) => {
    calls.push(ids ? "resend" : "email");
    return { noEmail: ["No Mail"], queued: 2, suppressed: [] };
  },
  recordFiling: async (fy: { label: string }) => {
    calls.push(`record:${fy.label}`);
    return {
      file: { csv: "x", filename: "f.csv" },
      filingId: "0190a000-0000-7000-8000-0000000000f1",
      giftCount: 5,
      rowCount: 3,
      sequence: 1,
    };
  },
  reviewCertificate: async (_id: string, decision: string) => {
    calls.push(decision);
    return { filingId: FILING };
  },
  submitFiling: async () => {
    calls.push("submit");
  },
  undoSubmission: async () => {
    calls.push("undo");
  },
  uploadCertificates: async () => {
    calls.push("upload");
    return { alreadyStored: [], matched: [{}], unmatched: [{}, {}] };
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

const fns = await import("./donation-filings");
type Handler = (input: {
  context: { headers?: Headers; session: unknown };
  data: Record<string, unknown>;
}) => Promise<unknown>;
const call = (fn: unknown, data: Record<string, unknown>) =>
  (fn as Handler)({ context: { session: { user: { id: "u" } } }, data });

const FILING = "0190a000-0000-7000-8000-0000000000f1";

describe("donation filing server functions", () => {
  beforeEach(() => {
    granted = [];
    calls = [];
    audits = [];
  });

  it("lets anyone who can see Income read a filing's rows, and no one else", async () => {
    await expect(
      call(fns.getDonationFilingRows, { filingId: FILING })
    ).rejects.toThrow("Forbidden");
    granted = ["donors.view"];
    await call(fns.getDonationFilingRows, { filingId: FILING });
    expect(calls).toEqual(["rows"]);
  });

  it("records a filing only with finance.manage and finance.view_sensitive", async () => {
    granted = ["finance.manage"];
    await expect(
      call(fns.recordDonationFiling, {
        financialYear: "2026-27",
        preArns: null,
      })
    ).rejects.toThrow("Forbidden");
    granted = ["finance.view_sensitive"];
    await expect(
      call(fns.recordDonationFiling, {
        financialYear: "2026-27",
        preArns: null,
      })
    ).rejects.toThrow("Forbidden");
    expect(calls).toEqual([]);

    granted = ["finance.manage", "finance.view_sensitive"];
    await call(fns.recordDonationFiling, {
      financialYear: "2026-27",
      preArns: null,
    });
    expect(calls).toEqual(["record:2026-27"]);
    expect(audits).toEqual([
      {
        action: "donation_filing.record",
        finalMetadata: {
          financialYear: "2026-27",
          giftCount: 5,
          preArnsGiven: 0,
          rowCount: 3,
          sequence: 1,
        },
        finalTarget: { id: FILING, type: "donation_filing" },
        metadata: { financialYear: "2026-27", preArnsGiven: 0 },
        target: { type: "donation_filing" },
      },
    ]);
  });

  it("refuses a year before the first return", async () => {
    granted = ["finance.manage", "finance.view_sensitive"];
    await expect(
      call(fns.recordDonationFiling, {
        financialYear: "2025-26",
        preArns: null,
      })
    ).rejects.toThrow("2026-27 onward");
    expect(audits).toEqual([]);
  });

  it("needs finance.manage to submit, discard, take back, review, add certificates and email them", async () => {
    granted = ["finance.view", "finance.view_sensitive", "donors.manage"];
    const commands: [unknown, Record<string, unknown>][] = [
      [
        fns.submitDonationFiling,
        {
          acknowledgementNumber: "A1",
          filedOn: "2026-10-01",
          filingId: FILING,
          transactionId: "T1",
        },
      ],
      [fns.discardDonationFiling, { filingId: FILING }],
      [fns.undoDonationFilingSubmission, { filingId: FILING }],
      [
        fns.reviewDonationCertificate,
        {
          certificateId: "0190a000-0000-7000-8000-0000000000c1",
          decision: "confirm",
        },
      ],
      [
        fns.uploadDonationCertificates,
        { base64: "JVBERg==", fileName: "a.pdf", filingId: FILING },
      ],
      [fns.emailDonationCertificates, { filingId: FILING }],
    ];
    for (const [fn, data] of commands) {
      await expect(call(fn, data)).rejects.toThrow("Forbidden");
    }
    expect(calls).toEqual([]);

    granted = ["finance.manage"];
    for (const [fn, data] of commands) {
      await call(fn, data);
    }
    expect(calls).toEqual([
      "submit",
      "discard",
      "undo",
      "confirm",
      "upload",
      "email",
    ]);
    expect(audits.map((audit) => audit.action)).toEqual([
      "donation_filing.submit",
      "donation_filing.discard",
      "donation_filing.undo_submission",
      "donation_certificate.confirm",
      "donation_certificate.upload",
      "donation_certificate.email",
    ]);
    expect(audits[4]?.finalMetadata).toEqual({
      alreadyStoredCount: 0,
      matchedCount: 1,
      unmatchedCount: 2,
    });
    // Counts only: never the names of donors without an email address.
    expect(audits[5]?.finalMetadata).toEqual({
      noEmailCount: 1,
      queuedCount: 2,
      resend: false,
      suppressedCount: 0,
    });
  });

  it("audits an explicit resend as one", async () => {
    granted = ["finance.manage"];
    await call(fns.emailDonationCertificates, {
      certificateIds: ["0190a000-0000-7000-8000-0000000000c1"],
      filingId: FILING,
    });
    expect(calls).toEqual(["resend"]);
    expect(audits[0]?.metadata).toEqual({ resend: true });
  });
});
