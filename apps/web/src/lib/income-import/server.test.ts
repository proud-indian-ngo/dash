import { beforeEach, describe, expect, it, mock } from "bun:test";

const PAN = "ABCDE1234F";
const OTHER_PAN = "PQRST6789K";
const BATCH = "0190a000-0000-7000-8000-000000000001";

let status = "completed";
let outcomes: string[] = [];

const batchRow = () => ({
  dateFormat: "dmy",
  defaultChannel: "upi",
  fileName: "gifts.csv",
  id: BATCH,
  mapping: {
    Amount: "amount",
    Date: "receivedOn",
    Name: "donorName",
    "Tax ID": "idNumber",
  },
  orgAccountId: "0190a000-0000-7000-8000-0000000000aa",
  rowCount: 2,
  source: "generic_csv",
  status,
});

const rawRows = () => [
  {
    Amount: "100",
    Date: "01/10/2026",
    Name: "Asha Rao",
    Note: `pan ${OTHER_PAN.toLowerCase()} given`,
    "Tax ID": PAN,
  },
  // A PAN in the amount column: an error whose message would quote the cell.
  {
    Amount: OTHER_PAN,
    Date: "02/10/2026",
    Name: "Dev",
    Note: "",
    "Tax ID": "",
  },
];

const noop = async () => undefined;

mock.module("@pi-dash/db/import-retention", () => ({
  importedRowRetention: () => ({}),
  uploadedRowRetention: () => ({}),
}));
mock.module("@pi-dash/db/queries/party-private", () => ({
  savePartyInTransaction: noop,
}));
mock.module("@pi-dash/db/queries/income-import", () => ({
  claimImportBatch: noop,
  countImportOutcomes: noop,
  findBatchByFileHash: noop,
  findContributorsByContact: async () => ({
    byEmail: new Map(),
    byPhone: new Map(),
  }),
  findContributorsByIdentifier: async () => new Map(),
  findDuplicateCandidates: async () => [],
  findExternalIdentities: async () => [],
  getImportBatch: async () => batchRow(),
  insertImportBatch: noop,
  insertImportedContribution: noop,
  latestImportMapping: noop,
  listImportRows: async () =>
    rawRows().map((raw, index) => ({
      id: `0190a000-0000-7000-8000-00000000010${index}`,
      outcome: outcomes[index] ?? "pending",
      outcomeReason: null,
      parseIssue: null,
      raw,
      rowNumber: index + 1,
    })),
  recordImportCollectionEvent: noop,
  resolveImportSettings: noop,
  setImportRowOutcome: noop,
  setImportRowsRetention: noop,
  updateImportBatch: noop,
  withImportTransaction: noop,
}));

const { getImportBatchDetail } = await import("./server");

describe("getImportBatchDetail", () => {
  beforeEach(() => {
    status = "completed";
    outcomes = ["imported", "error"];
  });

  for (const canManage of [false, true]) {
    it(`never sends a full identifier (${canManage ? "manager" : "viewer"})`, async () => {
      const detail = await getImportBatchDetail(BATCH, { canManage });
      const json = JSON.stringify(detail);
      expect(json).not.toContain(PAN);
      expect(json).not.toContain(OTHER_PAN);
      expect(json.toUpperCase()).not.toContain(OTHER_PAN);
      expect(detail.review?.rows[0]?.maskedId).toBe("••••234F");
      expect(detail.review?.rows[0]?.donorName).toBe("Asha Rao");
    });
  }

  it("sends column samples to donor managers only, while rows are left to import", async () => {
    expect(
      (await getImportBatchDetail(BATCH, { canManage: false })).columns
    ).toEqual([]);
    const { columns } = await getImportBatchDetail(BATCH, { canManage: true });
    expect(columns.find((c) => c.header === "Tax ID")?.samples).toEqual([
      "••••234F",
    ]);
    expect(columns.find((c) => c.header === "Note")?.samples).toEqual([
      "pan ••••789K given",
    ]);
    expect(columns.find((c) => c.header === "Amount")?.samples).toEqual([
      "100",
      "••••789K",
    ]);

    outcomes = ["imported", "linked_existing"];
    expect(
      (await getImportBatchDetail(BATCH, { canManage: true })).columns
    ).toEqual([]);
    outcomes = ["pending", "pending"];
    status = "expired";
    expect(
      (await getImportBatchDetail(BATCH, { canManage: true })).columns
    ).toEqual([]);
  });
});
