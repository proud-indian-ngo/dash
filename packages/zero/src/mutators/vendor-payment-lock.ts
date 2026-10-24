import type { Transaction } from "@rocicorp/zero";

import { type Schema, zql } from "../schema";

/** Lock before reading status, lines or payments; hold through recalculation.
 * Bank matching locks payment rows, not this parent. Take any bank-match lock
 * before writing a payment row, so its existing lock order stays intact. */
export async function lockVendorPayment(tx: Transaction<Schema>, id: string) {
  if (tx.location !== "server") {
    return;
  }
  const { sql } = await import("drizzle-orm");
  const wrapped = tx.dbTransaction.wrappedTransaction as {
    execute: (query: unknown) => Promise<unknown>;
  };
  await wrapped.execute(
    sql`select id from vendor_payment where id = ${id} for update`
  );
}

/** Discover the immutable parent ID, then re-read after acquiring its lock. */
export async function lockedVendorPaymentTransaction(
  tx: Transaction<Schema>,
  id: string
) {
  const query = zql.vendorPaymentTransaction.where("id", id).one();
  const initial = await tx.run(query);
  if (!initial || tx.location !== "server") {
    return initial;
  }
  await lockVendorPayment(tx, initial.vendorPaymentId);
  const current = await tx.run(query);
  if (current && current.vendorPaymentId !== initial.vendorPaymentId) {
    throw new Error("Transaction changed; try again");
  }
  return current;
}
