import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { advancePaymentMutators } from "../advance-payment";
import { CHOOSE_CLAIMANT_ACCOUNT_MESSAGE } from "../claimant";
import { reimbursementMutators } from "../reimbursement";

type Row = Record<string, unknown>;

const UNALLOCATED = "01930000-0000-7000-8000-000000000009";

const STORED_PAYOUT = {
  bankAccountIfscCode: "SBIN0001234",
  bankAccountName: "Ravi Kumar",
  bankAccountNumber: "111122223333",
  bankAccountUpiId: null,
};

function createDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    advancePayment: [],
    advancePaymentAttachment: [],
    advancePaymentHistory: [],
    advancePaymentLineItem: [],
    appConfig: [],
    bankAccount: [
      {
        accountName: "Ravi Kumar",
        accountNumber: "111122223333",
        id: "acct-ravi",
        ifscCode: "SBIN0001234",
        isDefault: true,
        userId: "ravi",
      },
      {
        accountName: "Ravi K (HDFC)",
        accountNumber: "444455556666",
        id: "acct-ravi-2",
        ifscCode: "HDFC0004321",
        isDefault: false,
        upiId: null,
        userId: "ravi",
      },
      {
        accountName: "Asha",
        accountNumber: "999988887777",
        id: "acct-asha",
        ifscCode: "ICIC0001111",
        isDefault: true,
        userId: "asha",
      },
    ],
    programme: [{ active: true, id: UNALLOCATED, name: "Unallocated" }],
    reimbursement: [],
    reimbursementAttachment: [],
    reimbursementHistory: [],
    reimbursementLineItem: [],
    user: [],
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
        // Reimbursement payee details aren't synced: the server writes them
        // with Drizzle, on the one seeded request.
        update: () => ({
          set: (values: Row) => ({
            where: async () => {
              Object.assign(tables.reimbursement?.[0] ?? {}, values);
            },
          }),
        }),
      },
    },
    location: "server",
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
  ctx: Row,
  args: Row
) {
  return mutator.fn({ args, ctx, tx: db.tx } as never);
}

const claimantCtx = {
  permissions: ["requests.create", "requests.edit_own", "requests.view_own"],
  role: "volunteer",
  userId: "ravi",
};
const financeAdminCtx = {
  permissions: ["requests.edit_all", "requests.view_all"],
  role: "finance_admin",
  userId: "asha",
};
const superAdminCtx = {
  permissions: [
    "requests.create_for_others",
    "requests.edit_all",
    "requests.edit_all_statuses",
    "requests.view_all",
  ],
  role: "super_admin",
  userId: "asha",
};

const otherAccount = {
  bankAccountIfscCode: "ICIC0001111",
  bankAccountName: "Asha",
  bankAccountNumber: "999988887777",
  bankAccountUpiId: "",
};

const request = (overrides: Row = {}): Row => ({
  chargedProgrammeId: UNALLOCATED,
  chargedProjectId: null,
  chargedTo: "programme",
  eventId: null,
  id: "r-1",
  status: "pending",
  title: "Centre rent",
  userId: "ravi",
  ...STORED_PAYOUT,
  ...overrides,
});

const reimbursementArgs = {
  attachments: [],
  chargedProgrammeId: UNALLOCATED,
  chargedTo: "programme",
  expenseDate: Date.parse("2026-09-01"),
  id: "r-1",
  lineItems: [],
  title: "Centre rent",
};

const advanceArgs = {
  attachments: [],
  id: "r-1",
  lineItems: [],
  title: "Centre rent",
};

describe("who changes a reimbursement's payout", () => {
  it("lets the claimant pick another account", async () => {
    const db = createDb({ reimbursement: [request()] });
    await run(reimbursementMutators.update, db, claimantCtx, {
      ...reimbursementArgs,
      bankAccountName: "Ravi K (HDFC)",
      bankAccountNumber: "444455556666",
    });
    expect(db.tables.reimbursement?.[0]).toMatchObject({
      bankAccountName: "Ravi K (HDFC)",
      bankAccountNumber: "444455556666",
    });
  });

  it("keeps the stored payout when finance sends their own account", async () => {
    const db = createDb({ reimbursement: [request()] });
    await run(reimbursementMutators.update, db, financeAdminCtx, {
      ...reimbursementArgs,
      ...otherAccount,
    });
    expect(db.tables.reimbursement?.[0]).toMatchObject(STORED_PAYOUT);
  });

  it("ignores a claimant account from someone without edit_all_statuses", async () => {
    const db = createDb({ reimbursement: [request()] });
    await run(reimbursementMutators.update, db, financeAdminCtx, {
      ...reimbursementArgs,
      claimantBankAccountId: "acct-ravi-2",
    });
    expect(db.tables.reimbursement?.[0]).toMatchObject(STORED_PAYOUT);
  });

  it("lets a super admin correct it to another of the claimant's accounts", async () => {
    const db = createDb({
      reimbursement: [request({ status: "approved" })],
    });
    await run(reimbursementMutators.update, db, superAdminCtx, {
      ...reimbursementArgs,
      ...otherAccount,
      claimantBankAccountId: "acct-ravi-2",
    });
    expect(db.tables.reimbursement?.[0]).toMatchObject({
      bankAccountIfscCode: "HDFC0004321",
      bankAccountName: "Ravi K (HDFC)",
      bankAccountNumber: "444455556666",
      bankAccountUpiId: null,
    });
  });

  it("refuses a super admin's pick of an account that isn't the claimant's", async () => {
    const db = createDb({ reimbursement: [request()] });
    await expect(
      run(reimbursementMutators.update, db, superAdminCtx, {
        ...reimbursementArgs,
        claimantBankAccountId: "acct-asha",
      })
    ).rejects.toThrow(CHOOSE_CLAIMANT_ACCOUNT_MESSAGE);
    expect(db.tables.reimbursement?.[0]).toMatchObject(STORED_PAYOUT);
  });
});

describe("who changes an advance payment's payout", () => {
  it("keeps the stored payout when finance sends their own account", async () => {
    const db = createDb({ advancePayment: [request()] });
    await run(advancePaymentMutators.update, db, financeAdminCtx, {
      ...advanceArgs,
      ...otherAccount,
    });
    expect(db.tables.advancePayment?.[0]).toMatchObject(STORED_PAYOUT);
  });

  it("lets a super admin correct it to another of the owner's accounts", async () => {
    const db = createDb({ advancePayment: [request()] });
    await run(advancePaymentMutators.update, db, superAdminCtx, {
      ...advanceArgs,
      ...otherAccount,
      claimantBankAccountId: "acct-ravi-2",
    });
    expect(db.tables.advancePayment?.[0]).toMatchObject({
      bankAccountIfscCode: "HDFC0004321",
      bankAccountName: "Ravi K (HDFC)",
      bankAccountNumber: "444455556666",
      bankAccountUpiId: null,
    });
  });

  it("refuses a super admin's pick of an account that isn't the owner's", async () => {
    const db = createDb({ advancePayment: [request()] });
    await expect(
      run(advancePaymentMutators.update, db, superAdminCtx, {
        ...advanceArgs,
        claimantBankAccountId: "acct-asha",
      })
    ).rejects.toThrow(CHOOSE_CLAIMANT_ACCOUNT_MESSAGE);
    expect(db.tables.advancePayment?.[0]).toMatchObject(STORED_PAYOUT);
  });
});
