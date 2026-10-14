import { sql } from "drizzle-orm";

import { db } from "..";
import {
  LEDGER_FUNCTION_STATEMENTS,
  LEDGER_GUARD_VERSION,
  LEDGER_TRIGGERS,
} from "./immutability-sql";

/**
 * Database guards that keep the books append-only. Migrations 0133 and 0134
 * install them in migrated databases; `ensureLedgerTriggers` installs the
 * same definitions in databases built with `drizzle-kit push` (CI E2E,
 * isolated worktrees) and is a no-op when they are already in place, so a
 * server start runs no DDL on a migrated database.
 *
 * - `posting`, `ledger_entry`, `account_movement`, `movement_allocation`:
 *   no UPDATE or DELETE.
 * - `fiscal_year_event`: no UPDATE or DELETE, except its actor becoming
 *   NULL when that login is deleted.
 * - `opening_balance`: no DELETE; the only UPDATEs are the one-time
 *   reversal stamp and a creator or reverser becoming NULL when that login
 *   is deleted.
 * - All six: no TRUNCATE.
 *
 * A reviewed repair or the retention process switches the guards off for
 * its own transaction with `SET LOCAL pi_dash.ledger_maintenance = 'on'`.
 */

/**
 * Installs any missing guard, replacing the functions only when their
 * version differs. Returns what it changed (empty when nothing was needed).
 */
export async function ensureLedgerTriggers(): Promise<string[]> {
  const changed: string[] = [];
  const [version] = await db.execute<{ comment: string | null }>(
    sql`SELECT obj_description(to_regprocedure('ledger_reject_change()'), 'pg_proc') AS comment`
  );
  const existing = await db.execute<{ name: string }>(
    sql`SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal`
  );
  const names = new Set([...existing].map((row) => row.name));
  const missing = LEDGER_TRIGGERS.filter((t) => !names.has(t.name));
  if (version?.comment === LEDGER_GUARD_VERSION && missing.length === 0) {
    return changed;
  }
  await db.transaction(async (tx) => {
    if (version?.comment !== LEDGER_GUARD_VERSION) {
      for (const statement of LEDGER_FUNCTION_STATEMENTS) {
        await tx.execute(sql.raw(statement));
      }
      changed.push("functions");
    }
    for (const trigger of missing) {
      await tx.execute(
        sql.raw(
          `DROP TRIGGER IF EXISTS "${trigger.name}" ON "${trigger.table}"`
        )
      );
      await tx.execute(sql.raw(trigger.create));
      changed.push(trigger.name);
    }
  });
  return changed;
}
