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

import { matchedYearTouched } from "../queries/bank-debits";
// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "../schema";
import { user } from "../schema/auth";
import {
  accountHead,
  fiscalYear,
  fund,
  orgAccount,
} from "../schema/finance-dimensions";
import { otherIncome } from "../schema/income";
import {
  auditedFigures,
  auditedFiguresLine,
  ledgerEntry,
  ledgerSourceState,
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
import { type LedgerTx, post, reverse } from "./engine";
import { listIncomeSources, postIncomeSource } from "./income-posting";
import { postOpeningBalance, reverseOpeningBalance } from "./opening-balance";
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
          ["yearEndAdjustmentsIncome", "income"],
          ["fdInterest", "income"],
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
  // Nothing waiting to post, whatever the database's own records are
  // doing: they count as looked at, so only this test's records matter.
  await tx.delete(ledgerSourceState);
  const existing = await listIncomeSources(tx);
  if (existing.length > 0) {
    await tx.insert(ledgerSourceState).values(
      existing.map((source) => ({
        ...source,
        checkedAt: DURING_YEAR,
        id: uuidv7(),
        status: "none" as const,
      }))
    );
  }
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
  base: { asOf?: string; fiscalYearId: string; id?: string; signedOn?: string },
  changes: Record<string, number> = {}
): Promise<AuditedFiguresInput> {
  const { lines } = await loadBalanceSheetLines(tx, base.asOf ?? YEAR_END);
  return {
    caName: "Test CA",
    fiscalYearId: base.fiscalYearId,
    id: base.id ?? uuidv7(),
    lines: lines.map((l) => ({
      auditedPaise: l.booksPaise + (changes[l.key] ?? 0),
      booksPaise: l.booksPaise,
      key: l.key,
    })),
    signedOn: base.signedOn ?? SIGNED_ON,
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
            effect: "increase",
            head: H.yearEndAdjustmentsIncome,
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

it.skipIf(!localDatabase)(
  "freezes a matched year: new postings and reversals into it are refused and wait with the reason, and the checklist sees books that changed anyway",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const k = keys(ids.bank, ids.asset);
      const context = { actorId: ids.user, now: AFTER_YEAR_END };

      // Something waiting to post in the year holds the match up.
      const incomeId = uuidv7();
      await tx.insert(otherIncome).values({
        amountPaise: 5_00,
        createdAt: DURING_YEAR,
        fundId: GENERAL_FUND_ID,
        id: incomeId,
        kind: "interest",
        orgAccountId: ids.bank,
        receivedOn: "2026-06-30",
        updatedAt: DURING_YEAR,
      });
      expect(
        await messageOf(async () =>
          postAuditedFigures(
            tx,
            await figures(tx, { fiscalYearId: ids.yearId }),
            context
          )
        )
      ).toMatch(/1 record dated in FY 2026-27 is waiting to post/);
      await postIncomeSource(
        tx,
        { sourceId: incomeId, sourceType: "other_income" },
        { actorId: null, now: AFTER_YEAR_END }
      );

      const document = await postAuditedFigures(
        tx,
        await figures(
          tx,
          { fiscalYearId: ids.yearId },
          { [k.asset]: -120_00, [k.general]: -120_00 }
        ),
        context
      );

      // A new posting dated in the year is refused like a closed year's.
      expect(
        await messageOf(() =>
          post(
            tx,
            {
              action: "post",
              economicOn: "2026-07-01",
              entries: [],
              movements: [
                {
                  amountPaise: 1_00,
                  direction: "in",
                  kind: "receipt",
                  orgAccountId: ids.bank,
                },
              ],
              sourceId: uuidv7(),
              sourceType: "test_source",
            },
            context
          )
        )
      ).toBe(
        "FY 2026-27's audited figures are matched; reverse them to change the year"
      );
      // A record that changes in the year waits with that reason.
      const lateId = uuidv7();
      await tx.insert(otherIncome).values({
        amountPaise: 7_00,
        createdAt: AFTER_YEAR_END,
        fundId: GENERAL_FUND_ID,
        id: lateId,
        kind: "interest",
        orgAccountId: ids.bank,
        receivedOn: "2026-08-01",
        updatedAt: AFTER_YEAR_END,
      });
      expect(
        await postIncomeSource(
          tx,
          { sourceId: lateId, sourceType: "other_income" },
          { actorId: null, now: AFTER_YEAR_END }
        )
      ).toMatchObject({ reason: "audited_figures_matched", status: "waiting" });
      // The year can't close with it waiting (nothing posted past the match).
      const checklist = await yearCloseChecklist(
        tx,
        ids.yearId,
        AFTER_YEAR_END
      );
      expect(
        checklist.checks.find((c) => c.id === "unposted_sources")?.ok
      ).toBe(false);
      expect(
        checklist.checks.find((c) => c.id === "unposted_sources")?.details
      ).toContain(
        "1 record arrived after the audited figures were matched — reverse the audited figures, post, and match again"
      );
      // A bank match moving the year is refused up front.
      expect(
        await matchedYearTouched(tx, { dates: ["2026-09-01"], sources: [] })
      ).toBe("2026-27");
      expect(
        await matchedYearTouched(tx, { dates: ["2027-04-05"], sources: [] })
      ).toBeNull();
      expect(
        await matchedYearTouched(tx, {
          dates: [],
          sources: [{ sourceId: incomeId, sourceType: "other_income" }],
        })
      ).toBe("2026-27");
      expect(
        checklist.checks.find((c) => c.id === "audited_figures")
      ).toMatchObject({ ok: true });

      // Books that changed anyway (here: an override) fail the checklist item.
      const [openingPosting] = await tx
        .select({ id: posting.id })
        .from(posting)
        .innerJoin(openingBalance, eq(openingBalance.postingId, posting.id));
      await reverse(tx, openingPosting?.id as string, {
        actorId: ids.user,
        intoMatchedYear: true,
        now: AFTER_YEAR_END,
        reason: "Test drift",
      });
      const drifted = await yearCloseChecklist(tx, ids.yearId, AFTER_YEAR_END);
      expect(
        drifted.checks.find((c) => c.id === "audited_figures")
      ).toMatchObject({ ok: false });
      expect(
        drifted.checks.find((c) => c.id === "audited_figures")?.details[1]
      ).toMatch(/^Books changed since the audited figures were matched/);

      // The match's own reversal still goes through, and the late record
      // then posts.
      await reverseAuditedFigures(
        tx,
        { id: document.id, reason: "Reversed for the test" },
        context
      );
      expect(
        await postIncomeSource(
          tx,
          { sourceId: lateId, sourceType: "other_income" },
          { actorId: null, now: AFTER_YEAR_END }
        )
      ).toMatchObject({ status: "posted" });
    });
  }
);

it.skipIf(!localDatabase)(
  "matches the years in order, and refuses reversing a year or the opening balances under a later match",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const k = keys(ids.bank, ids.asset);
      const [next] = await tx
        .select()
        .from(fiscalYear)
        .where(eq(fiscalYear.startsOn, "2027-04-01"));
      if (!next) {
        throw new Error("Seed FY 2027-28 first");
      }
      const afterNext = {
        actorId: ids.user,
        now: new Date("2028-04-02T06:00:00Z"),
      };
      expect(
        await messageOf(() =>
          skipAuditedFigures(
            tx,
            { fiscalYearId: next.id, id: uuidv7(), reason: "Not audited yet" },
            afterNext
          )
        )
      ).toBe(
        "Match or skip FY 2026-27's audited figures first: each year opens from the one before"
      );
      const first = await postAuditedFigures(
        tx,
        await figures(
          tx,
          { fiscalYearId: ids.yearId },
          { [k.asset]: -120_00, [k.general]: -120_00 }
        ),
        afterNext
      );
      const second = await postAuditedFigures(
        tx,
        await figures(
          tx,
          { asOf: "2028-03-31", fiscalYearId: next.id, signedOn: "2028-04-01" },
          { [k.asset]: -100_00, [k.general]: -100_00 }
        ),
        afterNext
      );
      expect(
        await messageOf(() =>
          reverseAuditedFigures(
            tx,
            { id: first.id, reason: "The CA revised them" },
            afterNext
          )
        )
      ).toBe(
        "Reverse FY 2027-28's audited figures first: they were matched against this year's closing"
      );
      const [opening] = await tx
        .select({ id: openingBalance.id })
        .from(openingBalance)
        .limit(1);
      expect(
        await messageOf(() =>
          reverseOpeningBalance(
            tx,
            { id: opening?.id as string, reason: "Corrected opening" },
            afterNext
          )
        )
      ).toBe(
        "Reverse FY 2026-27's audited figures first: they were matched against the books these opening balances start"
      );
      // In order, they reverse.
      await reverseAuditedFigures(
        tx,
        { id: second.id, reason: "The CA revised them" },
        afterNext
      );
      await reverseAuditedFigures(
        tx,
        { id: first.id, reason: "The CA revised them" },
        afterNext
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "freezes every year before a matched one too, so a skipped earlier year can't move a later match's closing",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const k = keys(ids.bank, ids.asset);
      const [next] = await tx
        .select()
        .from(fiscalYear)
        .where(eq(fiscalYear.startsOn, "2027-04-01"));
      if (!next) {
        throw new Error("Seed FY 2027-28 first");
      }
      const context = {
        actorId: ids.user,
        now: new Date("2028-04-02T06:00:00Z"),
      };
      await skipAuditedFigures(
        tx,
        { fiscalYearId: ids.yearId, id: uuidv7(), reason: "Not audited yet" },
        context
      );
      await postAuditedFigures(
        tx,
        await figures(
          tx,
          { asOf: "2028-03-31", fiscalYearId: next.id, signedOn: "2028-04-01" },
          { [k.asset]: -100_00, [k.general]: -100_00 }
        ),
        context
      );
      // FY 2026-27 is open and only skipped, yet a posting into it is refused.
      expect(
        await messageOf(() =>
          post(
            tx,
            {
              action: "post",
              economicOn: "2026-07-01",
              entries: [],
              movements: [
                {
                  amountPaise: 1_00,
                  direction: "in",
                  kind: "receipt",
                  orgAccountId: ids.bank,
                },
              ],
              sourceId: uuidv7(),
              sourceType: "test_source",
            },
            context
          )
        )
      ).toBe(
        "FY 2027-28's audited figures are matched; reverse them to change the year"
      );
      expect(
        await matchedYearTouched(tx, { dates: ["2026-07-01"], sources: [] })
      ).toBe("2027-28");
    });
  }
);
