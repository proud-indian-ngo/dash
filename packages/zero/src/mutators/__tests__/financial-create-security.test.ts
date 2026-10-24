import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { advancePaymentMutators } from "../advance-payment";
import { reimbursementMutators } from "../reimbursement";
import { vendorPaymentMutators } from "../vendor-payment";
import { vendorPaymentTransactionMutators } from "../vendor-payment-transaction";

type Row = Record<string, unknown>;
const UNALLOCATED = "01930000-0000-7000-8000-000000000009";

// Failure cases: conflict-as-no-op must not overwrite another claimant's payout,
// append to an approved own request, add children/history, or queue side effects.
// Fresh and optimistic creates must still work. PostgreSQL concurrency is tested
// separately because an in-memory double cannot prove transaction locking.
function createDb(
  seed: Partial<Record<string, Row[]>> = {},
  location: "client" | "server" = "server"
) {
  const tables: Record<string, Row[]> = {
    costCentre: [{ id: "city", active: true }],
    appConfig: [],
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
    vendor: [{ id: "vendor", status: "approved" }],
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
      if (!tables[table].some((existing) => existing.id === row.id)) {
        tables[table].push(row);
      }
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
        update: () => ({
          set: (fields: Row) => ({
            where: async () => {
              Object.assign(tables.reimbursement?.[0] ?? {}, fields);
            },
          }),
        }),
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

const cases = [
  ["reimbursement", reimbursementMutators.create],
  ["vendorPayment", vendorPaymentMutators.create],
  ["advancePayment", advancePaymentMutators.create],
] as const;
const args = {
  attachments: [
    { id: "attachment", type: "url", url: "https://example.com/receipt" },
  ],
  bankAccountName: "New payee",
  bankAccountNumber: "9999999999",
  chargedTo: "organisation",
  expenseDate: Date.UTC(2026, 8, 1),
  id: "request",
  lineItems: [
    {
      id: "line",
      amountPaise: 10000,
      categoryId: "category",
      description: "Expense",
    },
  ],
  title: "New request",
  vendorId: "vendor",
};
const context = () => ({
  asyncTasks: [],
  permissions: ["requests.create"],
  role: "volunteer",
  userId: "claimant",
});

describe("financial creation ownership", () => {
  for (const [table, mutator] of cases) {
    for (const owner of ["someone-else", "claimant"]) {
      it(`${table} refuses an existing approved ID owned by ${owner}`, async () => {
        const existing = {
          id: "request",
          userId: owner,
          status: "approved",
          title: "Existing",
          bankAccountNumber: "1234567890",
        };
        const db = createDb({ [table]: [existing] });
        const before = structuredClone(db.tables);
        const ctx = context();
        await expect(
          mutator.fn({ tx: db.tx, ctx, args } as never)
        ).rejects.toThrow("Record already exists");
        expect(db.tables).toEqual(before);
        expect(ctx.asyncTasks).toHaveLength(0);
      });
    }
    for (const location of ["client", "server"] as const) {
      it(`${table} still creates a fresh request on ${location}`, async () => {
        const db = createDb({}, location);
        await mutator.fn({ tx: db.tx, ctx: context(), args } as never);
        expect(db.tables[table]).toHaveLength(1);
        expect(db.tables[`${table}LineItem`]).toHaveLength(1);
        expect(db.tables[`${table}Attachment`]).toHaveLength(1);
        expect(db.tables[`${table}History`]).toHaveLength(1);
      });
    }
  }
});

// New inaccessible/missing event references must fail on create and update.
// Existing references remain editable after membership loss. Public/member/lead
// visibility and finance authority must continue to permit legitimate selection.
describe("financial event references", () => {
  for (const [table, mutators] of [
    ["reimbursement", reimbursementMutators],
    ["vendorPayment", vendorPaymentMutators],
  ] as const) {
    const event = {
      id: "private",
      isPublic: false,
      programmeId: "edu",
      teamId: "team",
    };
    const request = {
      id: "request",
      status: "pending",
      userId: "claimant",
      vendorId: "vendor",
      chargedTo: "organisation",
      title: "Existing",
    };
    const eventArgs = { ...args, chargedTo: "event", eventId: "private" };
    const actor = {
      ...context(),
      permissions: ["requests.create", "requests.edit_own", "events.view_own"],
    };
    for (const action of ["create", "update"] as const) {
      it(`${table}.${action} rejects a new private event without membership`, async () => {
        const db = createDb({
          [table]: action === "update" ? [request] : [],
          teamEvent: [event],
        });
        await expect(
          mutators[action].fn({
            tx: db.tx,
            ctx: actor,
            args: eventArgs,
          } as never)
        ).rejects.toThrow("Event not found or inaccessible");
      });
    }
    it(`${table} rejects a missing event even for finance`, async () => {
      const db = createDb({ teamEvent: [] });
      await expect(
        mutators.create.fn({
          tx: db.tx,
          ctx: {
            ...actor,
            _permissionSet: undefined,
            permissions: [...actor.permissions, "finance.manage"],
          },
          args: eventArgs,
        } as never)
      ).rejects.toThrow("Event not found or inaccessible");
    });
    for (const authority of [
      "public",
      "event-member",
      "team-lead",
      "programme-lead",
      "finance",
      "approver",
    ] as const) {
      it(`${table} accepts an event accessible via ${authority}`, async () => {
        const db = createDb({
          teamEvent: [{ ...event, isPublic: authority === "public" }],
          team: [{ id: "team" }],
          teamEventMember:
            authority === "event-member"
              ? [{ id: "membership", eventId: "private", userId: "claimant" }]
              : [],
          teamMember:
            authority === "team-lead"
              ? [
                  {
                    id: "membership",
                    teamId: "team",
                    userId: "claimant",
                    role: "lead",
                  },
                ]
              : [],
          programme: [
            {
              id: "edu",
              active: true,
              leadUserId: authority === "programme-lead" ? "claimant" : "other",
            },
          ],
        });
        const permissions = [
          ...actor.permissions,
          ...(authority === "finance" ? ["finance.manage"] : []),
          ...(authority === "approver"
            ? ["requests.approve", "requests.view_all"]
            : []),
        ];
        await mutators.create.fn({
          tx: db.tx,
          ctx: { ...actor, _permissionSet: undefined, permissions },
          args: eventArgs,
        } as never);
        expect(db.tables[table]?.[0]?.eventId).toBe("private");
      });
    }
    it(`${table} preserves the existing reference after membership loss`, async () => {
      const db = createDb({
        [table]: [{ ...request, chargedTo: "event", eventId: "private" }],
        teamEvent: [event],
      });
      await mutators.update.fn({
        tx: db.tx,
        ctx: actor,
        args: eventArgs,
      } as never);
      expect(db.tables[table]?.[0]?.eventId).toBe("private");
    });
  }
});

describe("payment transaction creation ownership", () => {
  it("refuses an existing transaction ID without writing attachments or history", async () => {
    const db = createDb({
      vendorPayment: [{ id: "parent", userId: "other", status: "approved" }],
      vendorPaymentLineItem: [
        { id: "owed", vendorPaymentId: "parent", amountPaise: 30000 },
      ],
      vendorPaymentTransaction: [
        {
          id: "transaction",
          vendorPaymentId: "parent",
          amountPaise: 10000,
          status: "approved",
          userId: "other",
        },
      ],
    });
    const before = structuredClone(db.tables);
    const ctx = {
      ...context(),
      permissions: ["requests.record_payment", "requests.approve"],
    };
    await expect(
      vendorPaymentTransactionMutators.create.fn({
        tx: db.tx,
        ctx,
        args: {
          id: "transaction",
          vendorPaymentId: "parent",
          amountPaise: 10000,
          transactionDate: Date.now(),
          attachments: args.attachments,
        },
      } as never)
    ).rejects.toThrow("Record already exists");
    expect(db.tables).toEqual(before);
    expect(ctx.asyncTasks).toHaveLength(0);
  });
});

// A deleted ID may be reused under another parent while the first read waits
// for its lock. Never operate on that replacement under the old parent's lock.
describe("payment parent locking", () => {
  it("refuses a transaction replaced under a different parent while waiting", async () => {
    const db = createDb({
      vendorPayment: [
        { id: "original-parent", status: "approved", userId: "other" },
        { id: "replacement-parent", status: "approved", userId: "other" },
      ],
      vendorPaymentLineItem: [
        {
          id: "owed",
          vendorPaymentId: "replacement-parent",
          amountPaise: 10000,
        },
      ],
      vendorPaymentTransaction: [
        {
          id: "transaction",
          vendorPaymentId: "original-parent",
          amountPaise: 10000,
          status: "pending",
          userId: "other",
        },
      ],
    });
    db.tx.dbTransaction.wrappedTransaction.execute = async () => {
      db.tables.vendorPaymentTransaction = [
        {
          id: "transaction",
          vendorPaymentId: "replacement-parent",
          amountPaise: 10000,
          status: "pending",
          userId: "other",
        },
      ];
      return [];
    };
    await expect(
      vendorPaymentTransactionMutators.approve.fn({
        tx: db.tx,
        ctx: { ...context(), permissions: ["requests.approve"] },
        args: { id: "transaction" },
      } as never)
    ).rejects.toThrow("Transaction changed; try again");
    expect(db.tables.vendorPaymentTransaction?.[0]?.status).toBe("pending");
    expect(db.tables.vendorPaymentTransactionHistory ?? []).toHaveLength(0);
  });
});
