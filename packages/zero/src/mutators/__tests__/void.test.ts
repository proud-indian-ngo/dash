import { beforeEach, describe, expect, it, mock } from "bun:test";

const enqueue = mock();
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));

import {
  MATCHED_TO_BANK_MESSAGE,
  POSTED_DELETE_MESSAGE,
  VOIDED_DELETE_MESSAGE,
  VOIDED_MESSAGE,
} from "@pi-dash/shared/ledger";

import type { AsyncTask } from "../../context";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { reimbursementMutators } from "../reimbursement";
import { vendorPaymentMutators } from "../vendor-payment";
import { vendorPaymentTransactionMutators } from "../vendor-payment-transaction";

type Row = Record<string, unknown>;

function createDb(
  seed: Partial<Record<string, Row[]>> = {},
  location: "client" | "server" = "server"
) {
  const tables: Record<string, Row[]> = {
    posting: [],
    reimbursement: [
      {
        approvalScreenshotKey: null,
        chargedTo: "organisation",
        id: "r-1",
        status: "approved",
        title: "Travel",
        userId: "ravi",
        voidedAt: null,
      },
    ],
    reimbursementAttachment: [],
    reimbursementHistory: [],
    reimbursementLineItem: [
      {
        amountPaise: 50_000,
        id: "li-1",
        reimbursementId: "r-1",
        voucherAttachmentId: "att-voucher",
      },
    ],
    vendorPayment: [
      {
        approvalScreenshotKey: null,
        id: "vp-1",
        status: "paid",
        title: "Sound system",
        userId: "ravi",
        voidedAt: null,
      },
    ],
    vendorPaymentAttachment: [],
    vendorPaymentHistory: [],
    vendorPaymentLineItem: [
      { amountPaise: 10_000, id: "vli-1", vendorPaymentId: "vp-1" },
    ],
    vendorPaymentTransaction: [
      {
        amountPaise: 10_000,
        id: "vpt-1",
        status: "approved",
        userId: "ravi",
        vendorPaymentId: "vp-1",
        voidedAt: null,
      },
    ],
    statementAllocation: [],
    vendorPaymentTransactionAttachment: [],
    vendorPaymentTransactionHistory: [],
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

/** A standing posting for the source: the books hold it. */
const posted = (sourceType: string, sourceId: string): Row => ({
  id: `p-${sourceId}`,
  reversesPostingId: null,
  sourceId,
  sourceType,
});

function context(permissions: string[]) {
  return {
    asyncTasks: [] as AsyncTask[],
    enqueue,
    permissions,
    role: "finance_admin",
    traceId: "trace-1",
    userId: "asha",
  };
}

const financeCtx = () =>
  context([
    "requests.approve",
    "requests.delete_all",
    "requests.edit_all_statuses",
    "requests.view_all",
    "requests.void",
    "finance.manage",
  ]);

function run(
  mutator: { fn: (input: never) => Promise<void> },
  db: ReturnType<typeof createDb>,
  ctx: ReturnType<typeof context>,
  args: Row
) {
  return mutator.fn({ args, ctx, tx: db.tx } as never);
}

async function runTasks(tasks: AsyncTask[]) {
  for (const task of tasks) {
    await task.fn();
  }
}

const ledgerJobs = () =>
  enqueue.mock.calls
    .filter(([name]) => name === "ledger-post-source")
    .map(([, payload]) => payload);

beforeEach(() => {
  enqueue.mockReset();
});

describe("deleting what the books hold", () => {
  it("refuses a posted reimbursement and keeps it", async () => {
    const db = createDb({ posting: [posted("reimbursement", "r-1")] });
    await expect(
      run(reimbursementMutators.delete, db, financeCtx(), { id: "r-1" })
    ).rejects.toThrow(POSTED_DELETE_MESSAGE);
    expect(db.rows("reimbursement")).toHaveLength(1);
    expect(db.rows("reimbursementLineItem")).toHaveLength(1);
  });

  it("still deletes one the books don't hold, or hold only reversed", async () => {
    const db = createDb({
      posting: [
        posted("reimbursement", "r-1"),
        {
          id: "p-rev",
          reversesPostingId: "p-r-1",
          sourceId: "r-1",
          sourceType: "reimbursement",
        },
      ],
    });
    await run(reimbursementMutators.delete, db, financeCtx(), { id: "r-1" });
    expect(db.rows("reimbursement")).toHaveLength(0);
  });

  it("refuses a vendor payment request when only a payment is posted", async () => {
    const db = createDb({
      posting: [posted("vendor_payment_transaction", "vpt-1")],
    });
    await expect(
      run(vendorPaymentMutators.delete, db, financeCtx(), { id: "vp-1" })
    ).rejects.toThrow(POSTED_DELETE_MESSAGE);
    expect(db.rows("vendorPayment")).toHaveLength(1);
    expect(db.rows("vendorPaymentLineItem")).toHaveLength(1);
  });

  it("refuses a posted vendor payment", async () => {
    const db = createDb({
      posting: [posted("vendor_payment_transaction", "vpt-1")],
    });
    await expect(
      run(vendorPaymentTransactionMutators.delete, db, financeCtx(), {
        id: "vpt-1",
      })
    ).rejects.toThrow(POSTED_DELETE_MESSAGE);
    expect(db.rows("vendorPaymentTransaction")).toHaveLength(1);
  });

  it("refuses a voided request even once its postings are reversed", async () => {
    const db = createDb();
    await run(reimbursementMutators.void, db, financeCtx(), {
      id: "r-1",
      reason: "Paid twice",
    });
    await expect(
      run(reimbursementMutators.delete, db, financeCtx(), { id: "r-1" })
    ).rejects.toThrow(VOIDED_DELETE_MESSAGE);
  });
});

describe("reimbursement.void", () => {
  it("keeps the request and its voucher, records the reason in history and queues the reversal", async () => {
    const db = createDb({ posting: [posted("reimbursement", "r-1")] });
    const ctx = financeCtx();
    await run(reimbursementMutators.void, db, ctx, {
      id: "r-1",
      reason: "Paid twice by mistake",
    });
    expect(db.rows("reimbursement")[0]).toMatchObject({
      status: "approved",
      voidedBy: "asha",
      voidReason: "Paid twice by mistake",
    });
    expect(typeof db.rows("reimbursement")[0]?.voidedAt).toBe("number");
    // The voucher stays linked: its number stays used.
    expect(db.rows("reimbursementLineItem")[0]).toMatchObject({
      voucherAttachmentId: "att-voucher",
    });
    expect(db.rows("reimbursementHistory")).toMatchObject([
      { action: "voided", actorId: "asha", note: "Paid twice by mistake" },
    ]);
    await runTasks(ctx.asyncTasks);
    expect(ledgerJobs()).toEqual([
      { sourceId: "r-1", sourceType: "reimbursement" },
    ]);
  });

  it("is idempotent: voiding again changes nothing", async () => {
    const db = createDb();
    await run(reimbursementMutators.void, db, financeCtx(), {
      id: "r-1",
      reason: "First",
    });
    const first = { ...db.rows("reimbursement")[0] };
    const ctx = financeCtx();
    await run(reimbursementMutators.void, db, ctx, {
      id: "r-1",
      reason: "Second",
    });
    expect(db.rows("reimbursement")[0]).toEqual(first);
    expect(db.rows("reimbursementHistory")).toHaveLength(1);
    expect(ctx.asyncTasks).toEqual([]);
  });

  it("needs requests.void and a reason", async () => {
    const db = createDb();
    await expect(
      run(reimbursementMutators.void, db, context(["requests.approve"]), {
        id: "r-1",
        reason: "x",
      })
    ).rejects.toThrow();
    expect(
      reimbursementMutators.void.validator?.["~standard"].validate({
        id: "r-1",
        reason: "   ",
      })
    ).toMatchObject({ issues: expect.any(Array) });
    expect(db.rows("reimbursement")[0]?.voidedAt).toBeNull();
  });

  it("blocks every further transition on a voided request", async () => {
    const db = createDb();
    const ctx = financeCtx();
    await run(reimbursementMutators.void, db, ctx, {
      id: "r-1",
      reason: "Duplicate",
    });
    const attempts: [keyof typeof reimbursementMutators, Row][] = [
      ["approve", { id: "r-1" }],
      ["reject", { id: "r-1", reason: "No" }],
      ["resetToPending", { id: "r-1" }],
      ["setChargedTo", { chargedTo: "organisation", id: "r-1" }],
      [
        "changeClaimant",
        {
          id: "r-1",
          previousUserId: "ravi",
          reason: "Someone else",
          userId: "meena",
        },
      ],
      ["generateVoucher", { lineItemId: "li-1", reimbursementId: "r-1" }],
    ];
    const refusals: string[] = [];
    for (const [name, args] of attempts) {
      try {
        await run(
          reimbursementMutators[name] as never,
          db,
          context([...ctx.permissions, "requests.create_for_others"]),
          args
        );
        refusals.push(`${name}: allowed`);
      } catch (error) {
        refusals.push(`${name}: ${(error as Error).message}`);
      }
    }
    expect(refusals).toEqual(
      attempts.map(([name]) => `${name}: ${VOIDED_MESSAGE}`)
    );
    expect(db.rows("reimbursement")[0]).toMatchObject({ status: "approved" });
  });
});

describe("vendorPayment.void", () => {
  it("voids the request and each of its payments, and queues all of them", async () => {
    const db = createDb();
    const ctx = financeCtx();
    await run(vendorPaymentMutators.void, db, ctx, {
      id: "vp-1",
      reason: "Wrong vendor",
    });
    expect(db.rows("vendorPayment")[0]).toMatchObject({
      voidReason: "Wrong vendor",
    });
    expect(db.rows("vendorPaymentTransaction")[0]).toMatchObject({
      voidReason: "Wrong vendor",
    });
    expect(db.rows("vendorPaymentTransactionHistory")).toMatchObject([
      { action: "voided" },
    ]);
    await runTasks(ctx.asyncTasks);
    expect(ledgerJobs()).toEqual([
      { sourceId: "vp-1", sourceType: "vendor_payment" },
      { sourceId: "vpt-1", sourceType: "vendor_payment_transaction" },
    ]);
  });

  it("blocks recording, approving or editing payments on a voided request", async () => {
    const db = createDb({
      vendorPaymentTransaction: [
        {
          amountPaise: 5000,
          id: "vpt-2",
          status: "pending",
          userId: "ravi",
          vendorPaymentId: "vp-1",
          voidedAt: null,
        },
      ],
    });
    const ctx = financeCtx();
    await run(vendorPaymentMutators.void, db, ctx, {
      id: "vp-1",
      reason: "Wrong vendor",
    });
    await expect(
      run(vendorPaymentTransactionMutators.approve, db, ctx, { id: "vpt-2" })
    ).rejects.toThrow(VOIDED_MESSAGE);
    await expect(
      run(vendorPaymentMutators.approveInvoice as never, db, ctx, {
        id: "vp-1",
      })
    ).rejects.toThrow(VOIDED_MESSAGE);
  });
});

describe("vendorPaymentTransaction.void", () => {
  it("voids one payment, which then counts as unpaid", async () => {
    const db = createDb();
    const ctx = financeCtx();
    await run(vendorPaymentTransactionMutators.void, db, ctx, {
      id: "vpt-1",
      reason: "Bounced",
    });
    expect(db.rows("vendorPaymentTransaction")[0]).toMatchObject({
      status: "approved",
      voidReason: "Bounced",
    });
    // Paid in full before; with the payment void nothing is paid.
    expect(db.rows("vendorPayment")[0]?.status).not.toBe("paid");
    await runTasks(ctx.asyncTasks);
    expect(ledgerJobs()).toEqual([
      { sourceId: "vpt-1", sourceType: "vendor_payment_transaction" },
      { sourceId: "vp-1", sourceType: "vendor_payment" },
    ]);
  });
});

describe("records a bank debit is matched to (layer 3-3b)", () => {
  const allocation = (over: Row): Row => ({
    id: `sa-${String(over.reimbursementId ?? over.vendorPaymentTransactionId)}`,
    releasedAt: null,
    reimbursementId: null,
    vendorPaymentTransactionId: null,
    ...over,
  });

  it("refuses to void or delete a matched reimbursement, and allows it once released", async () => {
    const db = createDb({
      statementAllocation: [allocation({ reimbursementId: "r-1" })],
    });
    await expect(
      run(reimbursementMutators.void, db, financeCtx(), {
        id: "r-1",
        reason: "Duplicate",
      })
    ).rejects.toThrow(MATCHED_TO_BANK_MESSAGE);
    await expect(
      run(reimbursementMutators.delete, db, financeCtx(), { id: "r-1" })
    ).rejects.toThrow(MATCHED_TO_BANK_MESSAGE);
    expect(db.rows("reimbursement")[0]?.voidedAt).toBeNull();

    const released = createDb({
      statementAllocation: [
        allocation({ releasedAt: 1, reimbursementId: "r-1" }),
      ],
    });
    await run(reimbursementMutators.void, released, financeCtx(), {
      id: "r-1",
      reason: "Duplicate",
    });
    expect(released.rows("reimbursement")[0]?.voidedAt).toBeNumber();
  });

  it("refuses to void a vendor payment request or payment a debit pays", async () => {
    const db = createDb({
      statementAllocation: [
        allocation({ vendorPaymentTransactionId: "vpt-1" }),
      ],
    });
    await expect(
      run(vendorPaymentMutators.void, db, financeCtx(), {
        id: "vp-1",
        reason: "Wrong vendor",
      })
    ).rejects.toThrow(MATCHED_TO_BANK_MESSAGE);
    await expect(
      run(vendorPaymentTransactionMutators.void, db, financeCtx(), {
        id: "vpt-1",
        reason: "Wrong vendor",
      })
    ).rejects.toThrow(MATCHED_TO_BANK_MESSAGE);
    expect(db.rows("vendorPayment")[0]?.voidedAt).toBeNull();
    expect(db.rows("vendorPaymentTransaction")[0]?.voidedAt).toBeNull();
  });

  it("leaves the check to the server", async () => {
    const db = createDb(
      { statementAllocation: [allocation({ reimbursementId: "r-1" })] },
      "client"
    );
    await run(reimbursementMutators.void, db, financeCtx(), {
      id: "r-1",
      reason: "Duplicate",
    });
    expect(db.rows("reimbursement")[0]?.voidedAt).toBeNumber();
  });
});
