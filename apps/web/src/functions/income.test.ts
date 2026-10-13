import { beforeEach, describe, expect, it, mock } from "bun:test";

let allowed = true;
let permissionChecks: string[] = [];
let ranges: { endsOn: string; startsOn: string }[] = [];

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/api-auth", () => ({
  assertServerAnyPermission: async (
    _session: unknown,
    permissions: readonly string[]
  ) => {
    permissionChecks.push(...permissions);
    if (!allowed) {
      throw new Error("Forbidden");
    }
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

const { getMissingDonorDetails } = await import("./income");
const handler = getMissingDonorDetails as unknown as (input: {
  context: { session: unknown };
}) => Promise<{ count: number; financialYear: string; partyIds: string[] }>;

describe("getMissingDonorDetails", () => {
  beforeEach(() => {
    allowed = true;
    permissionChecks = [];
    ranges = [];
  });

  it("requires a donors or finance permission and never queries when denied", async () => {
    allowed = false;
    await expect(
      handler({ context: { session: { user: { id: "u" } } } })
    ).rejects.toThrow("Forbidden");
    expect(permissionChecks).toEqual([
      "donors.view",
      "finance.view",
      "donors.manage",
      "finance.manage",
    ]);
    expect(ranges).toEqual([]);
  });

  it("returns the count and party IDs for the current financial year", async () => {
    const result = await handler({
      context: { session: { user: { id: "u" } } },
    });
    expect(result.count).toBe(2);
    expect(result.partyIds).toHaveLength(2);
    expect(Object.keys(result).sort()).toEqual([
      "count",
      "financialYear",
      "partyIds",
    ]);
    const [range] = ranges;
    expect(range?.startsOn).toMatch(/^\d{4}-04-01$/);
    expect(range?.endsOn).toMatch(/^\d{4}-03-31$/);
    expect(result.financialYear).toBe(
      `${range?.startsOn.slice(0, 4)}-${range?.endsOn.slice(2, 4)}`
    );
  });
});
