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

type Database = Pick<typeof db, "execute" | "transaction">;
type Runner = Pick<typeof db, "execute">;

interface GuardState {
  missing: typeof LEDGER_TRIGGERS;
  versionCurrent: boolean;
}

/** The functions' version and which guards are missing, by table and name. */
async function readGuardState(runner: Runner): Promise<GuardState> {
  const [version] = await runner.execute<{ comment: string | null }>(
    sql`SELECT obj_description(to_regprocedure('ledger_reject_change()'), 'pg_proc') AS comment`
  );
  const existing = await runner.execute<{ name: string; table: string }>(
    sql`SELECT t.tgname AS name, c.relname AS "table"
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal AND n.nspname = 'public'`
  );
  const present = new Set(
    [...existing].map((row) => `${row.table}:${row.name}`)
  );
  return {
    missing: LEDGER_TRIGGERS.filter(
      (t) => !present.has(`${t.table}:${t.name}`)
    ),
    versionCurrent: version?.comment === LEDGER_GUARD_VERSION,
  };
}

/**
 * Installs any missing guard, replacing the functions only when their
 * version differs. Returns what it changed (empty when nothing was needed).
 * Concurrent server starts serialise on an advisory lock and re-read the
 * state under it, so only the first one runs any DDL.
 */
export async function ensureLedgerTriggers(
  database: Database = db
): Promise<string[]> {
  const before = await readGuardState(database);
  if (before.versionCurrent && before.missing.length === 0) {
    return [];
  }
  return await database.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('ledger:guards', 0))`
    );
    const state = await readGuardState(tx);
    const changed: string[] = [];
    if (!state.versionCurrent) {
      for (const statement of LEDGER_FUNCTION_STATEMENTS) {
        await tx.execute(sql.raw(statement));
      }
      changed.push("functions");
    }
    for (const trigger of state.missing) {
      await tx.execute(
        sql.raw(
          `DROP TRIGGER IF EXISTS "${trigger.name}" ON "${trigger.table}"`
        )
      );
      await tx.execute(sql.raw(trigger.create));
      changed.push(trigger.name);
    }
    return changed;
  });
}
