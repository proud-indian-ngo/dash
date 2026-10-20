import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import {
  complianceItemMutators,
  organisationRegistrationMutators,
  resolutionMutators,
  trusteeOfficeMutators,
  trusteeTermMutators,
} from "../governance";

type Row = Record<string, unknown>;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

function createDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    agendaItem: [],
    complianceItem: [],
    deedVersion: [],
    governanceDocument: [{ id: "doc-1" }],
    organisationRegistration: [],
    resolution: [],
    trustee: [
      { id: "sarjun", isCoFounder: true, legalName: "Sarjun H Hajathulla" },
      { id: "somu", isCoFounder: false, legalName: "Somasundaram Ayyappan" },
    ],
    trusteeOffice: [],
    trusteeTerm: [],
    ...seed,
  };
  const writes: { action: string; row: Row; table: string }[] = [];
  const tableApi = (table: string) => ({
    delete: async (row: Row) => {
      writes.push({ action: "delete", row, table });
      tables[table] = (tables[table] ?? []).filter((r) => r.id !== row.id);
    },
    insert: async (row: Row) => {
      writes.push({ action: "insert", row, table });
      tables[table]?.push(row);
    },
    update: async (row: Row) => {
      writes.push({ action: "update", row, table });
      const current = tables[table]?.find((item) => item.id === row.id);
      if (!current) {
        throw new Error(`Missing ${table} ${String(row.id)}`);
      }
      Object.assign(current, row);
    },
  });
  /** Reads made before each register lock, and before each row lock. */
  const locks: number[] = [];
  const rowLocks: number[] = [];
  let reads = 0;
  // `select().from().where().for("update")[.limit()]`, resolving to one row.
  const select = {
    for: () => {
      rowLocks.push(reads);
      return Object.assign(Promise.resolve([{}]), {
        limit: async () => [{}],
      });
    },
    from: () => select,
    where: () => select,
  };
  const tx = {
    dbTransaction: {
      wrappedTransaction: {
        execute: async () => {
          locks.push(reads);
        },
        select: () => select,
      },
    },
    location: "server",
    mutate: Object.fromEntries(
      Object.keys(tables).map((table) => [table, tableApi(table)])
    ),
    run: async (query: { ast: ScopeAst; format: { singular: boolean } }) => {
      reads += 1;
      const result = (tables[query.ast.table] ?? []).filter((row) =>
        matchesScope(
          row as ScopeRow,
          query.ast.where,
          tables as unknown as ScopeTables
        )
      );
      return query.format.singular ? result[0] : result;
    },
  };
  return { locks, rowLocks, tables, tx, writes };
}

function run(
  mutator: { fn: (input: never) => Promise<unknown> },
  db: ReturnType<typeof createDb>,
  ctx: Row | undefined,
  args: Row
) {
  return mutator.fn({ args, ctx, tx: db.tx } as never);
}

const secretaryCtx = {
  permissions: ["governance.view", "governance.manage"],
  role: "admin",
  userId: "admin-1",
};
const viewerCtx = {
  permissions: ["governance.view"],
  role: "finance_admin",
  userId: "fin-1",
};
const financeCtx = {
  permissions: ["finance.manage"],
  role: "finance_admin",
  userId: "fin-1",
};

function term(overrides: Row = {}): Row {
  return {
    acceptanceDocumentId: null,
    basis: "co_option_4_5",
    cessationBasis: null,
    endEvidenceDocumentId: null,
    endedOn: null,
    endsOn: day("2028-12-06"),
    id: "t-somu",
    startEvidenceDocumentId: "doc-1",
    startsOn: day("2025-12-07"),
    trusteeId: "somu",
    validityNote: null,
    ...overrides,
  };
}

function office(overrides: Row = {}): Row {
  return {
    endEvidenceDocumentId: null,
    endedOn: null,
    id: "o-somu-sec",
    office: "secretary",
    startEvidenceDocumentId: "doc-1",
    startsOn: day("2025-12-07"),
    trusteeId: "somu",
    validityNote: null,
    ...overrides,
  };
}

describe("trustee term mutators", () => {
  it("need governance.manage", async () => {
    const db = createDb();
    await expect(
      run(trusteeTermMutators.create, db, viewerCtx, {
        basis: "deed_original",
        id: "t-1",
        startsOn: "2019-03-16",
        trusteeId: "sarjun",
      })
    ).rejects.toThrow("Unauthorized");
    expect(db.writes).toEqual([]);
  });

  it("store dates as Zero epoch days", async () => {
    const db = createDb();
    await run(trusteeTermMutators.create, db, secretaryCtx, {
      basis: "co_option_4_5",
      endsOn: "2028-12-06",
      id: "t-somu",
      startEvidenceDocumentId: "doc-1",
      startsOn: "2025-12-07",
      trusteeId: "somu",
    });
    expect(db.tables.trusteeTerm?.[0]).toMatchObject({
      endsOn: day("2028-12-06"),
      startsOn: day("2025-12-07"),
    });
  });

  it("refuse overlapping terms for one trustee", async () => {
    const db = createDb({ trusteeTerm: [term()] });
    await expect(
      run(trusteeTermMutators.create, db, secretaryCtx, {
        basis: "reappointment",
        id: "t-2",
        startsOn: "2028-01-01",
        trusteeId: "somu",
      })
    ).rejects.toThrow("two terms on the same days");
    // The register lock comes before the register is read for the check.
    expect(db.locks).toEqual([0]);
  });

  it("refuse evidence that isn't in the vault", async () => {
    const db = createDb();
    await expect(
      run(trusteeTermMutators.create, db, secretaryCtx, {
        basis: "deed_original",
        id: "t-1",
        startEvidenceDocumentId: "missing",
        startsOn: "2019-03-16",
        trusteeId: "sarjun",
      })
    ).rejects.toThrow("isn't in the vault");
  });

  it("ending a term closes the offices still open", async () => {
    const db = createDb({ trusteeOffice: [office()], trusteeTerm: [term()] });
    await run(trusteeTermMutators.end, db, secretaryCtx, {
      cessationBasis: "resignation",
      endEvidenceDocumentId: "doc-1",
      endedOn: "2026-10-16",
      id: "t-somu",
    });
    expect(db.tables.trusteeTerm?.[0]).toMatchObject({
      cessationBasis: "resignation",
      endedOn: day("2026-10-16"),
    });
    expect(db.tables.trusteeOffice?.[0]).toMatchObject({
      endedOn: day("2026-10-16"),
    });
  });

  it("refuse an end on or before the start", async () => {
    const db = createDb({ trusteeTerm: [term()] });
    await expect(
      run(trusteeTermMutators.end, db, secretaryCtx, {
        cessationBasis: "resignation",
        endedOn: "2025-12-07",
        id: "t-somu",
      })
    ).rejects.toThrow("can't cease");
  });

  it("refuse a correction that leaves an office outside the term", async () => {
    const db = createDb({ trusteeOffice: [office()], trusteeTerm: [term()] });
    await expect(
      run(trusteeTermMutators.update, db, secretaryCtx, {
        basis: "co_option_4_5",
        id: "t-somu",
        startsOn: "2026-01-01",
      })
    ).rejects.toThrow("outside their term");
  });

  it("need both a cessation day and a reason", async () => {
    const db = createDb({ trusteeTerm: [term()] });
    await expect(
      run(trusteeTermMutators.update, db, secretaryCtx, {
        basis: "co_option_4_5",
        endedOn: "2026-10-16",
        id: "t-somu",
        startsOn: "2025-12-07",
      })
    ).rejects.toThrow("both the day");
  });
});

describe("trustee office mutators", () => {
  it("refuse a second holder of an office", async () => {
    const db = createDb({
      trusteeOffice: [office()],
      trusteeTerm: [
        term(),
        term({
          basis: "deed_original",
          endsOn: null,
          id: "t-sarjun",
          startsOn: day("2019-03-16"),
          trusteeId: "sarjun",
        }),
      ],
    });
    await expect(
      run(trusteeOfficeMutators.create, db, secretaryCtx, {
        id: "o-2",
        office: "secretary",
        startsOn: "2026-01-01",
        trusteeId: "sarjun",
      })
    ).rejects.toThrow("both hold Secretary");
  });

  it("refuse an office before the holder's term", async () => {
    const db = createDb({ trusteeTerm: [term()] });
    await expect(
      run(trusteeOfficeMutators.create, db, secretaryCtx, {
        id: "o-2",
        office: "treasurer",
        startsOn: "2025-01-01",
        trusteeId: "somu",
      })
    ).rejects.toThrow("outside their term");
  });

  it("let a successor take an office its holder left with their term", async () => {
    const db = createDb({
      trusteeOffice: [office()],
      trusteeTerm: [
        term({
          cessationBasis: "resignation",
          endedOn: day("2026-10-16"),
        }),
        term({
          basis: "deed_original",
          endsOn: null,
          id: "t-sarjun",
          startsOn: day("2019-03-16"),
          trusteeId: "sarjun",
        }),
      ],
    });
    await run(trusteeOfficeMutators.create, db, secretaryCtx, {
      id: "o-2",
      office: "secretary",
      startsOn: "2026-10-16",
      trusteeId: "sarjun",
    });
    expect(db.tables.trusteeOffice).toHaveLength(2);
  });

  it("take the register lock before ending or removing an office", async () => {
    const db = createDb({ trusteeOffice: [office()], trusteeTerm: [term()] });
    await run(trusteeOfficeMutators.end, db, secretaryCtx, {
      endedOn: "2026-10-16",
      id: "o-somu-sec",
    });
    await run(trusteeOfficeMutators.remove, db, secretaryCtx, {
      id: "o-somu-sec",
    });
    // Each lock comes before that mutator's first read (one read each).
    expect(db.locks).toEqual([0, 1]);
    expect(db.tables.trusteeOffice).toHaveLength(0);
  });
});

describe("resolution draft mutators", () => {
  const draft = {
    body: '[{"children":[{"text":"RESOLVED THAT"}],"type":"p"}]',
    effect: { type: "none" },
    id: "r1",
    templateKey: "ordinary",
    title: "Open a bank account",
  };

  it("lock the row before reading it, and refuse an issued one", async () => {
    const db = createDb({
      resolution: [{ ...draft, kind: "circular", status: "issued" }],
    });
    await expect(
      run(resolutionMutators.updateDraft, db, secretaryCtx, {
        ...draft,
        body: '[{"children":[{"text":"RESOLVED THAT something else"}],"type":"p"}]',
      })
    ).rejects.toThrow("Only a draft can change");
    await expect(
      run(resolutionMutators.deleteDraft, db, secretaryCtx, { id: "r1" })
    ).rejects.toThrow("Only a draft can change");
    // Each lock follows only the agenda lookup and precedes the row's read.
    expect(db.rowLocks).toEqual([1, 3]);
    expect(db.writes).toHaveLength(0);
  });

  it("change a draft under the lock", async () => {
    const db = createDb({
      resolution: [{ ...draft, kind: "circular", status: "draft" }],
    });
    await run(resolutionMutators.updateDraft, db, secretaryCtx, {
      ...draft,
      title: "Open a savings account",
    });
    expect(db.rowLocks).toEqual([1]);
    expect(db.tables.resolution?.[0]).toMatchObject({
      title: "Open a savings account",
    });
  });
});

describe("organisation registration mutators", () => {
  it("let governance or finance record a registration", async () => {
    for (const ctx of [secretaryCtx, financeCtx]) {
      const db = createDb();
      await run(organisationRegistrationMutators.create, db, ctx, {
        certificateDocumentId: "doc-1",
        id: "reg-1",
        number: "AABTP1234C",
        type: "pan",
      });
      expect(db.tables.organisationRegistration).toHaveLength(1);
    }
  });

  it("refuse a viewer", async () => {
    const db = createDb();
    await expect(
      run(organisationRegistrationMutators.create, db, viewerCtx, {
        id: "reg-1",
        number: "AABTP1234C",
        type: "pan",
      })
    ).rejects.toThrow("Unauthorized");
  });
});

describe("compliance item mutators", () => {
  function item(overrides: Row = {}): Row {
    return {
      dueOn: day("2026-10-31"),
      id: "itr",
      note: null,
      status: "open",
      title: "ITR-7",
      ...overrides,
    };
  }

  it("close an item only with a document from the vault", async () => {
    const db = createDb({ complianceItem: [item()] });
    await expect(
      run(complianceItemMutators.close, db, secretaryCtx, {
        evidenceDocumentId: "missing",
        id: "itr",
      })
    ).rejects.toThrow("isn't in the vault");
    await run(complianceItemMutators.close, db, secretaryCtx, {
      evidenceDocumentId: "doc-1",
      id: "itr",
    });
    expect(db.tables.complianceItem?.[0]).toMatchObject({
      closedBy: "admin-1",
      evidenceDocumentId: "doc-1",
      status: "done",
    });
    await expect(
      run(complianceItemMutators.close, db, secretaryCtx, {
        evidenceDocumentId: "doc-1",
        id: "itr",
      })
    ).rejects.toThrow("already closed");
  });

  it("lock the item before reading it, so a waiver can't follow a closure", async () => {
    const db = createDb({ complianceItem: [item()] });
    await run(complianceItemMutators.close, db, secretaryCtx, {
      evidenceDocumentId: "doc-1",
      id: "itr",
    });
    await expect(
      run(complianceItemMutators.waive, db, secretaryCtx, {
        id: "itr",
        note: "Filed by the CA directly",
      })
    ).rejects.toThrow("already closed");
    expect(db.rowLocks).toEqual([0, 2]);
    expect(db.tables.complianceItem?.[0]).toMatchObject({
      evidenceDocumentId: "doc-1",
      status: "done",
    });
  });

  it("refuse closing a waived item", async () => {
    const db = createDb({ complianceItem: [item({ status: "waived" })] });
    await expect(
      run(complianceItemMutators.close, db, secretaryCtx, {
        evidenceDocumentId: "doc-1",
        id: "itr",
      })
    ).rejects.toThrow("already been waived");
  });

  it("need governance.manage", async () => {
    const db = createDb({ complianceItem: [item()] });
    await expect(
      run(complianceItemMutators.waive, db, viewerCtx, {
        id: "itr",
        note: "Filed by the CA directly",
      })
    ).rejects.toThrow("Unauthorized");
  });

  it("file a hand-added item under the financial year of its due date", async () => {
    const db = createDb();
    await run(complianceItemMutators.create, db, secretaryCtx, {
      dueOn: "2027-02-15",
      id: "x",
      title: "Renew office lease",
    });
    expect(db.tables.complianceItem?.[0]).toMatchObject({
      fiscalYear: "2026-27",
      sourceKey: null,
      status: "open",
    });
  });
});
