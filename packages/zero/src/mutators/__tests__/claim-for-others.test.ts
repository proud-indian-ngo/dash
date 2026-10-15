import { beforeEach, describe, expect, it, mock } from "bun:test";

const enqueue = mock();
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));

import type { AsyncTask } from "../../context";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import {
  CHOOSE_CLAIMANT_ACCOUNT_MESSAGE,
  CLAIMANT_HAS_NO_ACCOUNT_MESSAGE,
} from "../claimant";
import { changeClaimantSchema, reimbursementMutators } from "../reimbursement";

type Row = Record<string, unknown>;

const UNALLOCATED = "01930000-0000-7000-8000-000000000009";

function createDb(
  seed: Partial<Record<string, Row[]>> = {},
  location: "client" | "server" = "server"
) {
  const tables: Record<string, Row[]> = {
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
        accountName: "Meena S",
        accountNumber: "999988887777",
        id: "acct-meena",
        ifscCode: "HDFC0001234",
        isDefault: true,
        userId: "meena",
      },
    ],
    programme: [{ active: true, id: UNALLOCATED, name: "Unallocated" }],
    reimbursement: [],
    reimbursementAttachment: [],
    reimbursementHistory: [],
    reimbursementLineItem: [],
    user: [
      { id: "asha", isActive: true, name: "Asha", role: "finance_admin" },
      { id: "ravi", isActive: true, name: "Ravi", role: "volunteer" },
      { id: "meena", isActive: true, name: "Meena", role: "volunteer" },
      { id: "nobank", isActive: true, name: "Nobank", role: "volunteer" },
      { id: "gone", isActive: false, name: "Gone", role: "volunteer" },
      { id: "guest", isActive: true, name: "Guest", role: "external_user" },
    ],
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
  const rows = (table: string): Row[] => tables[table] ?? [];
  return { rows, tables, tx };
}

function context(userId: string, permissions: string[]) {
  return {
    asyncTasks: [] as AsyncTask[],
    permissions,
    role: "finance_admin",
    traceId: "trace-1",
    userId,
  };
}

const financeCtx = () =>
  context("asha", [
    "requests.create",
    "requests.create_for_others",
    "requests.view_all",
  ]);
const volunteerCtx = () => context("ravi", ["requests.create"]);

const createArgs = {
  attachments: [],
  bankAccountIfscCode: "ICIC0000001",
  bankAccountName: "Asha's own account",
  bankAccountNumber: "000000000001",
  chargedTo: "organisation",
  expenseDate: Date.parse("2026-09-01"),
  id: "r-1",
  lineItems: [
    {
      amountPaise: 50_000,
      categoryId: "cat-1",
      description: "Auto fare",
      id: "li-1",
      sortOrder: 0,
    },
  ],
  title: "Travel",
};

async function runTasks(tasks: AsyncTask[]) {
  for (const task of tasks) {
    await task.fn();
  }
}

beforeEach(() => {
  enqueue.mockReset();
});

describe("reimbursement.create for someone else", () => {
  it("keeps a self-claim owned and raised by the submitter", async () => {
    const db = createDb();
    const ctx = volunteerCtx();
    await reimbursementMutators.create.fn({
      args: createArgs,
      ctx,
      tx: db.tx,
    } as never);
    const [row] = db.rows("reimbursement");
    expect(row).toMatchObject({
      bankAccountNumber: "000000000001",
      createdBy: "ravi",
      userId: "ravi",
    });
    expect(db.rows("reimbursementHistory")[0]?.note).toBeNull();
    await runTasks(ctx.asyncTasks);
    expect(enqueue.mock.calls.map(([name]) => name)).toEqual([
      "notify-reimbursement-submitted",
    ]);
  });

  it("refuses a claim for someone else without requests.create_for_others", async () => {
    const db = createDb();
    await expect(
      reimbursementMutators.create.fn({
        args: {
          ...createArgs,
          claimantBankAccountId: "acct-meena",
          claimantUserId: "meena",
        },
        ctx: volunteerCtx(),
        tx: db.tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
    expect(db.rows("reimbursement")).toHaveLength(0);
  });

  it("makes the claimant the owner, records the creator and pays the claimant's account", async () => {
    const db = createDb();
    const ctx = financeCtx();
    await reimbursementMutators.create.fn({
      args: {
        ...createArgs,
        claimantBankAccountId: "acct-ravi",
        claimantUserId: "ravi",
      },
      ctx,
      tx: db.tx,
    } as never);

    expect(db.rows("reimbursement")[0]).toMatchObject({
      bankAccountIfscCode: "SBIN0001234",
      bankAccountName: "Ravi Kumar",
      bankAccountNumber: "111122223333",
      createdBy: "asha",
      userId: "ravi",
    });
    expect(db.rows("reimbursementHistory")[0]).toMatchObject({
      action: "created",
      actorId: "asha",
      note: "Raised by Asha for Ravi",
    });

    await runTasks(ctx.asyncTasks);
    expect(enqueue).toHaveBeenCalledWith(
      "notify-reimbursement-submitted",
      {
        reimbursementId: "r-1",
        submitterName: "Asha for Ravi",
        title: "Travel",
      },
      { traceId: "trace-1" }
    );
    expect(enqueue).toHaveBeenCalledWith(
      "notify-reimbursement-raised-for-you",
      {
        claimantId: "ravi",
        raisedByName: "Asha",
        reimbursementId: "r-1",
        title: "Travel",
      },
      { traceId: "trace-1" }
    );
  });

  it("refuses a bank account that isn't the claimant's", async () => {
    const db = createDb();
    await expect(
      reimbursementMutators.create.fn({
        args: {
          ...createArgs,
          claimantBankAccountId: "acct-meena",
          claimantUserId: "ravi",
        },
        ctx: financeCtx(),
        tx: db.tx,
      } as never)
    ).rejects.toThrow(CHOOSE_CLAIMANT_ACCOUNT_MESSAGE);
    expect(db.rows("reimbursement")).toHaveLength(0);
  });

  it("refuses a claimant without a saved bank account", async () => {
    const db = createDb();
    await expect(
      reimbursementMutators.create.fn({
        args: { ...createArgs, claimantUserId: "nobank" },
        ctx: financeCtx(),
        tx: db.tx,
      } as never)
    ).rejects.toThrow(CLAIMANT_HAS_NO_ACCOUNT_MESSAGE);
  });

  it("refuses an inactive or external claimant", async () => {
    for (const claimantUserId of ["gone", "guest", "missing"]) {
      const db = createDb();
      await expect(
        reimbursementMutators.create.fn({
          args: { ...createArgs, claimantUserId },
          ctx: financeCtx(),
          tx: db.tx,
        } as never)
      ).rejects.toThrow("Choose an active member as the claimant");
    }
  });
});

function seededRequest(status: "approved" | "pending" | "rejected") {
  return createDb({
    reimbursement: [
      {
        bankAccountIfscCode: "SBIN0001234",
        bankAccountName: "Ravi Kumar",
        bankAccountNumber: "111122223333",
        createdBy: "asha",
        id: "r-1",
        rejectionReason: status === "rejected" ? "Duplicate" : null,
        status,
        title: "Travel",
        userId: "ravi",
      },
    ],
    reimbursementLineItem: [
      {
        amountPaise: 50_000,
        generateVoucher: true,
        id: "li-voucher",
        reimbursementId: "r-1",
        signedVoucherAttachmentId: "att-signed",
        voucherAttachmentId: "att-voucher",
      },
      {
        amountPaise: 20_000,
        generateVoucher: false,
        id: "li-plain",
        reimbursementId: "r-1",
        signedVoucherAttachmentId: null,
        voucherAttachmentId: null,
      },
    ],
  });
}

const changeArgs = {
  bankAccountId: "acct-meena",
  id: "r-1",
  previousUserId: "ravi",
  reason: "Meena paid for the auto, not Ravi",
  userId: "meena",
};

describe("reimbursement.changeClaimant", () => {
  for (const status of ["pending", "approved", "rejected"] as const) {
    it(`moves a ${status} request to the new claimant with a reason`, async () => {
      const db = seededRequest(status);
      const ctx = financeCtx();
      await reimbursementMutators.changeClaimant.fn({
        args: changeArgs,
        ctx,
        tx: db.tx,
      } as never);

      expect(db.rows("reimbursement")[0]).toMatchObject({
        bankAccountIfscCode: "HDFC0001234",
        bankAccountName: "Meena S",
        bankAccountNumber: "999988887777",
        createdBy: "asha",
        status,
        userId: "meena",
      });
      const history = db.rows("reimbursementHistory")[0];
      expect(history).toMatchObject({
        action: "updated",
        actorId: "asha",
        metadata: { fromUserId: "ravi", toUserId: "meena" },
        note: "Claimant changed from Ravi to Meena. Reason: Meena paid for the auto, not Ravi",
      });
      // The voucher printed the old claimant: unlinked, files kept.
      expect(
        db.rows("reimbursementLineItem").find((li) => li.id === "li-voucher")
      ).toMatchObject({
        signedVoucherAttachmentId: null,
        voucherAttachmentId: null,
      });

      await runTasks(ctx.asyncTasks);
      const names = enqueue.mock.calls.map(([name]) => name);
      expect(names).toContain("notify-reimbursement-claimant-changed");
      const notification = enqueue.mock.calls.find(
        ([name]) => name === "notify-reimbursement-claimant-changed"
      )?.[1] as Record<string, unknown>;
      expect(notification).toMatchObject({
        changedByName: "Asha",
        newClaimantId: "meena",
        newClaimantName: "Meena",
        previousClaimantId: "ravi",
        reason: changeArgs.reason,
        reimbursementId: "r-1",
        title: "Travel",
      });
      expect(typeof notification.changedAt).toBe("number");
      // Only an approved request gets a fresh voucher naming the new claimant.
      expect(names.includes("generate-cash-voucher")).toBe(
        status === "approved"
      );
    });
  }

  it("queues fresh vouchers only for opted-in items on an approved request", async () => {
    const db = seededRequest("approved");
    const ctx = financeCtx();
    await reimbursementMutators.changeClaimant.fn({
      args: changeArgs,
      ctx,
      tx: db.tx,
    } as never);
    await runTasks(ctx.asyncTasks);
    expect(
      enqueue.mock.calls.filter(([name]) => name === "generate-cash-voucher")
    ).toEqual([
      [
        "generate-cash-voucher",
        {
          approverUserId: "asha",
          lineItemId: "li-voucher",
          reimbursementId: "r-1",
        },
        { singletonKey: "voucher-li-voucher", traceId: "trace-1" },
      ],
    ]);
  });

  it("needs requests.create_for_others", async () => {
    const db = seededRequest("pending");
    await expect(
      reimbursementMutators.changeClaimant.fn({
        args: changeArgs,
        ctx: context("asha", ["requests.view_all", "requests.approve"]),
        tx: db.tx,
      } as never)
    ).rejects.toThrow("Unauthorized");
    expect(db.rows("reimbursement")[0]?.userId).toBe("ravi");
  });

  it("requires a reason", () => {
    expect(
      changeClaimantSchema.safeParse({ ...changeArgs, reason: "   " }).success
    ).toBe(false);
  });

  it("refuses when the claimant changed meanwhile or is unchanged", async () => {
    const db = seededRequest("pending");
    await expect(
      reimbursementMutators.changeClaimant.fn({
        args: { ...changeArgs, previousUserId: "someone-else" },
        ctx: financeCtx(),
        tx: db.tx,
      } as never)
    ).rejects.toThrow("The claimant changed meanwhile");
    await expect(
      reimbursementMutators.changeClaimant.fn({
        args: { ...changeArgs, bankAccountId: "acct-ravi", userId: "ravi" },
        ctx: financeCtx(),
        tx: db.tx,
      } as never)
    ).rejects.toThrow("already the claimant");
  });

  it("refuses the previous claimant's bank account", async () => {
    const db = seededRequest("approved");
    await expect(
      reimbursementMutators.changeClaimant.fn({
        args: { ...changeArgs, bankAccountId: "acct-ravi" },
        ctx: financeCtx(),
        tx: db.tx,
      } as never)
    ).rejects.toThrow(CHOOSE_CLAIMANT_ACCOUNT_MESSAGE);
    expect(db.rows("reimbursement")[0]?.bankAccountNumber).toBe("111122223333");
  });

  it("requires choosing an account when the new claimant has one", async () => {
    const db = seededRequest("pending");
    await expect(
      reimbursementMutators.changeClaimant.fn({
        args: { ...changeArgs, bankAccountId: null },
        ctx: financeCtx(),
        tx: db.tx,
      } as never)
    ).rejects.toThrow(CHOOSE_CLAIMANT_ACCOUNT_MESSAGE);
  });

  it("clears the bank details when the new claimant has no saved account", async () => {
    const db = seededRequest("pending");
    await reimbursementMutators.changeClaimant.fn({
      args: { ...changeArgs, bankAccountId: null, userId: "nobank" },
      ctx: financeCtx(),
      tx: db.tx,
    } as never);
    expect(db.rows("reimbursement")[0]).toMatchObject({
      bankAccountIfscCode: null,
      bankAccountName: null,
      bankAccountNumber: null,
      userId: "nobank",
    });
  });
});
