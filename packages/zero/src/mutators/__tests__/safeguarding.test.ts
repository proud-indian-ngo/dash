import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { policyAcknowledgementMutators, policyMutators } from "../policies";
import {
  assertSafeguardingAcknowledged,
  assertSafeToJoinEvent,
} from "../safeguarding";

type Row = Record<string, unknown>;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();

function createDb(
  seed: Partial<Record<string, Row[]>> = {},
  location: "client" | "server" = "server"
) {
  const tables: Record<string, Row[]> = {
    governanceDocument: [
      { id: "doc-policy", kind: "policy" },
      { id: "doc-deed", kind: "trust_deed" },
    ],
    policy: [
      {
        gatesChildren: true,
        id: "safeguarding",
        title: "Child-safeguarding policy",
      },
    ],
    policyAcknowledgement: [],
    policyVersion: [
      {
        effectiveOn: day("2026-01-01"),
        id: "v1",
        policyId: "safeguarding",
        version: 1,
      },
    ],
    team: [
      { id: "children", worksWithChildren: true },
      { id: "adults", worksWithChildren: false },
    ],
    teamEvent: [
      { id: "school-visit", managementDomain: null, teamId: "children" },
      { id: "cleanup", managementDomain: null, teamId: "adults" },
      { id: "kalakriti", managementDomain: "kalakriti", teamId: "adults" },
    ],
    user: [{ id: "ravi", name: "Ravi Kumar" }],
    ...seed,
  };
  const tableApi = (table: string) => ({
    insert: async (row: Row) => {
      tables[table]?.push(row);
    },
    update: async (row: Row) => {
      const current = tables[table]?.find((item) => item.id === row.id);
      if (current) {
        Object.assign(current, row);
      }
    },
  });
  const tx = {
    location,
    mutate: Object.fromEntries(
      Object.keys(tables).map((table) => [table, tableApi(table)])
    ),
    run: async (query: {
      ast: ScopeAst & { orderBy?: [string, "asc" | "desc"][] };
      format: { singular: boolean };
    }) => {
      let result = (tables[query.ast.table] ?? []).filter((row) =>
        matchesScope(
          row as ScopeRow,
          query.ast.where,
          tables as unknown as ScopeTables
        )
      );
      const [order] = query.ast.orderBy ?? [];
      if (order) {
        const [field, direction] = order;
        result = [...result].sort(
          (a, b) =>
            (Number(a[field]) - Number(b[field])) *
            (direction === "desc" ? -1 : 1)
        );
      }
      return query.format.singular ? result[0] : result;
    },
  };
  return { tables, tx };
}

const manager = {
  permissions: ["governance.manage"],
  role: "admin",
  userId: "admin",
};

function run(
  mutator: { fn: (input: never) => Promise<unknown> },
  db: ReturnType<typeof createDb>,
  ctx: Row,
  args: Row
) {
  return mutator.fn({ args, ctx, tx: db.tx } as never);
}

describe("the safeguarding gate", () => {
  it("keeps someone who hasn't acknowledged out of an event with children", async () => {
    const db = createDb();
    await expect(
      assertSafeToJoinEvent(db.tx as never, "school-visit", ["ravi"], {
        self: true,
      })
    ).rejects.toThrow("child-safeguarding policy");
    await expect(
      assertSafeToJoinEvent(db.tx as never, "kalakriti", ["ravi"], {
        self: false,
      })
    ).rejects.toThrow("Ravi Kumar hasn't acknowledged");
  });

  it("lets them in once acknowledged, and never gates other events", async () => {
    const db = createDb({
      policyAcknowledgement: [
        { id: "a1", policyVersionId: "v1", userId: "ravi" },
      ],
    });
    await assertSafeToJoinEvent(db.tx as never, "school-visit", ["ravi"], {
      self: true,
    });
    const fresh = createDb();
    await assertSafeToJoinEvent(fresh.tx as never, "cleanup", ["ravi"], {
      self: true,
    });
  });

  it("doesn't gate before a version is in force, or on the client", async () => {
    const db = createDb({
      policyVersion: [
        {
          effectiveOn: day("2099-01-01"),
          id: "v9",
          policyId: "safeguarding",
          version: 1,
        },
      ],
    });
    await assertSafeguardingAcknowledged(db.tx as never, ["ravi"], {
      self: true,
    });
    const client = createDb({}, "client");
    await assertSafeToJoinEvent(client.tx as never, "school-visit", ["ravi"], {
      self: true,
    });
  });

  it("asks for the new version once it's in force", async () => {
    const db = createDb({
      policyAcknowledgement: [
        { id: "a1", policyVersionId: "v1", userId: "ravi" },
      ],
      policyVersion: [
        {
          effectiveOn: day("2026-01-01"),
          id: "v1",
          policyId: "safeguarding",
          version: 1,
        },
        {
          effectiveOn: day("2026-02-01"),
          id: "v2",
          policyId: "safeguarding",
          version: 2,
        },
      ],
    });
    await expect(
      assertSafeguardingAcknowledged(db.tx as never, ["ravi"], { self: true })
    ).rejects.toThrow();
  });
});

describe("policy mutators", () => {
  it("publishes versions from a policy document, each after the last", async () => {
    const db = createDb();
    await expect(
      run(policyMutators.publishVersion, db, manager, {
        documentId: "doc-deed",
        effectiveOn: "2026-06-01",
        id: "v2",
        policyId: "safeguarding",
        summary: null,
      })
    ).rejects.toThrow("filed as a policy");
    await expect(
      run(policyMutators.publishVersion, db, manager, {
        documentId: "doc-policy",
        effectiveOn: "2025-12-01",
        id: "v2",
        policyId: "safeguarding",
        summary: null,
      })
    ).rejects.toThrow("after the one before it");
    await run(policyMutators.publishVersion, db, manager, {
      documentId: "doc-policy",
      effectiveOn: "2026-06-01",
      id: "v2",
      policyId: "safeguarding",
      summary: "Adds photo consent",
    });
    expect(db.tables.policyVersion?.find((v) => v.id === "v2")).toMatchObject({
      version: 2,
    });
    await expect(
      run(
        policyMutators.publishVersion,
        db,
        { permissions: [], role: "volunteer", userId: "ravi" },
        {
          documentId: "doc-policy",
          effectiveOn: "2026-07-01",
          id: "v3",
          policyId: "safeguarding",
          summary: null,
        }
      )
    ).rejects.toThrow();
  });

  it("records an acknowledgement once", async () => {
    const db = createDb();
    const volunteer = { permissions: [], role: "volunteer", userId: "ravi" };
    await run(policyAcknowledgementMutators.acknowledge, db, volunteer, {
      id: "a1",
      policyVersionId: "v1",
    });
    await run(policyAcknowledgementMutators.acknowledge, db, volunteer, {
      id: "a2",
      policyVersionId: "v1",
    });
    expect(db.tables.policyAcknowledgement).toHaveLength(1);
  });
});
