import { expect, it } from "bun:test";

import { SQL } from "bun";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";

/**
 * Database-backed checks of deleting bank statement lines and imports: an
 * open line goes and frees its hash, while a matched, ignored, once
 * allocated or closed-year line stays. Opt in with LEDGER_TEST_DATABASE_URL
 * pointing at a local, migrated and seeded database; every test is rolled
 * back.
 */

const databaseUrl = process.env.LEDGER_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

const NOW = new Date("2026-10-15T06:00:00Z");

async function rolledBack(run: (tx: never) => Promise<void>) {
  const schema = await import("@pi-dash/db/schema/index");
  const client = new SQL(databaseUrl as string, { max: 1 });
  const database = drizzle({ client, schema });
  try {
    await database.transaction(async (tx) => {
      await run(tx as never);
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

async function setup(tx: never) {
  const { user } = await import("@pi-dash/db/schema/auth");
  const { fiscalYear, orgAccount } =
    await import("@pi-dash/db/schema/finance-dimensions");
  const { importBatch } = await import("@pi-dash/db/schema/import-batch");
  const { statementLine } = await import("@pi-dash/db/schema/statement-line");
  const { GENERAL_FUND_ID } = await import("@pi-dash/shared/constants");
  const t = tx as unknown as Parameters<
    Parameters<ReturnType<typeof drizzle>["transaction"]>[0]
  >[0];
  await t.update(fiscalYear).set({ closedAt: null, closedBy: null });
  const [someone] = await t.select({ id: user.id }).from(user).limit(1);
  if (!someone) {
    throw new Error("Seed a user first");
  }
  const bank = uuidv7();
  await t.insert(orgAccount).values({
    createdAt: NOW,
    id: bank,
    kind: "bank",
    name: `Delete test ${bank}`,
    updatedAt: NOW,
  });
  const batch = uuidv7();
  await t.insert(importBatch).values({
    createdAt: NOW,
    defaultChannel: "neft",
    fileHash: `test-${batch}`,
    fileName: "statement.csv",
    fundId: GENERAL_FUND_ID,
    id: batch,
    orgAccountId: bank,
    parserVersion: 1,
    rowCount: 2,
    source: "bank_csv",
    status: "completed",
    updatedAt: NOW,
    uploadedBy: someone.id,
  });
  const addLine = async (valueOn: string, lineHash = `test-${uuidv7()}`) => {
    const id = uuidv7();
    await t.insert(statementLine).values({
      amountPaise: 42_500,
      createdAt: NOW,
      direction: "debit",
      id,
      importBatchId: batch,
      lineHash,
      orgAccountId: bank,
      position: 1,
      updatedAt: NOW,
      valueOn,
    });
    return id;
  };
  return { addLine, batch, someone: someone.id, t };
}

async function act(tx: never, lineId: string, input: object, actor: string) {
  const { lockStatementLine } =
    await import("@pi-dash/db/queries/statement-lines");
  const { applyAction } = await import("./server");
  const line = await lockStatementLine(tx, lineId);
  if (!line) {
    throw new Error("No line");
  }
  return await applyAction(tx, line, { lineId, ...input } as never, actor, NOW);
}

async function remove(tx: never, input: object) {
  const { deleteStatementLinesIn } = await import("./server");
  return await deleteStatementLinesIn(tx, input as never);
}

it.skipIf(!localDatabase)(
  "deletes an open line and frees its hash for a later upload",
  async () => {
    await rolledBack(async (tx) => {
      const { statementLine } =
        await import("@pi-dash/db/schema/statement-line");
      const { addLine, t } = await setup(tx);
      const line = await addLine("2026-06-05", "test-same-hash");
      expect(await remove(tx, { kind: "line", lineId: line })).toEqual({
        lineCount: 1,
      });
      const left = await t
        .select({ id: statementLine.id })
        .from(statementLine)
        .where(eq(statementLine.id, line));
      expect(left).toEqual([]);
      await addLine("2026-06-05", "test-same-hash");
    });
  }
);

it.skipIf(!localDatabase)(
  "refuses a matched, ignored, once allocated or closed-year line",
  async () => {
    await rolledBack(async (tx) => {
      const { fiscalYear } =
        await import("@pi-dash/db/schema/finance-dimensions");
      const { addLine, someone, t } = await setup(tx);
      const attempt = async (lineId: string, message: string) => {
        await t.execute(sql`savepoint attempt`);
        await expect(remove(tx, { kind: "line", lineId })).rejects.toThrow(
          message
        );
        await t.execute(sql`rollback to savepoint attempt`);
      };

      const charges = await addLine("2026-06-05");
      await act(tx, charges, { action: "bank_charges", note: null }, someone);
      await attempt(charges, "unmatch it first");
      // Unmatched, the released allocation still names the line.
      await act(tx, charges, { action: "unmatch" }, someone);
      await attempt(charges, "was matched before or is in the books");

      const old = await addLine("2026-03-20");
      await act(
        tx,
        old,
        { action: "ignore", note: null, reason: "not_ours" },
        someone
      );
      await attempt(old, "unmatch it first");

      const closed = await addLine("2026-06-07");
      await t
        .update(fiscalYear)
        .set({ closedAt: NOW })
        .where(eq(fiscalYear.label, "2026-27"));
      await attempt(closed, "This line is in FY 2026-27, which is closed");
    });
  }
);

it.skipIf(!localDatabase)(
  "deletes an import only when none of its lines is matched or ignored",
  async () => {
    await rolledBack(async (tx) => {
      const { importBatch } = await import("@pi-dash/db/schema/import-batch");
      const { statementLine } =
        await import("@pi-dash/db/schema/statement-line");
      const { addLine, batch, someone, t } = await setup(tx);
      const first = await addLine("2026-06-05");
      const second = await addLine("2026-03-20");
      // A line waiting for a claim is still open.
      await act(tx, first, { action: "needs_claim", note: null }, someone);
      await act(
        tx,
        second,
        { action: "ignore", note: null, reason: "not_ours" },
        someone
      );
      await t.execute(sql`savepoint attempt`);
      await expect(
        remove(tx, { batchId: batch, kind: "import" })
      ).rejects.toThrow("Some lines of this import are matched or ignored");
      await t.execute(sql`rollback to savepoint attempt`);
      await act(tx, second, { action: "unmatch" }, someone);

      expect(await remove(tx, { batchId: batch, kind: "import" })).toEqual({
        lineCount: 2,
      });
      const lines = await t
        .select({ id: statementLine.id })
        .from(statementLine)
        .where(inArray(statementLine.id, [first, second]));
      const batches = await t
        .select({ id: importBatch.id })
        .from(importBatch)
        .where(eq(importBatch.id, batch));
      expect([lines, batches]).toEqual([[], []]);
    });
  }
);
