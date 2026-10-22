import { beforeEach, describe, expect, it, mock } from "bun:test";

let granted: string[] = [];
let evidenceCalls: string[][] = [];
let permissionChecks: string[] = [];
let ranges: { endsOn: string; startsOn: string }[] = [];

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
mock.module("@pi-dash/db/queries/contribution-bank-evidence", () => ({
  contributionBankEvidence: async (ids: string[]) => {
    evidenceCalls.push(ids);
    return {
      matchedContributionIds: ids.slice(0, 1),
      processedContributionIds: ids.slice(1),
    };
  },
}));
mock.module("@pi-dash/db/queries/income", () => ({
  listDonorsMissingFilingDetails: async (range: {
    endsOn: string;
    startsOn: string;
  }) => {
    ranges.push(range);
    return [
      "0190a000-0000-7000-8000-000000000001",
      "0190a000-0000-7000-8000-000000000002",
    ];
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

const fns = await import("./income");
type Handler = (input: {
  context: { session: unknown };
  data: { contributionIds: string[] };
}) => Promise<unknown>;
const call = (ids: string[]) =>
  (fns.getContributionBankEvidence as unknown as Handler)({
    context: { session: {} },
    data: { contributionIds: ids },
  });

const missingDetailsHandler = fns.getMissingDonorDetails as unknown as (input: {
  context: { session: unknown };
}) => Promise<{ count: number; financialYear: string; partyIds: string[] }>;

describe("getMissingDonorDetails", () => {
  beforeEach(() => {
    granted = [];
    permissionChecks = [];
    ranges = [];
  });

  it("requires a donors or finance permission and never queries when denied", async () => {
    await expect(
      missingDetailsHandler({ context: { session: { user: { id: "u" } } } })
    ).rejects.toThrow("Forbidden");
    expect(permissionChecks).toEqual([
      "donors.view",
      "finance.view",
      "donors.manage",
      "finance.manage",
    ]);
    expect(ranges).toEqual([]);
  });
});

describe("getContributionBankEvidence", () => {
  beforeEach(() => {
    granted = [];
    evidenceCalls = [];
    permissionChecks = [];
  });

  it("requires finance permission before querying", async () => {
    granted = ["donors.manage"];
    await expect(call(["a"])).rejects.toThrow("Forbidden");
    expect(evidenceCalls).toEqual([]);
  });

  it("allows finance.view or finance.manage and preserves the requested scope", async () => {
    granted = ["finance.view"];
    await expect(call(["a", "b"])).resolves.toEqual({
      matchedContributionIds: ["a"],
      processedContributionIds: ["b"],
    });
    granted = ["finance.manage"];
    await call(["c"]);
    expect(evidenceCalls).toEqual([["a", "b"], ["c"]]);
  });
});
