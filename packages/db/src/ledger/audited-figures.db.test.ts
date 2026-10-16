import type { BalanceSheetLine } from "@pi-dash/shared/audited-figures";
import {
  CORPUS_FUND_ID,
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import { SQL } from "bun";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "../schema";
import { user } from "../schema/auth";
import {
  accountHead,
  fiscalYear,
  fund,
  orgAccount,
} from "../schema/finance-dimensions";
import {
  auditedFigures,
  auditedFiguresLine,
  ledgerEntry,
  openingBalance,
  posting,
} from "../schema/ledger";
import {
  type AuditedFiguresInput,
  loadBalanceSheetLines,
  postAuditedFigures,
  reverseAuditedFigures,
  skipAuditedFigures,
} from "./audited-figures";
import type { LedgerTx } from "./engine";
import { postOpeningBalance } from "./opening-balance";
import { LedgerError } from "./rules";
import { yearCloseChecklist } from "./year-close";

/**
 * Database-backed checks of the audited figures (the year-end true-up).
 * Opt in with LEDGER_TEST_DATABASE_URL pointing at a local, migrated and
 * seeded database (a worktree's isolated database). Every test runs in a
 * transaction that is rolled back, with synthetic records and fake amounts
 * only. The database's own books (seed postings) stay in place, so the
 * figures are entered as the books stand plus each test's differences.
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

const H = LEDGER_ACCOUNT_HEAD_IDS;
const DURING_YEAR = new Date("2026-10-01T06:00:00Z");
// FY 2026-27 has ended by then; the CA signed on 1 April 2027.
const AFTER_YEAR_END = new Date("2027-04-02T06:00:00Z");
const SIGNED_ON = "2027-04-01";
const YEAR_END = "2027-03-31";

async function foundation(tx: LedgerTx) {
  const [someone] = await tx.select({ id: user.id }).from(user).limit(1);
  if (!someone) {
    throw new Error("Seed a user first");
  }
  const bank = uuidv7();
  await tx.insert(orgAccount).values({
    createdAt: DURING_YEAR,
    id: bank,
    kind: "bank",
    name: `Audited test bank ${bank}`,
    updatedAt: DURING_YEAR,
  });
  await tx
    .insert(fund)
    .values({
      code: "CORPUS",
      createdAt: DURING_YEAR,
      id: CORPUS_FUND_ID,
      name: "Corpus Fund",
      restriction: "restricted",
      updatedAt: DURING_YEAR,
    })
    .onConflictDoNothing();
  await tx
    .insert(accountHead)
    .values(
      (
        [
          ["fixedAssets", "asset"],
          ["auditFeesPayable", "liability"],
          ["fundBalance", "fund"],
          ["depreciation", "expense"],
          ["yearEndAdjustments", "expense"],
          ["fundTransfers", "fund"],
        ] as const
      ).map(([key, type]) => ({
        code: `TEST_${key}`,
        createdAt: DURING_YEAR,
        id: H[key],
        name: `Test ${key}`,
        type,
        updatedAt: DURING_YEAR,
      }))
    )
    .onConflictDoNothing();
  await tx.update(fiscalYear).set({ closedAt: null, closedBy: null });
  // Earlier documents are final; only a maintenance session may clear
  // them, and only inside this rolled-back transaction.
  await tx.execute(sql`SET LOCAL pi_dash.ledger_maintenance = 'on'`);
  await tx.delete(auditedFiguresLine);
  await tx.delete(auditedFigures);
  await tx.delete(openingBalance);
  await tx.execute(sql`SET LOCAL pi_dash.ledger_maintenance = 'off'`);
  const [year] = await tx
    .select()
    .from(fiscalYear)
    .where(eq(fiscalYear.startsOn, "2026-04-01"));
  if (!year) {
    throw new Error("Seed the finance dimensions first");
  }
  await postOpeningBalance(
    tx,
    {
      caConfirmedOn: "2026-09-30",
      caName: "Test CA",
      fiscalYearId: year.id,
      id: uuidv7(),
      lines: [
        { amountPaise: 1000_00, kind: "account", orgAccountId: bank },
        {
          amountPaise: 400_00,
          kind: "asset",
          memo: `Test sewing machine ${bank}`,
        },
        { amountPaise: 100_00, kind: "liability", memo: "Audit fees payable" },
        { amountPaise: 1300_00, fundId: GENERAL_FUND_ID, kind: "fund" },
      ],
    },
    { actorId: someone.id, now: DURING_YEAR }
  );
  const asset = `Test sewing machine ${bank}`;
  return { asset, bank, user: someone.id, yearId: year.id };
}

const keys = (bank: string, asset: string) => ({
  asset: `asset:${H.fixedAssets}:${asset}`,
  bank: `account:${bank}`,
  general: `fund:${GENERAL_FUND_ID}`,
  liability: `liability:${H.auditFeesPayable}`,
});

/** The figures as the books stand, with `changes` (paise added) by key. */
async function figures(
  tx: LedgerTx,
  base: { fiscalYearId: string; id?: string },
  changes: Record<string, number> = {}
): Promise<AuditedFiguresInput> {
  const { lines } = await loadBalanceSheetLines(tx, YEAR_END);
  return {
    caName: "Test CA",
    fiscalYearId: base.fiscalYearId,
    id: base.id ?? uuidv7(),
    lines: lines.map((l) => ({
      auditedPaise: l.booksPaise + (changes[l.key] ?? 0),
      booksPaise: l.booksPaise,
      key: l.key,
    })),
    signedOn: SIGNED_ON,
  };
}

const messageOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error instanceof LedgerError ? error.message : String(error);
  }
  return null;
};

const byKey = (lines: readonly BalanceSheetLine[]) =>
  new Map(lines.map((l) => [l.key, l.booksPaise]));

/** Assets less liabilities less funds of the balance sheet lines. */
const balanceCheck = (lines: readonly BalanceSheetLine[]) =>
  lines.reduce((sum, l) => {
    if (l.kind === "account" || l.kind === "asset") {
      return sum + l.booksPaise;
    }
    return sum - l.booksPaise;
  }, 0);

it.skipIf(!localDatabase)(
  "posts depreciation and a provision written back as one balanced posting on 31 March, after which the closing and the next year's opening equal the audited figures",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const k = keys(ids.bank, ids.asset);
      // Depreciation 120 and the audit fee of 100 written back: the
      // surplus, and so the General Fund, moves by -20.
      const input = await figures(
        tx,
        { fiscalYearId: ids.yearId },
        { [k.asset]: -120_00, [k.general]: -20_00, [k.liability]: -100_00 }
      );
      const before = await loadBalanceSheetLines(tx, YEAR_END);
      expect(balanceCheck(before.lines)).toBe(0);

      const document = await postAuditedFigures(tx, input, {
        actorId: ids.user,
        now: AFTER_YEAR_END,
      });
      expect(document).toMatchObject({
        asOn: YEAR_END,
        caName: "Test CA",
        signedOn: SIGNED_ON,
        status: "matched",
      });
      // A repeat of the same document returns it.
      const again = await postAuditedFigures(tx, input, {
        actorId: ids.user,
        now: AFTER_YEAR_END,
      });
      expect(again.id).toBe(document.id);

      const [written] = await tx
        .select()
        .from(posting)
        .where(eq(posting.sourceId, document.id));
      expect(written).toMatchObject({
        economicOn: YEAR_END,
        sourceType: "audited_figures",
      });
      const entries = await tx
        .select({
          amountPaise: ledgerEntry.amountPaise,
          effect: ledgerEntry.effect,
          head: ledgerEntry.accountHeadId,
          memo: ledgerEntry.memo,
        })
        .from(ledgerEntry)
        .where(eq(ledgerEntry.postingId, document.postingId as string));
      expect(entries).toEqual(
        expect.arrayContaining([
          {
            amountPaise: 120_00,
            effect: "decrease",
            head: H.fixedAssets,
            memo: ids.asset,
          },
          {
            amountPaise: 120_00,
            effect: "increase",
            head: H.depreciation,
            memo: `Per audited accounts: ${ids.asset}`,
          },
          expect.objectContaining({
            amountPaise: 100_00,
            effect: "decrease",
            head: H.auditFeesPayable,
          }),
          expect.objectContaining({
            amountPaise: 100_00,
            effect: "decrease",
            head: H.yearEndAdjustments,
          }),
        ])
      );
      expect(entries).toHaveLength(4);

      // The closing is the audited figures, line for line, and balances.
      const after = await loadBalanceSheetLines(tx, YEAR_END);
      expect(byKey(after.lines)).toEqual(
        new Map(input.lines.map((l) => [l.key, l.auditedPaise]))
      );
      expect(balanceCheck(after.lines)).toBe(0);
      // The next year opens from them: nothing is posted on 1 April.
      const nextYear = await loadBalanceSheetLines(tx, "2027-04-01");
      expect(byKey(nextYear.lines)).toEqual(byKey(after.lines));

      const stored = await tx
        .select()
        .from(auditedFiguresLine)
        .where(eq(auditedFiguresLine.auditedFiguresId, document.id));
      expect(stored.find((l) => l.lineKey === k.asset)).toMatchObject({
        auditedPaise: 280_00,
        booksPaise: 400_00,
        counterHeadId: H.depreciation,
      });

      // The document is final: only its reversal stamp may change.
      await tx.execute(sql`SAVEPOINT probe`);
      expect(
        await messageOf(() =>
          tx.execute(
            sql`UPDATE "audited_figures" SET "ca_name" = 'x' WHERE "id" = ${document.id}`
          )
        )
      ).not.toBeNull();
      await tx.execute(sql`ROLLBACK TO SAVEPOINT probe`);
      await tx.execute(sql`SAVEPOINT probe`);
      expect(
        await messageOf(() =>
          tx.execute(sql`DELETE FROM "audited_figures_line"`)
        )
      ).not.toBeNull();
      await tx.execute(sql`ROLLBACK TO SAVEPOINT probe`);

      // The year-close checklist sees the match.
      const checklist = await yearCloseChecklist(
        tx,
        ids.yearId,
        AFTER_YEAR_END
      );
      expect(
        checklist.checks.find((c) => c.id === "audited_figures")
      ).toMatchObject({ ok: true, required: false });
    });
  }
);

it.skipIf(!localDatabase)(
  "refuses a running year, a closed year, a money account that differs, figures that don't balance and books that changed",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const k = keys(ids.bank, ids.asset);
      const context = { actorId: ids.user, now: AFTER_YEAR_END };

      const agreeing = await figures(tx, { fiscalYearId: ids.yearId });
      expect(
        await messageOf(() =>
          postAuditedFigures(
            tx,
            { ...agreeing, signedOn: "2026-09-30" },
            { actorId: ids.user, now: DURING_YEAR }
          )
        )
      ).toMatch(/hasn't ended yet/);
      expect(
        await messageOf(() =>
          postAuditedFigures(tx, { ...agreeing, signedOn: YEAR_END }, context)
        )
      ).toMatch(/signed after the year ends/);

      // A bank charge missing from the books: never adjusted.
      const bankDiffers = await figures(
        tx,
        { fiscalYearId: ids.yearId },
        { [k.bank]: -5_00, [k.general]: -5_00 }
      );
      expect(
        await messageOf(() => postAuditedFigures(tx, bankDiffers, context))
      ).toMatch(/money account differs/);

      const unbalanced = await figures(
        tx,
        { fiscalYearId: ids.yearId },
        { [k.asset]: -10_00 }
      );
      expect(
        await messageOf(() => postAuditedFigures(tx, unbalanced, context))
      ).toMatch(/don't balance/);

      const stale = {
        ...agreeing,
        lines: agreeing.lines.map((l) =>
          l.key === k.bank ? { ...l, booksPaise: l.booksPaise + 1 } : l
        ),
      };
      expect(
        await messageOf(() => postAuditedFigures(tx, stale, context))
      ).toMatch(/books changed/);

      // Closed: reopen to match.
      await tx
        .update(fiscalYear)
        .set({ closedAt: AFTER_YEAR_END, closedBy: ids.user })
        .where(eq(fiscalYear.id, ids.yearId));
      expect(
        await messageOf(() => postAuditedFigures(tx, agreeing, context))
      ).toBe("Reopen FY 2026-27 to match its audited figures");
      await tx
        .update(fiscalYear)
        .set({ closedAt: null, closedBy: null })
        .where(eq(fiscalYear.id, ids.yearId));

      // Nothing differs: matched, nothing posted; a second one is refused.
      const matched = await postAuditedFigures(tx, agreeing, context);
      expect(matched.postingId).toBeNull();
      expect(
        await messageOf(() =>
          postAuditedFigures(tx, { ...agreeing, id: uuidv7() }, context)
        )
      ).toMatch(/already matched/);
    });
  }
);

it.skipIf(!localDatabase)(
  "corrects by reversing the standing document and entering a new one, refused while the year is closed",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const k = keys(ids.bank, ids.asset);
      const context = { actorId: ids.user, now: AFTER_YEAR_END };
      const first = await postAuditedFigures(
        tx,
        await figures(
          tx,
          { fiscalYearId: ids.yearId },
          { [k.asset]: -120_00, [k.general]: -120_00 }
        ),
        context
      );

      // The year closes with the figures matched, and must reopen to correct them.
      const closing = await yearCloseChecklist(tx, ids.yearId, AFTER_YEAR_END);
      expect(
        closing.checks.find((c) => c.id === "audited_figures")?.details[0]
      ).toBe(`Signed by Test CA on ${SIGNED_ON}`);
      await tx
        .update(fiscalYear)
        .set({ closedAt: AFTER_YEAR_END, closedBy: ids.user })
        .where(eq(fiscalYear.id, ids.yearId));
      expect(
        await messageOf(() =>
          reverseAuditedFigures(
            tx,
            { id: first.id, reason: "The CA revised the depreciation" },
            context
          )
        )
      ).toBe("Reopen FY 2026-27 to correct its audited figures");
      await tx
        .update(fiscalYear)
        .set({ closedAt: null, closedBy: null })
        .where(eq(fiscalYear.id, ids.yearId));

      const reversed = await reverseAuditedFigures(
        tx,
        { id: first.id, reason: "The CA revised the depreciation" },
        context
      );
      expect(reversed.reversalPostingId).not.toBeNull();
      // Back to the books as they were.
      const back = await loadBalanceSheetLines(tx, YEAR_END);
      expect(back.lines.find((l) => l.key === k.asset)?.booksPaise).toBe(
        400_00
      );

      const corrected = await figures(
        tx,
        { fiscalYearId: ids.yearId },
        { [k.asset]: -100_00, [k.general]: -100_00 }
      );
      await postAuditedFigures(tx, corrected, context);
      const after = await loadBalanceSheetLines(tx, YEAR_END);
      expect(after.lines.find((l) => l.key === k.asset)?.booksPaise).toBe(
        300_00
      );
      expect(balanceCheck(after.lines)).toBe(0);
      expect(
        await messageOf(() =>
          reverseAuditedFigures(tx, { id: first.id, reason: "Again" }, context)
        )
      ).toMatch(/already reversed/);
    });
  }
);

it.skipIf(!localDatabase)(
  "moves money between funds only with an explicit transfer, and records a skip for the year-close checklist",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const k = keys(ids.bank, ids.asset);
      const corpus = `fund:${CORPUS_FUND_ID}`;
      const context = { actorId: ids.user, now: AFTER_YEAR_END };
      const moved = await figures(
        tx,
        { fiscalYearId: ids.yearId },
        { [corpus]: 50_00, [k.general]: -50_00 }
      );
      expect(
        await messageOf(() => postAuditedFigures(tx, moved, context))
      ).toMatch(/fund still differs/);
      const document = await postAuditedFigures(
        tx,
        {
          ...moved,
          transfers: [
            {
              amountPaise: 50_00,
              fromFundId: GENERAL_FUND_ID,
              reason: "Corpus share per the CA",
              toFundId: CORPUS_FUND_ID,
            },
          ],
        },
        context
      );
      const after = await loadBalanceSheetLines(tx, YEAR_END);
      expect(after.lines.find((l) => l.key === corpus)?.booksPaise).toBe(
        moved.lines.find((l) => l.key === corpus)?.auditedPaise
      );
      expect(balanceCheck(after.lines)).toBe(0);

      await reverseAuditedFigures(
        tx,
        { id: document.id, reason: "Entered against the wrong fund" },
        context
      );
      const skipped = await skipAuditedFigures(
        tx,
        {
          fiscalYearId: ids.yearId,
          id: uuidv7(),
          reason: "The audit is still running",
        },
        context
      );
      expect(skipped).toMatchObject({ postingId: null, status: "skipped" });
      const checklist = await yearCloseChecklist(
        tx,
        ids.yearId,
        AFTER_YEAR_END
      );
      expect(
        checklist.checks.find((c) => c.id === "audited_figures")
      ).toMatchObject({
        details: ["Skipped: The audit is still running"],
        ok: true,
      });
      // Not done is a warning, never a blocker.
      await reverseAuditedFigures(
        tx,
        { id: skipped.id, reason: "The CA signed after all" },
        context
      );
      const open = await yearCloseChecklist(tx, ids.yearId, AFTER_YEAR_END);
      expect(open.checks.find((c) => c.id === "audited_figures")).toMatchObject(
        { ok: false, required: false }
      );
    });
  }
);
