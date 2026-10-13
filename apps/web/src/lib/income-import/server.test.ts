import { beforeEach, describe, expect, it, mock } from "bun:test";

const PAN = "ABCDE1234F";
const OTHER_PAN = "PQRST6789K";
const BATCH = "0190a000-0000-7000-8000-000000000001";

let status = "completed";
let outcomes: string[] = [];
let contributionIds: (string | null)[] = [];
let insertBatch: () => Promise<void> = async () => undefined;
const logged: unknown[] = [];

const defaultMapping = {
  Amount: "amount",
  Date: "receivedOn",
  Name: "donorName",
  "Tax ID": "idNumber",
};
let mapping: Record<string, string> = defaultMapping;

const batchRow = () => ({
  dateFormat: "dmy",
  defaultChannel: "upi",
  fileName: "gifts.csv",
  id: BATCH,
  mapping,
  orgAccountId: "0190a000-0000-7000-8000-0000000000aa",
  rowCount: rawRows().length,
  source: "generic_csv",
  status,
});

const defaultRows = () => [
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
let rawRows: () => Record<string, string>[] = defaultRows;

const noop = async () => undefined;

mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: () => undefined,
    error: (value: unknown) => logged.push({ error: value }),
    set: (fields: Record<string, unknown>) => logged.push(fields),
    warn: (value: unknown) => logged.push({ warn: value }),
  }),
}));

mock.module("@pi-dash/db/import-retention", () => ({
  importedRowRetention: () => ({}),
  uploadedRowRetention: () => ({}),
}));
mock.module("@pi-dash/db/queries/party-private", () => ({
  savePartyInTransaction: noop,
}));
mock.module("@pi-dash/db/queries/income-import", () => ({
  claimImportBatch: noop,
  countImportBatchRows: noop,
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
  insertImportBatch: async () => await insertBatch(),
  insertImportedContribution: noop,
  latestImportMapping: noop,
  listImportRows: async () =>
    rawRows().map((raw, index) => ({
      contributionId: contributionIds[index] ?? null,
      id: `0190a000-0000-7000-8000-00000000010${index}`,
      outcome: outcomes[index] ?? "pending",
      outcomeReason: null,
      parseIssue: null,
      raw,
      rowNumber: index + 1,
    })),
  recordImportCollectionEvent: noop,
  resolveImportSettings: async () => ({ programmeId: null }),
  setImportRowOutcome: noop,
  setImportRowsRetention: noop,
  updateImportBatch: noop,
  withImportTransaction: noop,
}));

const { DrizzleQueryError } = await import("drizzle-orm/errors");
const {
  createImportBatch,
  getImportBatchDetail,
  IMPORT_SAVE_FAILED_MESSAGE,
  ImportInputError,
} = await import("./server");
const { parseCsv } = await import("./parse-csv");
const { reviewSummaryLine, summarizeReview } = await import("./review-summary");

describe("createImportBatch errors", () => {
  const csv = `Name,Amount,PAN\nAsha,100,${PAN}\n`;
  const input = {
    csv,
    defaultChannel: "upi" as const,
    fileName: "gifts.csv",
    fundId: "0190a000-0000-7000-8000-0000000000f1",
    orgAccountId: "0190a000-0000-7000-8000-0000000000aa",
    programmeId: null,
    projectId: null,
    source: "generic_csv" as const,
  };

  beforeEach(() => {
    logged.length = 0;
  });

  it("replaces a query error quoting row cells with a generic one, and logs codes only", async () => {
    const driverError = Object.assign(
      new Error(`invalid input syntax: "${PAN}"`),
      {
        code: "ERR_POSTGRES_SERVER_ERROR",
        constraint: "import_row_batch_id_fkey",
        detail: `Key (raw)=(${PAN}) is bad`,
        errno: "22P05",
        name: "PostgresError",
        table: "import_row",
      }
    );
    const queryError = new DrizzleQueryError(
      "insert into private.import_row (raw) values ($1, $2)",
      ["Asha", PAN],
      driverError
    );
    expect(queryError.message).toContain(PAN);
    insertBatch = async () => {
      throw queryError;
    };
    const error = await createImportBatch(input, parseCsv(csv), "user-1").then(
      () => null,
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(IMPORT_SAVE_FAILED_MESSAGE);
    expect((error as Error).cause).toBeUndefined();
    expect(String((error as Error).stack)).not.toContain(PAN);

    const payload = JSON.stringify(logged, (_key, value) =>
      value instanceof Error
        ? { message: value.message, stack: value.stack }
        : value
    );
    expect(payload).not.toContain(PAN);
    expect(payload).not.toContain("params");
    expect(payload).not.toContain("Failed query");
    expect(logged).toContainEqual(
      expect.objectContaining({
        constraint: "import_row_batch_id_fkey",
        event: "import_step_failed",
        sqlState: "22P05",
        step: "create",
        table: "import_row",
      })
    );
  });

  it("lets errors written for the user through unchanged", async () => {
    insertBatch = async () => {
      throw new ImportInputError("Choose an active fund");
    };
    await expect(
      createImportBatch(input, parseCsv(csv), "user-1")
    ).rejects.toThrow("Choose an active fund");
    expect(logged).toEqual([]);
  });
});

describe("getImportBatchDetail", () => {
  beforeEach(() => {
    status = "completed";
    outcomes = ["imported", "error"];
    contributionIds = [];
    mapping = defaultMapping;
    rawRows = defaultRows;
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

describe("review of a file that repeats a row", () => {
  // The founder's test file: TEST-001 appears twice, Alpha gives twice
  // under one PAN, and TEST-004 has no usable amount.
  const csv = [
    "Donation ID,Donor Name,PAN,Email,Phone,Amount,Date,Reference",
    'TEST-001,Test Donor Alpha,ABCPA1234F,alpha.test@example.com,+919800000001,"1,250.00",01/10/2026,UTR0001',
    "TEST-002,Test Donor Alpha,ABCPA1234F,alpha.test@example.com,+919800000001,500,05/10/2026,UTR0002",
    "TEST-003,Test Donor Beta,,beta.test@example.com,,2000,07/10/2026,UTR0003",
    "TEST-004,Test Donor Broken,,,,abc,08/10/2026,UTR0004",
    'TEST-001,Test Donor Alpha,ABCPA1234F,alpha.test@example.com,+919800000001,"1,250.00",01/10/2026,UTR0001',
  ].join("\n");

  beforeEach(() => {
    status = "draft";
    outcomes = [];
    contributionIds = [];
    mapping = {
      Amount: "amount",
      Date: "receivedOn",
      "Donation ID": "externalId",
      "Donor Name": "donorName",
      Email: "email",
      PAN: "idNumber",
      Phone: "phone",
      Reference: "reference",
    };
    rawRows = () => parseCsv(csv).rows;
  });

  it("shows the repeat as repeated in file and counts each donor once", async () => {
    const rows =
      (await getImportBatchDetail(BATCH, { canManage: true })).review?.rows ??
      [];
    expect(rows.map((r) => r.category)).toEqual([
      "new_donor",
      "new_donor",
      "new_donor",
      "error",
      "repeated_in_file",
    ]);
    expect(
      rows.map((r) => r.donor.kind === "new" && r.donor.createdOnRow?.rowNumber)
    ).toEqual([undefined, 1, undefined, false, false]);
    expect(rows[4]?.repeatOf).toEqual({ rowNumber: 1 });
    const summary = summarizeReview(rows, {});
    expect(summary).toMatchObject({
      errors: 1,
      imports: 3,
      links: 0,
      newDonors: 2,
      repeats: 1,
    });
    expect(reviewSummaryLine(summary)).toBe(
      "3 gifts to import · 2 new donors · 1 repeated in file · 1 error"
    );
  });

  it("still knows the repeat after the import linked it", async () => {
    outcomes = ["imported", "imported", "imported", "error", "linked_existing"];
    contributionIds = ["c-1", "c-2", "c-3", null, "c-1"];
    const rows =
      (await getImportBatchDetail(BATCH, { canManage: true })).review?.rows ??
      [];
    expect(rows.map((r) => r.repeatOf?.rowNumber ?? null)).toEqual([
      null,
      null,
      null,
      null,
      1,
    ]);
    // Linked to a contribution from another upload: already imported.
    contributionIds = ["c-1", "c-2", "c-3", null, "c-9"];
    const again =
      (await getImportBatchDetail(BATCH, { canManage: true })).review?.rows ??
      [];
    expect(again[4]?.repeatOf).toBeNull();
  });
});
