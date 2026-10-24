import type { Transaction } from "@rocicorp/zero";

import type { Schema } from "../schema";

/** Zero inserts ignore primary-key conflicts. Serialize creators before checking
 * existence so dependent writes can only follow a new parent, even across clients.
 * Every create path for a table must use the same table key. UUID parsing also
 * gives alternate spellings of the same primary key the same lock. */
export async function assertNewRecord(
  tx: Transaction<Schema>,
  table: string,
  id: string,
  exists: () => Promise<unknown>
): Promise<void> {
  if (tx.location === "server") {
    const { sql } = await import("drizzle-orm");
    const wrapped = tx.dbTransaction.wrappedTransaction as {
      execute: (query: unknown) => Promise<unknown>;
    };
    await wrapped.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`create:${table}`}), hashtext(${id}::uuid::text))`
    );
  }
  if (await exists()) {
    throw new Error("Record already exists");
  }
}
