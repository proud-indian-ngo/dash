import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { resolveExpenseCharge } from "../expense-charge";
import { reimbursementMutators } from "../reimbursement";
import { teamMutators } from "../team";
import { vendorPaymentMutators } from "../vendor-payment";

type Row = Record<string, unknown>;

const UNALLOCATED = "01930000-0000-7000-8000-000000000009";

function createDb(
  seed: Partial<Record<string, Row[]>> = {},
  location: "client" | "server" = "server"
) {
  const tables: Record<string, Row[]> = {
    programme: [
      { active: true, id: "edu", name: "Education" },
      { active: true, id: "arts", name: "Arts and culture" },
      { active: false, id: "old", name: "Old" },
      { active: true, id: UNALLOCATED, name: "Unallocated" },
    ],
    project: [
      {
        id: "class",
        name: "Maths class",
        programmeId: "edu",
        status: "active",
      },
      { id: "done", programmeId: "edu", status: "closed" },
      { id: "k3", programmeId: "arts", status: "active" },
    ],
    reimbursement: [],
    reimbursementAttachment: [],
    reimbursementHistory: [],
    reimbursementLineItem: [],
    teamEvent: [{ id: "ev-1", name: "Beach clean-up" }],
    user: [],
    vendor: [],
    vendorPayment: [],
    vendorPaymentHistory: [],
    ...seed,
  };
  const tableApi = (table: string) => ({
    delete: async (row: Row) => {
      tables[table] = (tables[table] ?? []).filter(
        (item) => item.id !== row.id
      );
    },
    insert: async (row: Row) => {
      tables[table] ??= [];
      tables[table].push(row);
    },
    update: async (row: Row) => {
      const current = tables[table]?.find((item) => item.id === row.id);
      if (!current) {
        throw new Error(`Missing ${table} ${String(row.id)}`);
      }
      Object.assign(current, row);
    },
  });
  const tx = {
    // The row lock `update` takes on the server reads the seeded request.
    dbTransaction: {
      wrappedTransaction: {
        // The bank-match check takes the statement-line lock first.
        execute: async () => [],
        select: () => ({
          from: () => ({
            where: () => ({
              for: async () =>
                (tables.reimbursement ?? []).slice(0, 1).map((row) => ({
                  status: row.status,
                  voidedAt: null,
                })),
            }),
          }),
        }),
      },
    },
    location,
    mutate: new Proxy(
      {},
      { get: (_target, table: string) => tableApi(table) }
    ) as Record<string, ReturnType<typeof tableApi>>,
    run: async (query: { ast: ScopeAst; format: { singular: boolean } }) => {
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
  return { tables, tx };
}

function run(
  mutator: { fn: (input: never) => Promise<unknown> },
  db: ReturnType<typeof createDb>,
  ctx: Row | undefined,
  args: Row
) {
  return mutator.fn({ args, ctx, tx: db.tx } as never);
}

const claimantCtx = {
  permissions: ["requests.create", "requests.edit_own", "requests.view_own"],
  role: "volunteer",
  userId: "claimant",
};
const approverCtx = {
  permissions: ["requests.approve", "requests.view_all"],
  role: "admin",
  userId: "approver",
};
const financeCtx = {
  permissions: ["finance.manage"],
  role: "finance_admin",
  userId: "finance",
};

function reimbursementRow(overrides: Row = {}): Row {
  return {
    chargedProgrammeId: UNALLOCATED,
    chargedProjectId: null,
    chargedTo: "programme",
    eventId: null,
    id: "r-1",
    status: "pending",
    title: "Centre rent",
    userId: "claimant",
    ...overrides,
  };
}

const updateArgs = {
  attachments: [],
  chargedProgrammeId: "edu",
  chargedTo: "programme",
  expenseDate: Date.parse("2026-09-01"),
  id: "r-1",
  lineItems: [],
  title: "Centre rent",
};

describe("resolveExpenseCharge", () => {
  it("accepts a project under the chosen programme", async () => {
    const { tx } = createDb();
    expect(
      await resolveExpenseCharge(tx as never, {
        chargedProgrammeId: "edu",
        chargedProjectId: "class",
        chargedTo: "programme",
      })
    ).toEqual({
      chargedProgrammeId: "edu",
      chargedProjectId: "class",
      chargedTo: "programme",
      eventId: null,
    });
  });

  it("refuses a project that belongs to another programme", async () => {
    const { tx } = createDb();
    await expect(
      resolveExpenseCharge(tx as never, {
        chargedProgrammeId: "edu",
        chargedProjectId: "k3",
        chargedTo: "programme",
      })
    ).rejects.toThrow("The project belongs to a different programme");
  });

  it("refuses a closed project or inactive programme unless already set", async () => {
    const { tx } = createDb();
    await expect(
      resolveExpenseCharge(tx as never, {
        chargedProgrammeId: "edu",
        chargedProjectId: "done",
        chargedTo: "programme",
      })
    ).rejects.toThrow("Choose a project that is not closed");
    await expect(
      resolveExpenseCharge(tx as never, {
        chargedProgrammeId: "old",
        chargedTo: "programme",
      })
    ).rejects.toThrow("Choose an active programme");
    const kept = {
      chargedProgrammeId: "edu",
      chargedProjectId: "done",
      chargedTo: "programme" as const,
    };
    expect(
      (await resolveExpenseCharge(tx as never, kept, kept)).chargedProjectId
    ).toBe("done");
  });

  it("refuses the Unallocated holder as a new pick but keeps a legacy one", async () => {
    const { tx } = createDb();
    const unallocated = {
      chargedProgrammeId: UNALLOCATED,
      chargedTo: "programme" as const,
    };
    await expect(
      resolveExpenseCharge(tx as never, unallocated)
    ).rejects.toThrow("Choose a real programme, not the Unallocated holder");
    expect(
      (await resolveExpenseCharge(tx as never, unallocated, unallocated))
        .chargedProgrammeId
    ).toBe(UNALLOCATED);
  });

  it("requires the target the choice names", async () => {
    const { tx } = createDb();
    await expect(
      resolveExpenseCharge(tx as never, { chargedTo: "event" })
    ).rejects.toThrow("Choose the event this was spent on");
    await expect(
      resolveExpenseCharge(tx as never, { chargedTo: "programme" })
    ).rejects.toThrow("Choose the programme this was spent on");
  });

  it("tolerates rows that have not synced to the client", async () => {
    const { tx } = createDb({ programme: [], project: [] }, "client");
    const charge = await resolveExpenseCharge(tx as never, {
      chargedProgrammeId: "edu",
      chargedProjectId: "class",
      chargedTo: "programme",
    });
    expect(charge.chargedProjectId).toBe("class");
    const server = createDb({ programme: [], project: [] });
    await expect(
      resolveExpenseCharge(server.tx as never, {
        chargedProgrammeId: "edu",
        chargedTo: "programme",
      })
    ).rejects.toThrow("Programme not found");
  });

  it("keeps an older client's edit from wiping a programme or admin charge", async () => {
    const { tx } = createDb();
    const previous = {
      chargedProgrammeId: "edu",
      chargedProjectId: null,
      chargedTo: "programme" as const,
      eventId: null,
    };
    expect(await resolveExpenseCharge(tx as never, {}, previous)).toEqual(
      previous
    );
  });
});

describe("changing what a request is charged to", () => {
  it("lets the claimant change it by editing while pending", async () => {
    const db = createDb({ reimbursement: [reimbursementRow()] });
    await run(reimbursementMutators.update, db, claimantCtx, updateArgs);
    expect(db.tables.reimbursement?.[0]).toMatchObject({
      chargedProgrammeId: "edu",
      chargedTo: "programme",
    });
  });

  it("stops the claimant once the request is approved", async () => {
    const db = createDb({
      reimbursement: [reimbursementRow({ status: "approved" })],
    });
    await expect(
      run(reimbursementMutators.update, db, claimantCtx, updateArgs)
    ).rejects.toThrow("Only pending reimbursements can be updated");
    await expect(
      run(reimbursementMutators.setChargedTo, db, claimantCtx, {
        chargedTo: "organisation",
        id: "r-1",
      })
    ).rejects.toThrow("Unauthorized");
  });

  it("lets the approver change it after approval and records it", async () => {
    const db = createDb({
      reimbursement: [reimbursementRow({ status: "approved" })],
    });
    await run(reimbursementMutators.setChargedTo, db, approverCtx, {
      chargedProgrammeId: "edu",
      chargedProjectId: "class",
      chargedTo: "programme",
      id: "r-1",
    });
    expect(db.tables.reimbursement?.[0]).toMatchObject({
      chargedProgrammeId: "edu",
      chargedProjectId: "class",
      chargedTo: "programme",
      eventId: null,
    });
    expect(db.tables.reimbursementHistory?.[0]).toMatchObject({
      action: "updated",
      actorId: "approver",
      note: "Charged to: Programme · Unallocated → Programme · Education / Maths class",
    });
  });

  it("refuses a rejected request", async () => {
    const db = createDb({
      reimbursement: [reimbursementRow({ status: "rejected" })],
    });
    await expect(
      run(reimbursementMutators.setChargedTo, db, approverCtx, {
        chargedTo: "organisation",
        id: "r-1",
      })
    ).rejects.toThrow("A rejected request can't be charged to something else");
  });

  it("refuses an approver re-charging their own request", async () => {
    const db = createDb({
      reimbursement: [reimbursementRow({ userId: "approver" })],
    });
    await expect(
      run(reimbursementMutators.setChargedTo, db, approverCtx, {
        chargedTo: "organisation",
        id: "r-1",
      })
    ).rejects.toThrow("You can't change what your own request is charged to");
  });

  it("refuses an approver who can't see everyone's requests", async () => {
    const db = createDb({ reimbursement: [reimbursementRow()] });
    await expect(
      run(
        reimbursementMutators.setChargedTo,
        db,
        {
          permissions: ["requests.approve"],
          role: "admin",
          userId: "approver",
        },
        { chargedTo: "organisation", id: "r-1" }
      )
    ).rejects.toThrow("Unauthorized");
  });

  it("refuses a request posted to the books, but not one whose posting was reversed", async () => {
    const posted = createDb({
      posting: [
        {
          id: "p-1",
          reversesPostingId: null,
          sourceId: "r-1",
          sourceType: "reimbursement",
        },
      ],
      reimbursement: [reimbursementRow({ status: "approved" })],
    });
    await expect(
      run(reimbursementMutators.setChargedTo, posted, approverCtx, {
        chargedTo: "organisation",
        id: "r-1",
      })
    ).rejects.toThrow(
      "This request is in the books, so what it is charged to can't be changed"
    );

    const reversed = createDb({
      posting: [
        {
          id: "p-1",
          reversesPostingId: null,
          sourceId: "r-1",
          sourceType: "reimbursement",
        },
        {
          id: "p-2",
          reversesPostingId: "p-1",
          sourceId: "r-1",
          sourceType: "reimbursement",
        },
      ],
      reimbursement: [reimbursementRow({ status: "approved" })],
    });
    await run(reimbursementMutators.setChargedTo, reversed, approverCtx, {
      chargedTo: "organisation",
      id: "r-1",
    });
    expect(reversed.tables.reimbursement?.[0]).toMatchObject({
      chargedTo: "organisation",
    });
  });

  it("refuses re-charging a vendor payment whose expense is posted", async () => {
    const db = createDb({
      posting: [
        {
          id: "p-1",
          reversesPostingId: null,
          sourceId: "vp-1",
          sourceType: "vendor_payment",
        },
      ],
      vendorPayment: [
        {
          chargedProgrammeId: null,
          chargedProjectId: null,
          chargedTo: "event",
          eventId: "ev-1",
          id: "vp-1",
          status: "completed",
          userId: "claimant",
        },
      ],
    });
    await expect(
      run(vendorPaymentMutators.setChargedTo, db, financeCtx, {
        chargedTo: "organisation",
        id: "vp-1",
      })
    ).rejects.toThrow("This request is in the books");
  });

  it("lets finance.manage charge a vendor payment to admin", async () => {
    const db = createDb({
      vendorPayment: [
        {
          chargedProgrammeId: null,
          chargedProjectId: null,
          chargedTo: "event",
          eventId: "ev-1",
          id: "vp-1",
          status: "paid",
          userId: "claimant",
        },
      ],
    });
    await run(vendorPaymentMutators.setChargedTo, db, financeCtx, {
      chargedTo: "organisation",
      id: "vp-1",
    });
    expect(db.tables.vendorPayment?.[0]).toMatchObject({
      chargedProgrammeId: null,
      chargedTo: "organisation",
      eventId: null,
    });
    expect(db.tables.vendorPaymentHistory?.[0]?.note).toBe(
      "Charged to: Event · Beach clean-up → Organisation (admin)"
    );
  });
});

describe("team.delete and the books", () => {
  const adminCtx = {
    permissions: ["teams.delete"],
    role: "admin",
    userId: "admin",
  };

  it("refuses a team whose events the books hold expenses for", async () => {
    const db = createDb({
      ledgerEntry: [{ eventId: "ev-1", id: "e-1" }],
      team: [{ id: "t-1", members: [], name: "Teaching" }],
      teamEvent: [{ id: "ev-1", name: "Beach clean-up", teamId: "t-1" }],
      teamMember: [],
    });
    await expect(
      run(teamMutators.delete, db, adminCtx, { id: "t-1" })
    ).rejects.toThrow(
      "The books hold expenses for this team's events, so the team can't be deleted."
    );
    expect(db.tables.team).toHaveLength(1);
  });

  it("deletes a team whose events the books don't name", async () => {
    const db = createDb({
      ledgerEntry: [{ eventId: "ev-other", id: "e-1" }],
      team: [{ id: "t-1", members: [], name: "Teaching" }],
      teamEvent: [{ id: "ev-1", name: "Beach clean-up", teamId: "t-1" }],
      teamMember: [],
    });
    await run(teamMutators.delete, db, adminCtx, { id: "t-1" });
    expect(db.tables.team).toHaveLength(0);
  });
});
