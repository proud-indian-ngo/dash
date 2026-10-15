import { LEDGER_ACCOUNT_HEAD_IDS } from "@pi-dash/shared/constants";
import { SQL } from "bun";
import { eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "../schema";
import { accountHead } from "../schema/finance-dimensions";
import { ledgerEntry } from "../schema/ledger";
import type { LedgerTx } from "./engine";
import { LEDGER_REFERENCE_HEADS, repairExpensesParent } from "./reference-data";

/**
 * The Expenses parent once shared the Corpus donations head's ID. Opt in
 * with LEDGER_TEST_DATABASE_URL pointing at a local, migrated and seeded
 * database; every test runs in a rolled-back transaction.
 */

const databaseUrl = process.env.LEDGER_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

async function inRolledBackTransaction(run: (tx: LedgerTx) => Promise<void>) {
  const client = new SQL(databaseUrl as string, { max: 1 });
  const database = drizzle({ client, schema });
  try {
    await database.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended('ledger:db-tests', 0))`
      );
      await run(tx as unknown as LedgerTx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  } finally {
    await client.close();
  }
}

const CORPUS = LEDGER_ACCOUNT_HEAD_IDS.corpusDonations;
const EXPENSES = LEDGER_ACCOUNT_HEAD_IDS.expenses;
const definition = (id: string) => {
  const head = LEDGER_REFERENCE_HEADS.find((h) => h.id === id);
  if (!head) {
    throw new Error(`No reference head ${id}`);
  }
  return head;
};

async function headOf(tx: LedgerTx, id: string) {
  const [row] = await tx
    .select()
    .from(accountHead)
    .where(eq(accountHead.id, id))
    .limit(1);
  return row;
}

/** The state the clash left: no Expenses row, a category head under Corpus. */
async function brokenState(tx: LedgerTx) {
  const now = new Date();
  await tx
    .update(accountHead)
    .set({ parentId: null })
    .where(eq(accountHead.parentId, EXPENSES));
  await tx.delete(accountHead).where(eq(accountHead.id, EXPENSES));
  const categoryHead = uuidv7();
  await tx.insert(accountHead).values({
    code: `EXPENSE_REPAIR_TEST_${categoryHead.slice(-8).toUpperCase()}`,
    createdAt: now,
    id: categoryHead,
    name: "Repair test",
    parentId: CORPUS,
    sortOrder: 700,
    type: "expense",
    updatedAt: now,
  });
  return categoryHead;
}

async function insertExpensesHead(tx: LedgerTx) {
  const now = new Date();
  await tx
    .insert(accountHead)
    .values({ ...definition(EXPENSES), createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: accountHead.id });
}

it.skipIf(!localDatabase)(
  "moves the expense category heads from Corpus donations to their own Expenses parent, once",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const categoryHead = await brokenState(tx);
      // Without the Expenses row yet, nothing moves.
      await repairExpensesParent(tx);
      expect((await headOf(tx, categoryHead))?.parentId).toBe(CORPUS);

      await insertExpensesHead(tx);
      await repairExpensesParent(tx);
      expect((await headOf(tx, categoryHead))?.parentId).toBe(EXPENSES);
      const underCorpus = await tx
        .select({ id: accountHead.id })
        .from(accountHead)
        .where(eq(accountHead.parentId, CORPUS));
      expect(underCorpus).toEqual([]);
      expect(await headOf(tx, CORPUS)).toMatchObject({
        code: "CORPUS_DONATIONS",
        name: "Corpus donations",
        type: "fund",
      });
      expect(await headOf(tx, EXPENSES)).toMatchObject({
        code: "EXPENSES",
        type: "expense",
      });

      // Idempotent.
      const before = await tx
        .select()
        .from(accountHead)
        .where(like(accountHead.code, "EXPENSE%"));
      await repairExpensesParent(tx);
      const after = await tx
        .select()
        .from(accountHead)
        .where(like(accountHead.code, "EXPENSE%"));
      expect(after).toEqual(before);
    });
  }
);

it.skipIf(!localDatabase)(
  "gives the shared row back to Corpus donations when Expenses took it first",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const [entry] = await tx
        .select({ id: ledgerEntry.id })
        .from(ledgerEntry)
        .where(eq(ledgerEntry.accountHeadId, CORPUS))
        .limit(1);
      // A row with entries is never rewritten; this database has some.
      if (entry) {
        return;
      }
      const categoryHead = await brokenState(tx);
      await tx
        .update(accountHead)
        .set({
          code: "EXPENSES",
          description: definition(EXPENSES).description,
          name: "Expenses",
          tallyLedgerName: "Expenses",
          type: "expense",
        })
        .where(eq(accountHead.id, CORPUS));

      await repairExpensesParent(tx);
      const { id: _id, ...corpus } = definition(CORPUS);
      expect(await headOf(tx, CORPUS)).toMatchObject(corpus);

      await insertExpensesHead(tx);
      await repairExpensesParent(tx);
      expect((await headOf(tx, categoryHead))?.parentId).toBe(EXPENSES);
    });
  }
);
