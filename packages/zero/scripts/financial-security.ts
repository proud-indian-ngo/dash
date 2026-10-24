import assert from "node:assert/strict";
import path from "node:path";

import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { uuidv7 } from "uuidv7";

import { advancePaymentMutators } from "../src/mutators/advance-payment";
import { reimbursementMutators } from "../src/mutators/reimbursement";
import { vendorPaymentMutators } from "../src/mutators/vendor-payment";
import { vendorPaymentTransactionMutators } from "../src/mutators/vendor-payment-transaction";
import { schema, zql } from "../src/schema";

// Failure cases: duplicate parent IDs must leave exactly one parent and one set
// of children, including concurrent independent transactions; payments racing
// for the same balance must not both commit. Run only on the E2E database.
const url = new URL(
  process.env.FINANCIAL_TEST_DB_URL ?? process.env.DATABASE_URL ?? ""
);
assert(
  ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.pathname === "/pi-dash-test",
  "Requires disposable local pi-dash-test database"
);
const client = new SQL(url.toString(), { max: 5 });
const db = drizzle({ client });
if (process.argv.includes("--migrate")) {
  await migrate(db, {
    migrationsFolder: path.resolve(
      import.meta.dirname,
      "../../db/src/migrations"
    ),
  });
}
const zero = zeroDrizzle(schema, db);
const userId = uuidv7();
const approverId = uuidv7();
const categoryId = uuidv7();
const vendorId = uuidv7();
const now = Date.now();
await client`insert into "user" (id, name, email, email_verified, created_at, updated_at, role) values (${userId}, 'Financial security claimant', ${`${userId}@example.test`}, true, now(), now(), 'volunteer'), (${approverId}, 'Financial security approver', ${`${approverId}@example.test`}, true, now(), now(), 'finance_admin')`;
await client`insert into expense_category (id, name, created_at, updated_at) values (${categoryId}, ${`Security ${categoryId}`}, now(), now())`;
await client`insert into party (id, display_name, kind, created_at, updated_at) values (${vendorId}, 'Security vendor', 'organisation', now(), now())`;
await client`insert into vendor (id, name, status, created_at, updated_at) values (${vendorId}, 'Security vendor', 'approved', now(), now())`;
const ctx = {
  permissions: [
    "requests.create",
    "requests.record_payment",
    "requests.approve",
  ],
  role: "finance_admin",
  userId,
};
const args = (id: string) => ({
  attachments: [],
  chargedTo: "organisation",
  expenseDate: Date.UTC(2026, 8, 1),
  id,
  lineItems: [
    {
      amountPaise: 10000,
      sortOrder: 0,
      categoryId,
      description: "Expense",
      id: uuidv7(),
    },
  ],
  title: "Security test",
  vendorId,
});
const report: Record<string, unknown> = {
  isolation: (await client`show transaction_isolation`)[0]
    .transaction_isolation,
};
try {
  for (const [table, mutator] of [
    ["reimbursement", reimbursementMutators.create],
    ["vendorPayment", vendorPaymentMutators.create],
    ["advancePayment", advancePaymentMutators.create],
  ] as const) {
    const id = uuidv7();
    const results = await Promise.allSettled(
      [id, `{${id.toUpperCase()}}`].map((suppliedId) =>
        zero.transaction((tx) =>
          mutator.fn({ args: args(suppliedId), ctx, tx } as never)
        )
      )
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const children =
      table === "reimbursement"
        ? await zero.run(zql.reimbursementLineItem.where("reimbursementId", id))
        : table === "vendorPayment"
          ? await zero.run(
              zql.vendorPaymentLineItem.where("vendorPaymentId", id)
            )
          : await zero.run(
              zql.advancePaymentLineItem.where("advancePaymentId", id)
            );
    report[table] = {
      fulfilled,
      children: children.length,
      errors: results
        .filter((r) => r.status === "rejected")
        .map((r) => String(r.reason)),
    };
  }
  const vpId = uuidv7();
  await zero.transaction(async (tx) => {
    await vendorPaymentMutators.create.fn({
      args: args(vpId),
      ctx,
      tx,
    } as never);
    await tx.mutate.vendorPayment.update({ id: vpId, status: "approved" });
  });
  // Hold the parent row so both unprotected calls read the same balance before
  // either can recalculate its parent's status. A correct lock blocks the reads.
  let release!: () => void;
  let locked!: () => void;
  const ready = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = client.begin(async (sql) => {
    await sql`select id from vendor_payment where id = ${vpId} for update`;
    locked();
    await gate;
  });
  await ready;
  const pending = [1, 2].map(() =>
    zero.transaction((tx) =>
      vendorPaymentTransactionMutators.create.fn({
        tx,
        ctx: { ...ctx, userId: approverId },
        args: {
          id: uuidv7(),
          vendorPaymentId: vpId,
          amountPaise: 10000,
          attachments: [],
          transactionDate: now,
        },
      } as never)
    )
  );
  let blocked = 0;
  try {
    for (let attempt = 0; attempt < 200; attempt++) {
      const rows =
        await client`select count(*)::int as count from pg_stat_activity where datname = current_database() and cardinality(pg_blocking_pids(pid)) > 0 and query like '%vendor_payment%'`;
      blocked = rows[0].count;
      if (blocked >= 2) break;
      await Bun.sleep(10);
    }
  } finally {
    release();
    await holder;
  }
  assert.equal(
    blocked,
    2,
    "Both independent transactions reached the contested parent"
  );
  const payments = await Promise.allSettled(pending);
  const total =
    await client`select coalesce(sum(amount_paise),0)::int as total from vendor_payment_transaction where vendor_payment_id = ${vpId}`;
  report.balance = {
    fulfilled: payments.filter((r) => r.status === "fulfilled").length,
    total: total[0].total,
    errors: payments
      .filter((r) => r.status === "rejected")
      .map((r) => String(r.reason)),
  };
  const duplicateParentId = uuidv7();
  await zero.transaction(async (tx) => {
    const request = args(duplicateParentId);
    request.lineItems[0]!.amountPaise = 30000;
    await vendorPaymentMutators.create.fn({ args: request, ctx, tx } as never);
    await tx.mutate.vendorPayment.update({
      id: duplicateParentId,
      status: "approved",
    });
  });
  const transactionId = uuidv7();
  const duplicates = await Promise.allSettled(
    [transactionId, `{${transactionId.toUpperCase()}}`].map((suppliedId) =>
      zero.transaction((tx) =>
        vendorPaymentTransactionMutators.create.fn({
          tx,
          ctx: { ...ctx, userId: approverId },
          args: {
            id: suppliedId,
            vendorPaymentId: duplicateParentId,
            amountPaise: 10000,
            transactionDate: now,
            attachments: [
              { id: uuidv7(), type: "url", url: "https://example.test/proof" },
            ],
          },
        } as never)
      )
    )
  );
  const attachments = await zero.run(
    zql.vendorPaymentTransactionAttachment.where(
      "vendorPaymentTransactionId",
      transactionId
    )
  );
  const history = await zero.run(
    zql.vendorPaymentTransactionHistory.where(
      "vendorPaymentTransactionId",
      transactionId
    )
  );
  report.vendorPaymentTransaction = {
    fulfilled: duplicates.filter((r) => r.status === "fulfilled").length,
    attachments: attachments.length,
    history: history.length,
  };
  console.log(JSON.stringify(report));
  assert.equal(
    duplicates.filter((r) => r.status === "fulfilled").length,
    1,
    "Only one transaction create commits"
  );
  assert.equal(
    attachments.length,
    1,
    "Duplicate transaction does not attach files"
  );
  assert.equal(
    history.length,
    2,
    "Exactly one created and auto-approved history pair"
  );
  for (const table of ["reimbursement", "vendorPayment", "advancePayment"]) {
    assert.equal(
      (report[table] as { fulfilled: number }).fulfilled,
      1,
      `${table}: only one create commits`
    );
    assert.equal(
      (report[table] as { children: number }).children,
      1,
      `${table}: one child set`
    );
  }
  assert.equal(
    total[0].total,
    10000,
    "Concurrent payments must not exceed the balance"
  );
} finally {
  await client`delete from "user" where id in (${userId}, ${approverId})`;
  await client`delete from vendor where id = ${vendorId}`;
  await client`delete from party where id = ${vendorId}`;
  await client`delete from expense_category where id = ${categoryId}`;
  await client.close();
}
