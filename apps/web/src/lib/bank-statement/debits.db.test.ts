import { expect, it } from "bun:test";

import { SQL } from "bun";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";

/**
 * Database-backed checks of the bank debit actions (layer 3-3b): a line
 * waiting for a claim can still become a transfer or be ignored, a match
 * can't move the books of a closed year, and one claim can't be paid
 * twice. Opt in with LEDGER_TEST_DATABASE_URL pointing at a local,
 * migrated and seeded database; every test is rolled back.
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
  const { expenseCategory } =
    await import("@pi-dash/db/schema/expense-category");
  const { fiscalYear, orgAccount } =
    await import("@pi-dash/db/schema/finance-dimensions");
  const { reimbursement, reimbursementLineItem } =
    await import("@pi-dash/db/schema/reimbursement");
  const { statementLine } = await import("@pi-dash/db/schema/statement-line");
  const t = tx as unknown as Parameters<
    Parameters<ReturnType<typeof drizzle>["transaction"]>[0]
  >[0];
  await t.update(fiscalYear).set({ closedAt: null, closedBy: null });
  const [someone] = await t.select({ id: user.id }).from(user).limit(1);
  const [category] = await t
    .select({ id: expenseCategory.id })
    .from(expenseCategory)
    .limit(1);
  if (!(someone && category)) {
    throw new Error("Seed a user and an expense category first");
  }
  const bank = uuidv7();
  await t.insert(orgAccount).values({
    createdAt: NOW,
    id: bank,
    kind: "bank",
    name: `Debit action test ${bank}`,
    updatedAt: NOW,
  });
  const claim = uuidv7();
  await t.insert(reimbursement).values({
    approvalScreenshotKey: `approval-screenshots/${claim}/proof.png`,
    chargedTo: "organisation",
    createdAt: NOW,
    expenseDate: "2026-06-01",
    id: claim,
    reviewedAt: new Date("2026-06-03T04:30:00Z"),
    status: "approved",
    title: "Class outing",
    updatedAt: NOW,
    userId: someone.id,
  });
  await t.insert(reimbursementLineItem).values({
    amountPaise: 42_500,
    categoryId: category.id,
    createdAt: NOW,
    id: uuidv7(),
    reimbursementId: claim,
    sortOrder: 0,
    updatedAt: NOW,
  });
  const addLine = async (valueOn: string) => {
    const id = uuidv7();
    await t.insert(statementLine).values({
      amountPaise: 42_500,
      createdAt: NOW,
      direction: "debit",
      id,
      lineHash: `test-${id}`,
      orgAccountId: bank,
      position: 1,
      updatedAt: NOW,
      valueOn,
    });
    return id;
  };
  return { addLine, bank, claim, someone: someone.id, t };
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

it.skipIf(!localDatabase)(
  "a line waiting for a claim can still be marked as a transfer or ignored",
  async () => {
    await rolledBack(async (tx) => {
      const { orgAccount } =
        await import("@pi-dash/db/schema/finance-dimensions");
      const { statementLine } =
        await import("@pi-dash/db/schema/statement-line");
      const { addLine, someone, t } = await setup(tx);
      const fd = uuidv7();
      await t.insert(orgAccount).values({
        createdAt: NOW,
        id: fd,
        kind: "deposit",
        name: `Debit action FD ${fd}`,
        updatedAt: NOW,
      });
      const line = await addLine("2026-06-05");
      await act(tx, line, { action: "needs_claim", note: null }, someone);
      await act(
        tx,
        line,
        { action: "transfer", note: null, otherAccountId: fd },
        someone
      );
      const [after] = await t
        .select()
        .from(statementLine)
        .where(eq(statementLine.id, line));
      expect(after).toMatchObject({
        matchKind: "transfer",
        needsClaimAt: null,
        needsClaimBy: null,
      });

      const old = await addLine("2026-03-20");
      await act(tx, old, { action: "needs_claim", note: null }, someone);
      await act(
        tx,
        old,
        { action: "ignore", note: null, reason: "not_ours" },
        someone
      );
      const [ignored] = await t
        .select()
        .from(statementLine)
        .where(eq(statementLine.id, old));
      expect(ignored).toMatchObject({
        matchStatus: "ignored",
        needsClaimAt: null,
      });
    });
  }
);

it.skipIf(!localDatabase)(
  "refuses bank matches that would change a closed year, and paying one claim twice",
  async () => {
    await rolledBack(async (tx) => {
      const { fiscalYear } =
        await import("@pi-dash/db/schema/finance-dimensions");
      const { claim, addLine, someone, t } = await setup(tx);
      const match = {
        action: "match_debit",
        difference: "none",
        items: [{ id: claim, kind: "reimbursement" }],
        reason: "manual",
      };
      const line = await addLine("2026-06-05");
      await t
        .update(fiscalYear)
        .set({ closedAt: NOW })
        .where(eq(fiscalYear.label, "2026-27"));
      await t.execute(sql`savepoint closed`);
      await expect(act(tx, line, match, someone)).rejects.toThrow(
        "This line is in FY 2026-27, which is closed: reopen it first"
      );
      await t.execute(sql`rollback to savepoint closed`);
      await t.execute(sql`savepoint closed2`);
      await expect(
        act(tx, line, { action: "bank_charges", note: null }, someone)
      ).rejects.toThrow("FY 2026-27, which is closed");
      await t.execute(sql`rollback to savepoint closed2`);

      // Reopened: matched once; a second line can't pay it again.
      await t.update(fiscalYear).set({ closedAt: null });
      expect(await act(tx, line, match, someone)).toEqual([
        { sourceId: claim, sourceType: "reimbursement" },
      ]);
      const second = await addLine("2026-06-06");
      await t.execute(sql`savepoint twice`);
      await expect(act(tx, second, match, someone)).rejects.toThrow(
        "already paid in full"
      );
      await t.execute(sql`rollback to savepoint twice`);
    });
  }
);

it.skipIf(!localDatabase)(
  "refuses ignoring or unmatching a line of a closed year, but not a note",
  async () => {
    await rolledBack(async (tx) => {
      const { fiscalYear } =
        await import("@pi-dash/db/schema/finance-dimensions");
      const { addLine, someone, t } = await setup(tx);
      const close = (label: string) =>
        t
          .update(fiscalYear)
          .set({ closedAt: NOW })
          .where(eq(fiscalYear.label, label));
      const old = await addLine("2026-03-20");
      await close("2025-26");
      await t.execute(sql`savepoint ignore`);
      await expect(
        act(
          tx,
          old,
          { action: "ignore", note: null, reason: "not_ours" },
          someone
        )
      ).rejects.toThrow(
        "This line is in FY 2025-26, which is closed: reopen it first"
      );
      await t.execute(sql`rollback to savepoint ignore`);
      await act(tx, old, { action: "note", note: "Asked the bank" }, someone);

      const line = await addLine("2026-06-05");
      await act(tx, line, { action: "bank_charges", note: null }, someone);
      await close("2026-27");
      await t.execute(sql`savepoint unmatch`);
      await expect(
        act(tx, line, { action: "unmatch" }, someone)
      ).rejects.toThrow(
        "This line is in FY 2026-27, which is closed: reopen it first"
      );
      await t.execute(sql`rollback to savepoint unmatch`);
    });
  }
);

it.skipIf(!localDatabase)(
  "counts the summary cards from the cutover",
  async () => {
    await rolledBack(async (tx) => {
      const { debitSummary } = await import("@pi-dash/db/queries/bank-debits");
      const { statementSummary } =
        await import("@pi-dash/db/queries/statement-lines");
      const { statementLine } =
        await import("@pi-dash/db/schema/statement-line");
      const { addLine, bank, someone, t } = await setup(tx);
      const old = await addLine("2026-03-20");
      await act(
        tx,
        old,
        { action: "ignore", note: null, reason: "not_ours" },
        someone
      );
      const line = await addLine("2026-06-05");
      await act(tx, line, { action: "bank_charges", note: null }, someone);
      for (const valueOn of ["2026-03-21", "2026-06-06"]) {
        const id = uuidv7();
        await t.insert(statementLine).values({
          amountPaise: 1000,
          createdAt: NOW,
          direction: "credit",
          id,
          lineHash: `test-${id}`,
          orgAccountId: bank,
          position: 2,
          updatedAt: NOW,
          valueOn,
        });
      }
      expect(await debitSummary(t as never, bank)).toMatchObject({
        attentionCount: 0,
        debitCount: 1,
        debitsMatchedCount: 1,
      });
      expect(await statementSummary(bank, t as never)).toMatchObject({
        creditCount: 1,
        creditsMatchedCount: 0,
        lineCount: 4,
        unmatchedCount: 1,
      });
    });
  }
);
