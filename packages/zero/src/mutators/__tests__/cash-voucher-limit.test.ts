import { beforeEach, describe, expect, it, mock } from "bun:test";

const enqueue = mock();
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));

import type { Context } from "../../context";
import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { appConfigMutators, assertCanWriteAppConfig } from "../app-config";
import { createSchema, reimbursementMutators } from "../reimbursement";

type Row = Record<string, unknown>;

const KEY = "cash_voucher_limit_paise";

function createDb(
  location: "client" | "server",
  seed: Partial<Record<string, Row[]>> = {}
) {
  const tables: Record<string, Row[]> = {
    appConfig: [],
    reimbursement: [],
    reimbursementHistory: [],
    reimbursementLineItem: [],
    ...seed,
  };
  const inserts: { row: Row; table: string }[] = [];
  const tableApi = (table: string) => ({
    delete: async () => {},
    insert: async (row: Row) => {
      inserts.push({ row, table });
    },
    update: async () => {},
    upsert: async (row: Row) => {
      inserts.push({ row, table });
    },
  });
  const tx = {
    location,
    mutate: Object.fromEntries(
      Object.keys(tables).map((table) => [table, tableApi(table)])
    ),
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
  return { inserts, tx };
}

const limit = (paise: number) => ({
  appConfig: [{ key: KEY, value: String(paise) }],
});

const serverContext = (permissions: string[]): Context => ({
  asyncTasks: [],
  beforeCommitTasks: [],
  copyR2Object: mock(),
  enqueue: mock() as unknown as Context["enqueue"],
  lockR2Object: mock(),
  lockR2ObjectForClaim: mock(),
  permissions,
  r2KeyPrefix: "app",
  role: "admin",
  rollbackTasks: [],
  traceId: "trace-1",
  userId: "approver-1",
});

const approvedRequest = {
  id: "request-1",
  status: "approved",
  title: "Hall clean-up",
  userId: "owner-1",
};

beforeEach(() => {
  enqueue.mockReset();
});

describe("cash voucher limit setting", () => {
  const finance = { permissions: ["finance.manage"], userId: "u" };

  it("lets finance.manage set the limit", async () => {
    expect(() => assertCanWriteAppConfig(finance as never, KEY)).not.toThrow();
    const db = createDb("server");
    await appConfigMutators.upsert.fn({
      args: { key: KEY, value: "200000" },
      ctx: finance,
      tx: db.tx,
    } as never);
    expect(db.inserts.map((insert) => insert.row.value)).toEqual(["200000"]);
  });

  it("refuses finance.view", () => {
    expect(() =>
      assertCanWriteAppConfig(
        { permissions: ["finance.view"], userId: "u" } as never,
        KEY
      )
    ).toThrow("Unauthorized");
  });

  it.each(["1000100", "99", "0", "-100", "abc", "1e5"])(
    "refuses %s paise, outside ₹1 to ₹10,000",
    async (value) => {
      const db = createDb("server");
      await expect(
        appConfigMutators.upsert.fn({
          args: { key: KEY, value },
          ctx: finance,
          tx: db.tx,
        } as never)
      ).rejects.toThrow("The voucher limit must be between ₹1 and ₹10,000");
      expect(db.inserts).toEqual([]);
    }
  );

  it("accepts the ₹10,000 cap and ₹1", async () => {
    const db = createDb("server");
    for (const value of ["1000000", "100"]) {
      await appConfigMutators.upsert.fn({
        args: { key: KEY, value },
        ctx: finance,
        tx: db.tx,
      } as never);
    }
    expect(db.inserts).toHaveLength(2);
  });
});

describe("reimbursement.generateVoucher with the configured limit", () => {
  const item = (amountPaise: number) => ({
    amountPaise,
    id: "li-1",
    reimbursementId: "request-1",
  });

  it("refuses a ₹2,000 item under the ₹1,000 default", async () => {
    const db = createDb("server", {
      reimbursement: [approvedRequest],
      reimbursementLineItem: [item(200_000)],
    });
    await expect(
      reimbursementMutators.generateVoucher.fn({
        args: { lineItemId: "li-1", reimbursementId: "request-1" },
        ctx: serverContext(["requests.approve"]),
        tx: db.tx,
      } as never)
    ).rejects.toThrow("Vouchers can only be generated for items ≤ ₹1,000");
  });

  it("queues a ₹2,000 item once the limit is ₹2,000", async () => {
    const ctx = serverContext(["requests.approve"]);
    const db = createDb("server", {
      ...limit(200_000),
      reimbursement: [approvedRequest],
      reimbursementLineItem: [item(200_000)],
    });
    await reimbursementMutators.generateVoucher.fn({
      args: { lineItemId: "li-1", reimbursementId: "request-1" },
      ctx,
      tx: db.tx,
    } as never);
    await ctx.asyncTasks?.[0]?.fn();
    expect(enqueue).toHaveBeenCalledWith(
      "generate-cash-voucher",
      {
        approverUserId: "approver-1",
        lineItemId: "li-1",
        reimbursementId: "request-1",
      },
      { singletonKey: "voucher-li-1", traceId: "trace-1" }
    );
  });

  it("names the configured limit when refusing", async () => {
    const db = createDb("server", {
      ...limit(200_000),
      reimbursement: [approvedRequest],
      reimbursementLineItem: [item(200_001)],
    });
    await expect(
      reimbursementMutators.generateVoucher.fn({
        args: { lineItemId: "li-1", reimbursementId: "request-1" },
        ctx: serverContext(["requests.approve"]),
        tx: db.tx,
      } as never)
    ).rejects.toThrow("Vouchers can only be generated for items ≤ ₹2,000");
  });

  it("falls back to the default when the stored value is past the cap", async () => {
    const db = createDb("server", {
      appConfig: [{ key: KEY, value: "5000000" }],
      reimbursement: [approvedRequest],
      reimbursementLineItem: [item(200_000)],
    });
    await expect(
      reimbursementMutators.generateVoucher.fn({
        args: { lineItemId: "li-1", reimbursementId: "request-1" },
        ctx: serverContext(["requests.approve"]),
        tx: db.tx,
      } as never)
    ).rejects.toThrow("≤ ₹1,000");
  });
});

describe("reimbursement.approve with the configured limit", () => {
  it("queues vouchers for opted-in items up to the configured limit", async () => {
    const ctx = serverContext(["requests.approve"]);
    const db = createDb("server", {
      ...limit(200_000),
      reimbursement: [
        {
          approvalScreenshotKey:
            "app/approval-screenshots/tmp/approver-1/proof.png",
          id: "request-1",
          status: "pending",
          title: "Hall clean-up",
          userId: "owner-1",
        },
      ],
      reimbursementLineItem: [
        {
          amountPaise: 200_000,
          generateVoucher: true,
          id: "li-in",
          reimbursementId: "request-1",
        },
        {
          amountPaise: 200_001,
          generateVoucher: true,
          id: "li-over",
          reimbursementId: "request-1",
        },
      ],
    });
    await reimbursementMutators.approve.fn({
      args: { id: "request-1" },
      ctx,
      tx: db.tx,
    } as never);
    const task = ctx.asyncTasks?.find(
      (t) => t.meta.mutator === "approveReimbursement"
    );
    await task?.fn();
    const voucherItems = enqueue.mock.calls
      .filter(([name]) => name === "generate-cash-voucher")
      .map(([, payload]) => (payload as { lineItemId: string }).lineItemId);
    expect(voucherItems).toEqual(["li-in"]);
  });
});

describe("reimbursement.create voucher fields", () => {
  const args = (lineItems: Row[]) => ({
    attachments: [],
    chargedTo: "organisation",
    city: "bangalore",
    expenseDate: new Date("2026-10-01").getTime(),
    id: "request-2",
    lineItems,
    title: "Hall clean-up",
  });
  const lineItem = (id: string, amountPaise: number, extra: Row = {}) => ({
    amountPaise,
    categoryId: "cat-1",
    description: "Cleaning",
    generateVoucher: true,
    id,
    payeePhone: "+919876543210",
    sortOrder: 0,
    ...extra,
  });

  it("keeps the opt-in and phone within the limit and drops them above it", async () => {
    const db = createDb("client", limit(200_000));
    await reimbursementMutators.create.fn({
      args: createSchema.parse(
        args([
          lineItem("li-in", 200_000),
          lineItem("li-over", 200_001),
          lineItem("li-no-voucher", 50_000, { generateVoucher: false }),
        ])
      ),
      ctx: {
        permissions: ["requests.create"],
        role: "volunteer",
        userId: "owner-1",
      },
      tx: db.tx,
    } as never);
    const items = db.inserts
      .filter((insert) => insert.table === "reimbursementLineItem")
      .map(({ row }) => [row.id, row.generateVoucher, row.payeePhone]);
    expect(items).toEqual([
      ["li-in", true, "+919876543210"],
      ["li-over", false, null],
      ["li-no-voucher", false, null],
    ]);
  });

  it("refuses a payee phone that isn't an Indian mobile", () => {
    const result = createSchema.safeParse(
      args([lineItem("li-1", 50_000, { payeePhone: "+14155550123" })])
    );
    expect(result.success).toBe(false);
  });

  it("accepts a missing payee phone", () => {
    const result = createSchema.safeParse(
      args([lineItem("li-1", 50_000, { payeePhone: null })])
    );
    expect(result.success).toBe(true);
  });
});
