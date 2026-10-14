import { beforeEach, describe, expect, it, mock } from "bun:test";

let granted: string[] = [];
let permissionChecks: string[] = [];
let builds: string[] = [];
let audits: Record<string, unknown>[] = [];
let auditOrder: string[] = [];

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/api-auth", () => ({
  assertServerAnyPermission: async (
    _session: unknown,
    permissions: readonly string[]
  ) => {
    permissionChecks.push(...permissions);
    if (!permissions.some((permission) => granted.includes(permission))) {
      throw new Error("Forbidden");
    }
  },
  assertServerPermission: async (_session: unknown, permission: string) => {
    permissionChecks.push(permission);
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
    execute: () => Promise<unknown>
  ) => {
    audits.push(options);
    auditOrder.push("audit");
    return await execute();
  },
}));
class DonationsReturnError extends Error {}
mock.module("@/lib/donations-return-export", () => ({
  buildAllGiftsFile: async (fy: { label: string }) => {
    builds.push(`all:${fy.label}`);
    auditOrder.push("build");
    return {
      file: { csv: "a,b", filename: "all.csv" },
      giftCount: 7,
      rowCount: 7,
    };
  },
  buildUploadFile: async (fy: { label: string }) => {
    builds.push(`upload:${fy.label}`);
    auditOrder.push("build");
    return {
      file: { csv: "x,y", filename: "upload.csv" },
      giftCount: 5,
      rowCount: 3,
    };
  },
  DonationsReturnError,
}));
mock.module("@pi-dash/db/queries/donations-return", () => ({
  countImportRowsWaiting: async () => 4,
  loadReturnFacts: async () => ({
    donors: new Map([
      [
        "p1",
        {
          hasAddress: true,
          hasIdNumber: true,
          hasName: true,
          idType: "pan",
          idValid: true,
          partyId: "p1",
          taxCertificateOptOut: false,
        },
      ],
    ]),
    exportDetails: new Map(),
    identifiersAvailable: true,
    gifts: [
      {
        amountPaise: 100_000,
        channel: "upi",
        currency: "INR",
        deductionEligible: "unknown",
        donationType: "voluntary",
        eligibilityReason: null,
        id: "g1",
        partyId: "p1",
        receivedOn: "2026-06-01",
        refundedPaise: 0,
        reportingMode: "electronic_or_account_payee",
        status: "received",
      },
      {
        amountPaise: 50_000,
        channel: "upi",
        currency: "INR",
        deductionEligible: "unknown",
        donationType: "csr",
        eligibilityReason: null,
        id: "g2",
        partyId: "p1",
        receivedOn: "2026-07-01",
        refundedPaise: 0,
        reportingMode: "electronic_or_account_payee",
        status: "received",
      },
    ],
  }),
  loadReturnRegistration: async () => null,
}));
mock.module("@/lib/safe-errors", () => ({
  withSafeErrors: async (_options: unknown, work: () => Promise<unknown>) =>
    await work(),
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

const fns = await import("./donations-return");
type Handler = (input: {
  context: { headers?: Headers; session: unknown };
  data: Record<string, unknown>;
}) => Promise<unknown>;
const call = (fn: unknown, data: Record<string, unknown>) =>
  (fn as Handler)({
    context: { session: { user: { id: "u" } } },
    data,
  });

describe("exportDonationsReturn", () => {
  beforeEach(() => {
    granted = [];
    permissionChecks = [];
    builds = [];
    audits = [];
    auditOrder = [];
  });

  it("needs finance.view_sensitive and builds nothing without it", async () => {
    granted = ["finance.view", "donors.view", "finance.manage"];
    await expect(
      call(fns.exportDonationsReturn, {
        file: "upload",
        financialYear: "2026-27",
      })
    ).rejects.toThrow("Forbidden");
    expect(permissionChecks).toEqual(["finance.view_sensitive"]);
    expect(builds).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("audits the export with the year, file and counts only", async () => {
    granted = ["finance.view_sensitive"];
    const result = await call(fns.exportDonationsReturn, {
      file: "upload",
      financialYear: "2026-27",
    });
    expect(result).toEqual({ csv: "x,y", filename: "upload.csv" });
    expect(audits).toEqual([
      {
        action: "donations_return.export",
        metadata: {
          file: "upload",
          financialYear: "2026-27",
          giftCount: 5,
          rowCount: 3,
        },
        target: { type: "donations_return" },
      },
    ]);
    // The file is returned only through the audited action.
    expect(auditOrder).toEqual(["build", "audit"]);

    await call(fns.exportDonationsReturn, {
      file: "all",
      financialYear: "2026-27",
    });
    expect(builds).toEqual(["upload:2026-27", "all:2026-27"]);
  });

  it("refuses a year before the first return", async () => {
    granted = ["finance.view_sensitive"];
    await expect(
      call(fns.exportDonationsReturn, {
        file: "upload",
        financialYear: "2025-26",
      })
    ).rejects.toThrow("2026-27 onward");
    expect(builds).toEqual([]);
    expect(audits).toEqual([]);
  });
});

describe("getDonationsReturnReadiness", () => {
  beforeEach(() => {
    granted = [];
    permissionChecks = [];
  });

  it("needs an income permission", async () => {
    await expect(
      call(fns.getDonationsReturnReadiness, { financialYear: "2026-27" })
    ).rejects.toThrow("Forbidden");
    expect(permissionChecks).toEqual([
      "donors.view",
      "finance.view",
      "donors.manage",
      "finance.manage",
    ]);
  });

  it("returns outcomes and counts, never donor details", async () => {
    granted = ["donors.view"];
    const result = (await call(fns.getDonationsReturnReadiness, {
      financialYear: "2026-27",
    })) as Awaited<
      ReturnType<
        typeof import("./donations-return").getDonationsReturnReadiness
      >
    >;
    expect(result.financialYear).toBe("2026-27");
    expect(result.dueOn).toBe("2027-05-31");
    expect(result.summary.readyCount).toBe(2);
    // Voluntary and CSR are both "Specific grant", so one upload row.
    expect(result.exportRowCount).toBe(1);
    expect(result.importRowsWaiting).toBe(4);
    expect(result.registrationReady).toBe(false);
    expect(result.identifiersAvailable).toBe(true);
    expect(Object.keys(result.gifts[0] ?? {}).sort()).toEqual([
      "donationType",
      "id",
      "missingDonorDetails",
      "netPaise",
      "outcome",
      "partyId",
      "refundedPaise",
    ]);
  });
});
