import { db } from "@pi-dash/db";
import { closeYear, reopenYear } from "@pi-dash/db/ledger/year-close";
import { user } from "@pi-dash/db/schema/auth";
import { fiscalYear } from "@pi-dash/db/schema/finance-dimensions";
import { eq, sql } from "drizzle-orm";

/**
 * Database steps for the books spec, run with Bun as a script because
 * Playwright's Node runner cannot load `@pi-dash/db`. Prints one JSON value.
 *
 * - `close-year <label>`: closes the year through the real close, as if
 *   run the day after it ended (a running year can't be closed in the UI).
 * - `reopen-year <label>`: reopens it if it is closed (test cleanup).
 * - `probe-guards`: tries to change and remove posted books rows, each in
 *   a rolled-back savepoint, and reports which statements the database
 *   refused. Proves the append-only guards exist in this database, whether
 *   it was migrated or pushed.
 */

async function yearByLabel(label: string) {
  const [year] = await db
    .select()
    .from(fiscalYear)
    .where(eq(fiscalYear.label, label))
    .limit(1);
  if (!year) {
    throw new Error(`No fiscal year ${label}`);
  }
  return year;
}

async function anyUserId() {
  const [row] = await db.select({ id: user.id }).from(user).limit(1);
  if (!row) {
    throw new Error("No users");
  }
  return row.id;
}

const PROBES = {
  account_movement_update: sql`UPDATE "account_movement" SET "memo" = 'x'`,
  fiscal_year_event_delete: sql`DELETE FROM "fiscal_year_event"`,
  ledger_entry_delete: sql`DELETE FROM "ledger_entry"`,
  opening_balance_delete: sql`DELETE FROM "opening_balance"`,
  opening_balance_update: sql`UPDATE "opening_balance" SET "ca_name" = 'x'`,
  posting_truncate: sql`TRUNCATE "posting", "ledger_entry", "account_movement", "movement_allocation", "opening_balance"`,
  posting_update: sql`UPDATE "posting" SET "action" = 'x'`,
} as const;

async function probeGuards(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  await db
    .transaction(async (tx) => {
      for (const [name, statement] of Object.entries(PROBES)) {
        await tx.execute(sql`SAVEPOINT probe`);
        try {
          const rows = await tx.execute(statement);
          results[name] = `allowed (${rows.count ?? "?"} rows)`;
        } catch {
          results[name] = "refused";
        }
        await tx.execute(sql`ROLLBACK TO SAVEPOINT probe`);
      }
      // Nothing a probe did may stay.
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) {
        throw error;
      }
    });
  return results;
}

class Rollback extends Error {}

const [action, label = "2026-27"] = process.argv.slice(2);
let result: unknown;
if (action === "close-year") {
  const year = await yearByLabel(label);
  const dayAfter = new Date(`${year.endsOn}T00:00:00Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 2);
  const actorId = await anyUserId();
  result = await db.transaction((tx) =>
    closeYear(tx, year.id, { actorId, now: dayAfter })
  );
} else if (action === "reopen-year") {
  const year = await yearByLabel(label);
  result = year.closedAt
    ? await db.transaction(async (tx) =>
        reopenYear(
          tx,
          { fiscalYearId: year.id, reason: "E2E cleanup" },
          { actorId: await anyUserId() }
        )
      )
    : { label, reopened: false };
} else if (action === "probe-guards") {
  result = await probeGuards();
} else {
  throw new Error(`Unknown action ${action}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
