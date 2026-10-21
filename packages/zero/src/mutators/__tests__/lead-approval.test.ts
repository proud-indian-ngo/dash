import { beforeEach, describe, expect, it, mock } from "bun:test";

const enqueue = mock();
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));

import {
  LEAD_AND_FINANCE_DIFFER_MESSAGE,
  LEAD_SKIP_REASON_MESSAGE,
  LEGACY_LEAD_SKIP_REASON,
} from "@pi-dash/shared/approval-policy";

import type { AsyncTask } from "../../context";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { reimbursementQueries } from "../../queries/reimbursement";
import { vendorPaymentQueries } from "../../queries/vendor-payment";
import {
  clearLeadApprovalsOnMovedEvents,
  eventProgrammes,
  LEAD_APPROVAL_CLEARED_NOTE,
  OWN_REQUEST_APPROVAL_MESSAGE,
} from "../lead-approval";
import { reimbursementMutators } from "../reimbursement";
import { vendorPaymentMutators } from "../vendor-payment";
import { vendorPaymentTransactionMutators } from "../vendor-payment-transaction";

type Row = Record<string, unknown>;

const UNALLOCATED = "01930000-0000-7000-8000-000000000009";
const PROOF = "app/approval-screenshots/reimbursements/r-1/proof.png";

function createDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    appConfig: [],
    costCentre: [{ active: true, id: "blr", name: "Bangalore" }],
    expenseCategory: [{ id: "food", name: "Food" }],
    programme: [
      { active: true, id: "edu", leadUserId: "lead-edu", name: "Education" },
      { active: true, id: "arts", leadUserId: "lead-arts", name: "Arts" },
      { active: true, id: "nolead", leadUserId: null, name: "No lead" },
      {
        active: true,
        id: UNALLOCATED,
        leadUserId: "lead-edu",
        name: "Unallocated",
      },
    ],
    project: [],
    reimbursement: [],
    reimbursementAttachment: [],
    reimbursementHistory: [],
    reimbursementLineItem: [],
    statementAllocation: [],
    teamEvent: [
      {
        costCentreId: "blr",
        id: "ev-arts",
        name: "Art camp",
        programmeId: "arts",
      },
    ],
    user: [
      { id: "claimant", name: "Claimant" },
      { id: "lead-edu", name: "Edu Lead" },
      { id: "lead-arts", name: "Arts Lead" },
      { id: "finance", name: "Finance" },
    ],
    vendor: [{ id: "v-1", name: "Caterer", status: "approved" }],
    vendorPayment: [],
    vendorPaymentHistory: [],
    vendorPaymentLineItem: [],
    vendorPaymentTransaction: [],
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
    dbTransaction: {
      wrappedTransaction: {
        // The bank-match check takes the statement-line lock first.
        execute: async () => [],
        // The reimbursement row lock reads the seeded request.
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
        // Payee details are written with Drizzle on the server.
        update: () => ({
          set: () => ({ where: async () => undefined }),
        }),
      },
    },
    location: "server" as const,
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

function ctx(userId: string, permissions: string[] = []) {
  return {
    asyncTasks: [] as AsyncTask[],
    beforeCommitTasks: [] as AsyncTask[],
    copyR2Object: mock(),
    enqueue,
    loadPrivateUser: async (id: string) => ({
      banned: false,
      email: `${id}@example.com`,
      isActive: true,
      name: id,
      phone: null,
      role: "volunteer",
    }),
    lockR2Object: mock(),
    permissions,
    r2KeyPrefix: "app",
    role: permissions.length > 0 ? "finance_admin" : "volunteer",
    traceId: "trace-1",
    userId,
  };
}

const FINANCE = ["requests.approve", "requests.view_all", "finance.manage"];
const financeCtx = () => ctx("finance", FINANCE);

function run(
  mutator: { fn: (input: never) => Promise<unknown> },
  db: ReturnType<typeof createDb>,
  context: ReturnType<typeof ctx>,
  args: Row
) {
  return mutator.fn({ args, ctx: context, tx: db.tx } as never);
}

function reimbursementRow(overrides: Row = {}): Row {
  return {
    approvalScreenshotKey: PROOF,
    chargedProgrammeId: "edu",
    chargedProjectId: null,
    chargedTo: "programme",
    costCentreId: "blr",
    createdBy: "claimant",
    eventId: null,
    expenseDate: Date.UTC(2026, 9, 1),
    id: "r-1",
    leadApprovedAt: null,
    leadApprovedBy: null,
    leadSkipReason: null,
    status: "pending",
    title: "Snacks",
    userId: "claimant",
    voidedAt: null,
    ...overrides,
  };
}

const lineItem = (overrides: Row = {}): Row => ({
  amountPaise: 50_000,
  categoryId: "food",
  description: "Snacks",
  generateVoucher: false,
  id: "li-1",
  reimbursementId: "r-1",
  sortOrder: 0,
  ...overrides,
});

const rows = (db: ReturnType<typeof createDb>, table: string) =>
  db.tables[table] ?? [];

beforeEach(() => {
  enqueue.mockReset();
});

describe("reimbursement: the programme lead approves, then finance", () => {
  it("records the lead's approval and tells finance; finance then pays", async () => {
    const db = createDb({ reimbursement: [reimbursementRow()] });
    const leadCtx = ctx("lead-edu");
    await run(reimbursementMutators.approveAsLead, db, leadCtx, { id: "r-1" });

    expect(rows(db, "reimbursement")[0]).toMatchObject({
      leadApprovedBy: "lead-edu",
      status: "pending",
    });
    expect(rows(db, "reimbursement")[0]?.leadApprovedAt).toEqual(
      expect.any(Number)
    );
    await leadCtx.asyncTasks[0]?.fn();
    expect(enqueue).toHaveBeenCalledWith(
      "notify-reimbursement-submitted",
      expect.objectContaining({
        leadApproval: { at: expect.any(Number), leadName: "Edu Lead" },
        reimbursementId: "r-1",
        submitterName: "Claimant",
      }),
      { traceId: "trace-1" }
    );

    await run(reimbursementMutators.approve, db, financeCtx(), { id: "r-1" });
    expect(rows(db, "reimbursement")[0]).toMatchObject({
      leadApprovedBy: "lead-edu",
      leadSkipReason: null,
      reviewedBy: "finance",
      status: "approved",
    });
  });

  it("lets finance approve without the lead only with a reason", async () => {
    const db = createDb({ reimbursement: [reimbursementRow()] });
    await expect(
      run(reimbursementMutators.approve, db, financeCtx(), { id: "r-1" })
    ).rejects.toThrow(LEAD_SKIP_REASON_MESSAGE);
    await expect(
      run(reimbursementMutators.approve, db, financeCtx(), {
        id: "r-1",
        leadSkipReason: "  ",
      })
    ).rejects.toThrow(LEAD_SKIP_REASON_MESSAGE);
    expect(rows(db, "reimbursement")[0]?.status).toBe("pending");

    await run(reimbursementMutators.approve, db, financeCtx(), {
      id: "r-1",
      leadSkipReason: "Lead is travelling",
    });
    expect(rows(db, "reimbursement")[0]).toMatchObject({
      leadSkipReason: "Lead is travelling",
      status: "approved",
    });
    expect(rows(db, "reimbursementHistory").map((h) => h.note)).toContainEqual(
      "Approved without the programme lead. Reason: Lead is travelling"
    );
  });

  it("refuses another programme's lead, to approve or reject", async () => {
    const db = createDb({ reimbursement: [reimbursementRow()] });
    await expect(
      run(reimbursementMutators.approveAsLead, db, ctx("lead-arts"), {
        id: "r-1",
      })
    ).rejects.toThrow("Only the lead of the programme");
    await expect(
      run(reimbursementMutators.reject, db, ctx("lead-arts"), {
        id: "r-1",
        reason: "No",
      })
    ).rejects.toThrow("Only the lead of the programme");
    expect(rows(db, "reimbursement")[0]).toMatchObject({
      leadApprovedAt: null,
      status: "pending",
    });
  });

  it("lets the lead reject: a normal rejection the claimant hears of", async () => {
    const db = createDb({ reimbursement: [reimbursementRow()] });
    const leadCtx = ctx("lead-edu");
    await run(reimbursementMutators.reject, db, leadCtx, {
      id: "r-1",
      reason: "Not for this programme",
    });
    expect(rows(db, "reimbursement")[0]).toMatchObject({
      rejectionReason: "Not for this programme",
      reviewedBy: "lead-edu",
      status: "rejected",
    });
    await Promise.all(leadCtx.asyncTasks.map((task) => task.fn()));
    expect(enqueue).toHaveBeenCalledWith(
      "notify-reimbursement-rejected",
      expect.objectContaining({ submitterId: "claimant" }),
      { traceId: "trace-1" }
    );
  });

  it("follows an event's programme to its lead", async () => {
    const db = createDb({
      reimbursement: [
        reimbursementRow({
          chargedProgrammeId: null,
          chargedTo: "event",
          costCentreId: null,
          eventId: "ev-arts",
        }),
      ],
    });
    await expect(
      run(reimbursementMutators.approveAsLead, db, ctx("lead-edu"), {
        id: "r-1",
      })
    ).rejects.toThrow("Only the lead of the programme");
    await run(reimbursementMutators.approveAsLead, db, ctx("lead-arts"), {
      id: "r-1",
    });
    expect(rows(db, "reimbursement")[0]?.leadApprovedBy).toBe("lead-arts");
  });

  const noLeadStep: [string, Row][] = [
    [
      "charged to the organisation",
      { chargedProgrammeId: null, chargedTo: "organisation" },
    ],
    ["on the Unallocated programme", { chargedProgrammeId: UNALLOCATED }],
    ["on a programme with no lead", { chargedProgrammeId: "nolead" }],
    ["claimed by the lead", { createdBy: "lead-edu", userId: "lead-edu" }],
    ["raised by the lead for someone else", { createdBy: "lead-edu" }],
  ];
  for (const [label, overrides] of noLeadStep) {
    it(`has no lead step when ${label}`, async () => {
      const db = createDb({ reimbursement: [reimbursementRow(overrides)] });
      await expect(
        run(reimbursementMutators.approveAsLead, db, ctx("lead-edu"), {
          id: "r-1",
        })
      ).rejects.toThrow("Only the lead of the programme");
      await run(reimbursementMutators.approve, db, financeCtx(), { id: "r-1" });
      expect(rows(db, "reimbursement")[0]).toMatchObject({
        leadSkipReason: null,
        status: "approved",
      });
    });
  }

  it("needs a different person in finance from the lead who approved", async () => {
    const db = createDb({ reimbursement: [reimbursementRow()] });
    const leadInFinance = ctx("lead-edu", FINANCE);
    await run(reimbursementMutators.approveAsLead, db, leadInFinance, {
      id: "r-1",
    });
    await expect(
      run(reimbursementMutators.approve, db, ctx("lead-edu", FINANCE), {
        id: "r-1",
      })
    ).rejects.toThrow(LEAD_AND_FINANCE_DIFFER_MESSAGE);
  });

  it("won't let the lead skip their own step as finance", async () => {
    const db = createDb({ reimbursement: [reimbursementRow()] });
    await expect(
      run(reimbursementMutators.approve, db, ctx("lead-edu", FINANCE), {
        id: "r-1",
        leadSkipReason: "Busy",
      })
    ).rejects.toThrow(LEAD_AND_FINANCE_DIFFER_MESSAGE);
  });

  it("notifies only the lead at submission when the lead step applies", async () => {
    const db = createDb();
    const claimantCtx = ctx("claimant", ["requests.create"]);
    await run(reimbursementMutators.create, db, claimantCtx, {
      attachments: [],
      bankAccountName: "Claimant",
      chargedProgrammeId: "edu",
      chargedTo: "programme",
      expenseDate: Date.UTC(2026, 9, 1),
      id: "r-new",
      lineItems: [{ amountPaise: 100, categoryId: "food", id: "li-n" }],
      title: "Snacks",
    });
    await claimantCtx.asyncTasks[0]?.fn();
    expect(enqueue).toHaveBeenCalledWith(
      "notify-reimbursement-submitted",
      expect.objectContaining({ leadUserId: "lead-edu" }),
      { traceId: "trace-1" }
    );
  });
});

describe("reimbursement: changes clear the lead's approval", () => {
  const approvedByLead = () =>
    reimbursementRow({ leadApprovedAt: 1, leadApprovedBy: "lead-edu" });
  const updateArgs = (overrides: Row = {}): Row => ({
    attachments: [],
    chargedProgrammeId: "edu",
    chargedTo: "programme",
    costCentreId: "blr",
    expenseDate: Date.UTC(2026, 9, 1),
    id: "r-1",
    lineItems: [
      {
        amountPaise: 50_000,
        categoryId: "food",
        description: "Snacks",
        id: "li-1",
      },
    ],
    title: "Snacks",
    ...overrides,
  });
  const claimantCtx = () =>
    ctx("claimant", ["requests.create", "requests.edit_own"]);

  it("keeps it when the claimant edits only the title", async () => {
    const db = createDb({
      reimbursement: [approvedByLead()],
      reimbursementLineItem: [lineItem()],
    });
    await run(
      reimbursementMutators.update,
      db,
      claimantCtx(),
      updateArgs({ title: "Snacks for class" })
    );
    expect(rows(db, "reimbursement")[0]?.leadApprovedBy).toBe("lead-edu");
  });

  it("clears it when the claimant changes an amount", async () => {
    const db = createDb({
      reimbursement: [approvedByLead()],
      reimbursementLineItem: [lineItem()],
    });
    await run(
      reimbursementMutators.update,
      db,
      claimantCtx(),
      updateArgs({
        lineItems: [
          {
            amountPaise: 60_000,
            categoryId: "food",
            description: "Snacks",
            id: "li-1",
          },
        ],
      })
    );
    expect(rows(db, "reimbursement")[0]).toMatchObject({
      leadApprovedAt: null,
      leadApprovedBy: null,
    });
    expect(rows(db, "reimbursementHistory").map((h) => h.note)).toContainEqual(
      LEAD_APPROVAL_CLEARED_NOTE
    );
  });

  it("clears it when the claimant changes Charged to", async () => {
    const db = createDb({
      reimbursement: [approvedByLead()],
      reimbursementLineItem: [lineItem()],
    });
    await run(
      reimbursementMutators.update,
      db,
      claimantCtx(),
      updateArgs({ chargedProgrammeId: "arts" })
    );
    expect(rows(db, "reimbursement")[0]?.leadApprovedAt).toBeNull();
  });

  it("clears it when finance moves it to another programme, not within one", async () => {
    const db = createDb({
      project: [{ id: "class", programmeId: "edu", status: "active" }],
      reimbursement: [approvedByLead()],
    });
    await run(reimbursementMutators.setChargedTo, db, financeCtx(), {
      chargedProgrammeId: "edu",
      chargedProjectId: "class",
      chargedTo: "programme",
      id: "r-1",
    });
    expect(rows(db, "reimbursement")[0]?.leadApprovedBy).toBe("lead-edu");

    await run(reimbursementMutators.setChargedTo, db, financeCtx(), {
      chargedTo: "event",
      eventId: "ev-arts",
      id: "r-1",
    });
    expect(rows(db, "reimbursement")[0]?.leadApprovedBy).toBeNull();
  });

  it("clears it, and finance's reason, on a reset to pending", async () => {
    const db = createDb({
      reimbursement: [
        reimbursementRow({
          leadSkipReason: "Lead away",
          reviewedBy: "finance",
          status: "approved",
        }),
      ],
    });
    await run(
      reimbursementMutators.resetToPending,
      db,
      ctx("finance", [...FINANCE, "requests.edit_all_statuses"]),
      { id: "r-1" }
    );
    expect(rows(db, "reimbursement")[0]).toMatchObject({
      leadApprovedAt: null,
      leadSkipReason: null,
      status: "pending",
    });
  });
});

describe("vendor payment: the programme lead approves, then finance", () => {
  const vendorPaymentRow = (overrides: Row = {}): Row => ({
    approvalScreenshotKey: null,
    chargedProgrammeId: "edu",
    chargedProjectId: null,
    chargedTo: "programme",
    costCentreId: "blr",
    eventId: null,
    id: "vp-1",
    leadApprovedAt: null,
    leadApprovedBy: null,
    leadSkipReason: null,
    status: "pending",
    title: "Lunch",
    userId: "claimant",
    vendorId: "v-1",
    voidedAt: null,
    ...overrides,
  });

  it("takes the lead's approval, then finance's", async () => {
    const db = createDb({ vendorPayment: [vendorPaymentRow()] });
    await expect(
      run(vendorPaymentMutators.approve, db, financeCtx(), { id: "vp-1" })
    ).rejects.toThrow(LEAD_SKIP_REASON_MESSAGE);
    await expect(
      run(vendorPaymentMutators.approveAsLead, db, ctx("lead-arts"), {
        id: "vp-1",
      })
    ).rejects.toThrow("Only the lead of the programme");
    await run(vendorPaymentMutators.approveAsLead, db, ctx("lead-edu"), {
      id: "vp-1",
    });
    await run(vendorPaymentMutators.approve, db, financeCtx(), { id: "vp-1" });
    expect(rows(db, "vendorPayment")[0]).toMatchObject({
      leadApprovedBy: "lead-edu",
      reviewedBy: "finance",
      status: "approved",
    });
  });

  it("stores finance's reason for approving without the lead", async () => {
    const db = createDb({ vendorPayment: [vendorPaymentRow()] });
    await run(vendorPaymentMutators.approve, db, financeCtx(), {
      id: "vp-1",
      leadSkipReason: "Urgent payment",
    });
    expect(rows(db, "vendorPayment")[0]).toMatchObject({
      leadSkipReason: "Urgent payment",
      status: "approved",
    });
  });

  it("has no lead step when the submitter leads the programme", async () => {
    const db = createDb({
      vendorPayment: [vendorPaymentRow({ userId: "lead-edu" })],
    });
    await run(vendorPaymentMutators.approve, db, financeCtx(), { id: "vp-1" });
    expect(rows(db, "vendorPayment")[0]?.status).toBe("approved");
  });

  it("clears the lead's approval when a line changes while pending", async () => {
    const db = createDb({
      vendorPayment: [
        vendorPaymentRow({ leadApprovedAt: 1, leadApprovedBy: "lead-edu" }),
      ],
      vendorPaymentLineItem: [
        {
          amountPaise: 10_000,
          categoryId: "food",
          description: "Lunch",
          id: "vli-1",
          vendorPaymentId: "vp-1",
        },
      ],
    });
    await run(
      vendorPaymentMutators.update,
      db,
      ctx("claimant", ["requests.create", "requests.edit_own"]),
      {
        attachments: [],
        chargedProgrammeId: "edu",
        chargedTo: "programme",
        costCentreId: "blr",
        id: "vp-1",
        lineItems: [
          {
            amountPaise: 12_000,
            categoryId: "food",
            description: "Lunch",
            id: "vli-1",
          },
        ],
        title: "Lunch",
        vendorId: "v-1",
      }
    );
    expect(rows(db, "vendorPayment")[0]?.leadApprovedAt).toBeNull();
  });
});

describe("a programme lead sees the requests charged to their programme", () => {
  const scopeTables = (): ScopeTables => ({
    programme: [
      { id: "edu", leadUserId: "lead-edu" },
      { id: "arts", leadUserId: "lead-arts" },
    ],
    teamEvent: [{ id: "ev-arts", programmeId: "arts" }],
  });
  const requests: ScopeRow[] = [
    { chargedProgrammeId: "edu", eventId: null, id: "edu-1", userId: "a" },
    { chargedProgrammeId: null, eventId: "ev-arts", id: "arts-1", userId: "a" },
    { chargedProgrammeId: null, eventId: null, id: "org-1", userId: "a" },
    {
      chargedProgrammeId: null,
      eventId: null,
      id: "own-1",
      userId: "lead-edu",
    },
  ];
  const visible = (query: unknown) => {
    const { ast } = query as { ast: ScopeAst };
    return requests
      .filter((row) => matchesScope(row, ast.where, scopeTables()))
      .map((row) => row.id);
  };
  const leadCtx = (userId: string) =>
    ({
      permissions: ["requests.view_own"],
      role: "volunteer",
      userId,
    }) as never;

  it("lists their own and their programme's, through the event too", () => {
    expect(
      visible(
        reimbursementQueries.all.fn({
          args: undefined,
          ctx: leadCtx("lead-edu"),
        } as never)
      )
    ).toEqual(["edu-1", "own-1"]);
    expect(
      visible(
        reimbursementQueries.all.fn({
          args: undefined,
          ctx: leadCtx("lead-arts"),
        } as never)
      )
    ).toEqual(["arts-1"]);
    expect(
      visible(
        vendorPaymentQueries.all.fn({
          args: undefined,
          ctx: leadCtx("lead-arts"),
        } as never)
      )
    ).toEqual(["arts-1"]);
  });

  it("never shows a request on the Unallocated holder to its lead", () => {
    const tables = scopeTables();
    tables.programme?.push({ id: UNALLOCATED, leadUserId: "lead-edu" });
    const row: ScopeRow = {
      chargedProgrammeId: UNALLOCATED,
      eventId: null,
      id: "held-1",
      userId: "a",
    };
    const { ast } = reimbursementQueries.all.fn({
      args: undefined,
      ctx: leadCtx("lead-edu"),
    } as never) as unknown as { ast: ScopeAst };
    expect(matchesScope(row, ast.where, tables)).toBe(false);
  });

  it("won't open another programme's request", () => {
    const query = reimbursementQueries.byId.fn({
      args: { id: "edu-1" },
      ctx: leadCtx("lead-arts"),
    } as never);
    expect(visible(query)).toEqual([]);
  });
});

describe("finance's reason, on any move to approved", () => {
  it("asks again when finance overrides the lead's rejection", async () => {
    const db = createDb({ reimbursement: [reimbursementRow()] });
    await run(reimbursementMutators.reject, db, ctx("lead-edu"), {
      id: "r-1",
      reason: "Not ours",
    });
    const override = ctx("finance", [...FINANCE, "requests.edit_all_statuses"]);
    await expect(
      run(reimbursementMutators.approve, db, override, { id: "r-1" })
    ).rejects.toThrow(LEAD_SKIP_REASON_MESSAGE);
    await run(reimbursementMutators.approve, db, override, {
      id: "r-1",
      leadSkipReason: "Agreed with the trustees",
    });
    expect(rows(db, "reimbursement")[0]).toMatchObject({
      leadSkipReason: "Agreed with the trustees",
      status: "approved",
    });
  });

  it("needs no reason, and no lead, for a request pending before the step began", async () => {
    const db = createDb({
      reimbursement: [
        reimbursementRow({ leadSkipReason: LEGACY_LEAD_SKIP_REASON }),
      ],
    });
    await expect(
      run(reimbursementMutators.approveAsLead, db, ctx("lead-edu"), {
        id: "r-1",
      })
    ).rejects.toThrow("no longer waits for the programme lead");
    await run(reimbursementMutators.approve, db, financeCtx(), { id: "r-1" });
    expect(rows(db, "reimbursement")[0]).toMatchObject({
      leadSkipReason: LEGACY_LEAD_SKIP_REASON,
      status: "approved",
    });
  });
});

describe("nobody approves or pays their own request", () => {
  it("refuses finance approving a claim they make or raised", async () => {
    for (const overrides of [
      { createdBy: "finance", userId: "finance" },
      { createdBy: "finance" },
    ]) {
      const db = createDb({
        reimbursement: [
          reimbursementRow({ chargedProgrammeId: "nolead", ...overrides }),
        ],
      });
      await expect(
        run(reimbursementMutators.approve, db, financeCtx(), { id: "r-1" })
      ).rejects.toThrow(OWN_REQUEST_APPROVAL_MESSAGE);
    }
  });

  it("refuses finance approving, or approving a payment on, their own vendor payment", async () => {
    const vp = {
      approvalScreenshotKey: null,
      chargedProgrammeId: "nolead",
      chargedProjectId: null,
      chargedTo: "programme",
      costCentreId: "blr",
      eventId: null,
      id: "vp-1",
      leadApprovedAt: null,
      leadSkipReason: null,
      status: "pending",
      title: "Lunch",
      userId: "finance",
      vendorId: "v-1",
      voidedAt: null,
    };
    const db = createDb({ vendorPayment: [vp] });
    await expect(
      run(vendorPaymentMutators.approve, db, financeCtx(), { id: "vp-1" })
    ).rejects.toThrow(OWN_REQUEST_APPROVAL_MESSAGE);

    const paid = createDb({
      vendorPayment: [{ ...vp, status: "approved" }],
      vendorPaymentLineItem: [
        {
          amountPaise: 10_000,
          categoryId: "food",
          id: "l",
          vendorPaymentId: "vp-1",
        },
      ],
      vendorPaymentTransaction: [
        {
          amountPaise: 5000,
          id: "t-1",
          status: "pending",
          userId: "someone",
          vendorPaymentId: "vp-1",
          voidedAt: null,
        },
      ],
    });
    await expect(
      run(vendorPaymentTransactionMutators.approve, paid, financeCtx(), {
        id: "t-1",
      })
    ).rejects.toThrow(OWN_REQUEST_APPROVAL_MESSAGE);

    // Recording a payment on their own request leaves it for someone else.
    await run(
      vendorPaymentTransactionMutators.create,
      paid,
      ctx("finance", [...FINANCE, "requests.record_payment"]),
      {
        amountPaise: 1000,
        attachments: [],
        id: "t-2",
        transactionDate: Date.UTC(2026, 9, 1),
        vendorPaymentId: "vp-1",
      }
    );
    expect(
      rows(paid, "vendorPaymentTransaction").find((t) => t.id === "t-2")
    ).toMatchObject({ reviewedBy: null, status: "pending" });
  });
});

describe("the lead's approval is cleared when the request changes hands", () => {
  const approvedByLead = () =>
    reimbursementRow({ leadApprovedAt: 1, leadApprovedBy: "lead-edu" });

  it("refuses the lead acting again once they approved", async () => {
    const db = createDb({ reimbursement: [approvedByLead()] });
    for (const mutator of [
      reimbursementMutators.approveAsLead,
      reimbursementMutators.reject,
    ]) {
      await expect(
        run(mutator, db, ctx("lead-edu"), { id: "r-1", reason: "No" })
      ).rejects.toThrow("no longer waits for the programme lead");
    }
  });

  it("clears it when the claimant changes while pending", async () => {
    const db = createDb({ bankAccount: [], reimbursement: [approvedByLead()] });
    await run(
      reimbursementMutators.changeClaimant,
      db,
      ctx("finance", [...FINANCE, "requests.create_for_others"]),
      {
        bankAccountId: null,
        id: "r-1",
        previousUserId: "claimant",
        reason: "Paid by someone else",
        userId: "lead-arts",
      }
    );
    expect(rows(db, "reimbursement")[0]).toMatchObject({
      leadApprovedBy: null,
      userId: "lead-arts",
    });
  });

  it("clears it on pending claims when their event moves to another programme", async () => {
    const db = createDb({
      reimbursement: [
        {
          ...approvedByLead(),
          chargedProgrammeId: null,
          chargedTo: "event",
          eventId: "ev-arts",
        },
        {
          ...approvedByLead(),
          chargedProgrammeId: null,
          chargedTo: "event",
          eventId: "ev-arts",
          id: "r-done",
          status: "approved",
        },
      ],
    });
    const before = await eventProgrammes(db.tx as never, ["ev-arts"]);
    Object.assign(db.tables.teamEvent?.[0] ?? {}, { programmeId: "edu" });
    const adminCtx = ctx("admin", ["events.edit"]);
    await clearLeadApprovalsOnMovedEvents(
      db.tx as never,
      adminCtx as never,
      before,
      5
    );
    // The new programme's lead hears it waits for them.
    await Promise.all(adminCtx.asyncTasks.map((task) => task.fn()));
    expect(enqueue).toHaveBeenCalledWith(
      "notify-reimbursement-submitted",
      expect.objectContaining({
        leadUserId: "lead-edu",
        leadWaitingAgainAt: 5,
        reimbursementId: "r-1",
      }),
      { traceId: "trace-1" }
    );
    const [pending, approved] = rows(db, "reimbursement");
    expect(pending?.leadApprovedAt).toBeNull();
    expect(approved?.leadApprovedBy).toBe("lead-edu");
  });
});

describe("self-approval after approval", () => {
  it("refuses changing the lines of your own approved reimbursement", async () => {
    const db = createDb({
      reimbursement: [
        reimbursementRow({
          createdBy: "finance",
          leadSkipReason: "x",
          status: "approved",
          userId: "finance",
        }),
      ],
      reimbursementLineItem: [lineItem()],
    });
    const editor = ctx("finance", [
      ...FINANCE,
      "requests.edit_all",
      "requests.edit_all_statuses",
    ]);
    const args = {
      attachments: [],
      chargedProgrammeId: "edu",
      chargedTo: "programme",
      costCentreId: "blr",
      expenseDate: Date.UTC(2026, 9, 1),
      id: "r-1",
      title: "Snacks",
    };
    await expect(
      run(reimbursementMutators.update, db, editor, {
        ...args,
        lineItems: [
          {
            amountPaise: 90_000,
            categoryId: "food",
            description: "Snacks",
            id: "li-1",
          },
        ],
      })
    ).rejects.toThrow(OWN_REQUEST_APPROVAL_MESSAGE);
    // The title alone is fine.
    await run(reimbursementMutators.update, db, editor, {
      ...args,
      lineItems: [
        {
          amountPaise: 50_000,
          categoryId: "food",
          description: "Snacks",
          id: "li-1",
        },
      ],
      title: "Snacks for class",
    });
  });

  const ownVp = (status: string) => ({
    chargedProgrammeId: "nolead",
    chargedTo: "programme",
    costCentreId: "blr",
    eventId: null,
    id: "vp-1",
    status,
    title: "Lunch",
    userId: "finance",
    vendorId: "v-1",
    voidedAt: null,
  });

  it("refuses resizing an approved payment on your own vendor payment", async () => {
    const db = createDb({
      vendorPayment: [ownVp("partially_paid")],
      vendorPaymentLineItem: [
        {
          amountPaise: 10_000,
          categoryId: "food",
          id: "l",
          vendorPaymentId: "vp-1",
        },
      ],
      vendorPaymentTransaction: [
        {
          amountPaise: 5000,
          id: "t-1",
          status: "approved",
          userId: "someone",
          vendorPaymentId: "vp-1",
          voidedAt: null,
        },
      ],
      vendorPaymentTransactionAttachment: [],
    });
    await expect(
      run(
        vendorPaymentTransactionMutators.update,
        db,
        ctx("finance", [...FINANCE, "requests.edit_all"]),
        {
          amountPaise: 9000,
          attachments: [],
          id: "t-1",
          transactionDate: Date.UTC(2026, 9, 1),
        }
      )
    ).rejects.toThrow(OWN_REQUEST_APPROVAL_MESSAGE);
  });

  it("refuses approving the invoice of your own vendor payment", async () => {
    const db = createDb({ vendorPayment: [ownVp("invoice_pending")] });
    await expect(
      run(vendorPaymentMutators.approveInvoice, db, financeCtx(), {
        id: "vp-1",
      })
    ).rejects.toThrow(OWN_REQUEST_APPROVAL_MESSAGE);
  });
});

describe("the lead hears when a request waits for them again", () => {
  it("on an edit that clears their approval, and on a reset", async () => {
    const db = createDb({
      reimbursement: [
        reimbursementRow({ leadApprovedAt: 1, leadApprovedBy: "lead-edu" }),
      ],
      reimbursementLineItem: [lineItem()],
    });
    const claimant = ctx("claimant", ["requests.create", "requests.edit_own"]);
    await run(reimbursementMutators.update, db, claimant, {
      attachments: [],
      chargedProgrammeId: "edu",
      chargedTo: "programme",
      costCentreId: "blr",
      expenseDate: Date.UTC(2026, 9, 1),
      id: "r-1",
      lineItems: [
        {
          amountPaise: 70_000,
          categoryId: "food",
          description: "Snacks",
          id: "li-1",
        },
      ],
      title: "Snacks",
    });
    await Promise.all(claimant.asyncTasks.map((task) => task.fn()));
    expect(enqueue).toHaveBeenCalledWith(
      "notify-reimbursement-submitted",
      expect.objectContaining({
        leadUserId: "lead-edu",
        leadWaitingAgainAt: expect.any(Number),
      }),
      { traceId: "trace-1" }
    );

    enqueue.mockReset();
    Object.assign(rows(db, "reimbursement")[0] ?? {}, {
      leadApprovedAt: null,
      leadSkipReason: "Urgent",
      status: "approved",
    });
    const finance = ctx("finance", [...FINANCE, "requests.edit_all_statuses"]);
    await run(reimbursementMutators.resetToPending, db, finance, { id: "r-1" });
    await Promise.all(finance.asyncTasks.map((task) => task.fn()));
    expect(enqueue).toHaveBeenCalledWith(
      "notify-reimbursement-submitted",
      expect.objectContaining({ leadUserId: "lead-edu" }),
      { traceId: "trace-1" }
    );
  });

  it("when finance moves it onto a programme with a lead, not when it stays", async () => {
    const db = createDb({
      reimbursement: [
        reimbursementRow({
          chargedProgrammeId: null,
          chargedTo: "organisation",
        }),
      ],
    });
    const finance = financeCtx();
    await run(reimbursementMutators.setChargedTo, db, finance, {
      chargedProgrammeId: "arts",
      chargedTo: "programme",
      id: "r-1",
    });
    await Promise.all(finance.asyncTasks.map((task) => task.fn()));
    expect(enqueue).toHaveBeenCalledWith(
      "notify-reimbursement-submitted",
      expect.objectContaining({ leadUserId: "lead-arts" }),
      { traceId: "trace-1" }
    );

    enqueue.mockReset();
    const again = financeCtx();
    await run(reimbursementMutators.setChargedTo, db, again, {
      chargedProgrammeId: "arts",
      chargedTo: "programme",
      id: "r-1",
    });
    await Promise.all(again.asyncTasks.map((task) => task.fn()));
    expect(
      enqueue.mock.calls.filter(
        ([name]) => name === "notify-reimbursement-submitted"
      )
    ).toEqual([]);
  });
});

describe("a programme lead syncs only the receipts", () => {
  it("filters a lead's attachments to receipts; the claimant keeps all", () => {
    const tables: ScopeTables = {
      reimbursement: [{ id: "r-1", userId: "claimant" }],
    };
    const files: ScopeRow[] = [
      { id: "a", purpose: "receipt", reimbursementId: "r-1" },
      { id: "b", purpose: "payment_proof", reimbursementId: "r-1" },
      { id: "c", purpose: "signed_voucher", reimbursementId: "r-1" },
      { id: "d", purpose: "payee_signature", reimbursementId: "r-1" },
    ];
    const attachmentsFor = (userId: string) => {
      const { ast } = reimbursementQueries.byId.fn({
        args: { id: "r-1" },
        ctx: { permissions: ["requests.view_own"], role: "volunteer", userId },
      } as never) as unknown as {
        ast: { related: { subquery: ScopeAst & { alias: string } }[] };
      };
      const sub = ast.related.find((r) => r.subquery.alias === "attachments");
      return files
        .filter((row) => matchesScope(row, sub?.subquery.where, tables))
        .map((row) => row.id);
    };
    expect(attachmentsFor("lead-edu")).toEqual(["a"]);
    expect(attachmentsFor("claimant")).toEqual(["a", "b", "c", "d"]);
  });
});
