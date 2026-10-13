import { beforeEach, describe, expect, it, mock } from "bun:test";

import { GIVE_INDIA_PARTY_ID } from "@pi-dash/shared/constants";

const PAN = "ABCDE1234F";
const OTHER_PAN = "PQRST6789K";
const BATCH = "0190a000-0000-7000-8000-000000000001";

let status = "completed";
let outcomes: string[] = [];
let contributionIds: (string | null)[] = [];
/** A mapping for a test's own file; null uses the source's default. */
let mapping: Record<string, string> | null = null;
let insertBatch: () => Promise<void> = async () => undefined;
const logged: unknown[] = [];
let source = "generic_csv";
let rows: () => Record<string, string>[];

const GENERIC_MAPPING = {
  Amount: "amount",
  Date: "receivedOn",
  Name: "donorName",
  "Tax ID": "idNumber",
};
const GIVE_DO_MAPPING = {
  Date: "receivedOn",
  "Donation Amount": "amount",
  "Donation Currency": "currency",
  "Donor Email": "email",
  "Donor Name": "donorName",
  "Donor PAN": "idNumber",
  "Transaction ID": "externalId",
};

const batchRow = () => ({
  dateFormat: "dmy",
  defaultChannel: source === "give_do_csv" ? "give_do" : "upi",
  fileName: "gifts.csv",
  fundId: "0190a000-0000-7000-8000-0000000000bb",
  id: BATCH,
  mapping:
    mapping ?? (source === "give_do_csv" ? GIVE_DO_MAPPING : GENERIC_MAPPING),
  newDonorCount: 0,
  orgAccountId: "0190a000-0000-7000-8000-0000000000aa",
  projectId: null,
  rowCount: rows().length,
  source,
  status,
});

/** What a run wrote, recorded by the mocked queries. */
let calls: {
  contributions: Record<string, unknown>[];
  ensured: number;
  events: Record<string, unknown>[];
  fills: string[];
  saves: number;
};
let emailMatches = new Map<string, { name: string; partyId: string }[]>();

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

rows = rawRows;

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
  awaitingOutcomeRetention: () => ({}),
  importedRowRetention: () => ({}),
  uploadedRowRetention: () => ({}),
}));
mock.module("@pi-dash/db/queries/party-private", () => ({
  fillMissingPartyDetails: async (_tx: unknown, partyId: string) => {
    calls.fills.push(partyId);
    return ["idNumber"];
  },
  fillValuesPresent: (values: { email: string; idNumber: string }) => ({
    address: false,
    email: values.email !== "",
    idNumber: values.idNumber !== "",
    phone: false,
  }),
  savePartyInTransaction: async (_tx: unknown, input: { id: string }) => {
    calls.saves += 1;
    return { partyId: input.id };
  },
}));
mock.module("@pi-dash/db/queries/income-import", () => ({
  claimImportBatch: async () => batchRow(),
  countImportBatchRows: noop,
  countImportOutcomes: async () => ({
    conflict: 0,
    error: 0,
    imported: 0,
    linked_existing: 0,
    pending: 0,
    skipped: 0,
  }),
  ensureGiveIndiaParty: async () => {
    calls.ensured += 1;
    return GIVE_INDIA_PARTY_ID;
  },
  findBatchByFileHash: noop,
  findContributorsByContact: async () => ({
    byEmail: emailMatches,
    byPhone: new Map(),
  }),
  findContributorsByIdentifier: async () => new Map(),
  findDuplicateCandidates: async () => [],
  findExternalIdentities: async () => [],
  findPartyDetailGaps: async (ids: string[]) =>
    new Map(
      ids.map((id) => [
        id,
        { address: true, email: false, idNumber: true, phone: true },
      ])
    ),
  getImportBatch: async () => batchRow(),
  insertImportBatch: async () => await insertBatch(),
  insertImportedContribution: async (
    _tx: unknown,
    values: Record<string, unknown>
  ) => {
    calls.contributions.push(values);
  },
  latestImportMapping: noop,
  listImportRows: async () =>
    rows().map((raw, index) => ({
      contributionId: contributionIds[index] ?? null,
      id: `0190a000-0000-7000-8000-00000000010${index}`,
      outcome: outcomes[index] ?? "pending",
      outcomeReason: null,
      parseIssue: null,
      raw,
      rowNumber: index + 1,
    })),
  recordImportCollectionEvent: async (
    _tx: unknown,
    values: Record<string, unknown>
  ) => {
    calls.events.push(values);
    return true;
  },
  resolveImportSettings: async () => ({ programmeId: null }),
  setImportRowOutcome: noop,
  setImportRowsRetention: noop,
  startDecidedRowsRetention: noop,
  updateImportBatch: noop,
  withImportTransaction: async (run: (tx: unknown) => Promise<unknown>) =>
    await run({}),
}));

const { DrizzleQueryError } = await import("drizzle-orm/errors");
const {
  countChosenFills,
  createImportBatch,
  GIVE_DO_COLLECTION_NOTE,
  getImportBatchDetail,
  IMPORT_SAVE_FAILED_MESSAGE,
  ImportInputError,
  runImportBatch,
} = await import("./server");
const { parseCsv } = await import("./parse-csv");
const { reviewSummaryLine, summarizeReview } = await import("./review-summary");

beforeEach(() => {
  source = "generic_csv";
  rows = rawRows;
  mapping = null;
  contributionIds = [];
  emailMatches = new Map();
  calls = { contributions: [], ensured: 0, events: [], fills: [], saves: 0 };
});

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

const ROW_ID = (index: number) => `0190a000-0000-7000-8000-00000000010${index}`;

const giveDoRow = (overrides: Record<string, string>) => ({
  Date: "04/06/2024",
  "Donation Amount": "1500",
  "Donation Currency": "INR",
  "Donor Email": "",
  "Donor Name": "Repeat Donor",
  "Donor PAN": PAN,
  "Transaction ID": "LC0000000000001",
  ...overrides,
});

describe("runImportBatch for give.do", () => {
  beforeEach(() => {
    status = "reviewed";
    outcomes = [];
    source = "give_do_csv";
  });

  it("records GiveIndia once as the intermediary of every row, with give.do's collection note", async () => {
    rows = () => [
      giveDoRow({ "Transaction ID": "LC1" }),
      // The same PAN again: the same new donor, not a second one.
      giveDoRow({ "Donation Amount": "700", "Transaction ID": "LC2" }),
      giveDoRow({
        "Donation Currency": "USD",
        "Donor Name": "Abroad",
        "Donor PAN": "",
        "Transaction ID": "LC3",
      }),
    ];
    const result = await runImportBatch(
      { batchId: BATCH, decisions: {} },
      "user-1"
    );
    expect(calls.ensured).toBe(1);
    expect(calls.saves).toBe(1);
    expect(result).toMatchObject({ errors: 1, imported: 2, newDonors: 1 });
    expect(calls.contributions).toHaveLength(2);
    for (const contribution of calls.contributions) {
      expect(contribution).toMatchObject({
        channel: "give_do",
        donationType: "voluntary",
        intermediaryPartyId: GIVE_INDIA_PARTY_ID,
        reportingMode: "electronic_or_account_payee",
        source: "import",
        status: "received",
      });
    }
    expect(calls.events[0]).toMatchObject({
      channel: "give_do_csv",
      evidenceNote: GIVE_DO_COLLECTION_NOTE,
      noticeVersion: null,
      processingBasis: "voluntary_provision_7a",
      purpose: "donation receipt and statutory filing",
    });
  });

  it("fills an accepted email match's missing details unless turned off", async () => {
    emailMatches = new Map([
      ["known@example.com", [{ name: "Known", partyId: "p-known" }]],
    ]);
    rows = () => [
      giveDoRow({
        "Donor Email": "known@example.com",
        "Transaction ID": "LC1",
      }),
    ];
    const detail = await getImportBatchDetail(BATCH, { canManage: true });
    expect(detail.review?.rows[0]?.donorOptions[0]).toMatchObject({
      fills: ["idNumber"],
      value: "party:p-known",
    });

    const result = await runImportBatch(
      {
        batchId: BATCH,
        decisions: { [ROW_ID(0)]: { donor: "party:p-known" } },
      },
      "user-1"
    );
    expect(calls.fills).toEqual(["p-known"]);
    expect(result).toMatchObject({
      filledDonors: 1,
      imported: 1,
      newDonors: 0,
    });

    calls.fills = [];
    await runImportBatch(
      {
        batchId: BATCH,
        decisions: {
          [ROW_ID(0)]: { donor: "party:p-known", fillMissing: false },
        },
      },
      "user-1"
    );
    expect(calls.fills).toEqual([]);
  });

  it("counts only the fills the run would make, whatever the request claims", async () => {
    emailMatches = new Map([
      ["known@example.com", [{ name: "Known", partyId: "p-known" }]],
    ]);
    rows = () => [
      giveDoRow({
        "Donor Email": "known@example.com",
        "Transaction ID": "LC1",
      }),
      giveDoRow({
        "Donor Email": "known@example.com",
        "Transaction ID": "LC2",
      }),
      giveDoRow({ "Transaction ID": "LC3" }),
    ];
    const count = (decisions: Record<string, object>) =>
      countChosenFills({ batchId: BATCH, decisions });
    expect(
      await count({
        [ROW_ID(0)]: { donor: "party:p-known" },
        // Skipped: imports nothing, so fills nothing.
        [ROW_ID(1)]: { contribution: "skip", donor: "party:p-known" },
        // A party nobody proposed for this row.
        [ROW_ID(2)]: { donor: "party:p-other" },
        // Not a row of this batch.
        "0190a000-0000-7000-8000-000000000999": { donor: "party:p-known" },
      })
    ).toBe(1);
    expect(
      await count({
        [ROW_ID(0)]: { donor: "party:p-known", fillMissing: false },
      })
    ).toBe(0);
    expect(await count({ [ROW_ID(0)]: { donor: "new" } })).toBe(0);
  });

  it("leaves generic batches without an intermediary", async () => {
    source = "generic_csv";
    status = "reviewed";
    outcomes = [];
    rows = () => [
      {
        Amount: "100",
        Date: "01/10/2026",
        Name: "Asha",
        Note: "",
        "Tax ID": "",
      },
    ];
    await runImportBatch({ batchId: BATCH, decisions: {} }, "user-1");
    expect(calls.ensured).toBe(0);
    expect(calls.contributions[0]).toMatchObject({ intermediaryPartyId: null });
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
    rows = () => parseCsv(csv).rows;
  });

  it("shows the repeat as repeated in file and counts each donor once", async () => {
    const review =
      (await getImportBatchDetail(BATCH, { canManage: true })).review?.rows ??
      [];
    expect(review.map((r) => r.category)).toEqual([
      "new_donor",
      "new_donor",
      "new_donor",
      "error",
      "repeated_in_file",
    ]);
    expect(
      review.map(
        (r) => r.donor.kind === "new" && r.donor.createdOnRow?.rowNumber
      )
    ).toEqual([undefined, 1, undefined, false, false]);
    expect(review[4]?.repeatOf).toEqual({ rowNumber: 1 });
    const summary = summarizeReview(review, {});
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
    const review =
      (await getImportBatchDetail(BATCH, { canManage: true })).review?.rows ??
      [];
    expect(review.map((r) => r.repeatOf?.rowNumber ?? null)).toEqual([
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
