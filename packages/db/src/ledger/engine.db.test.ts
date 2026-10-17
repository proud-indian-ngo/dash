import {
  CORPUS_FUND_ID,
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import { SQL } from "bun";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "../schema";
import { user } from "../schema/auth";
import {
  accountHead,
  fiscalPeriod,
  fiscalYear,
  fund,
  orgAccount,
} from "../schema/finance-dimensions";
import {
  accountMovement,
  fiscalYearEvent,
  ledgerEntry,
  ledgerSourceState,
  openingBalance,
  posting,
} from "../schema/ledger";
import { statementLine } from "../schema/statement-line";
import { type LedgerTx, post, reverse } from "./engine";
import { listIncomeSources } from "./income-posting";
import { postOpeningBalance, reverseOpeningBalance } from "./opening-balance";
import { LedgerError } from "./rules";
import { closeYear, reopenYear, yearCloseChecklist } from "./year-close";

/**
 * Database-backed checks of the posting engine. Opt in with
 * LEDGER_TEST_DATABASE_URL pointing at a local, migrated and seeded
 * database (a worktree's isolated database). Every test runs in a transaction
 * that is rolled back, with synthetic records and fake amounts only.
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
      // One books test transaction at a time across test files: they all
      // reset the same years and take the year-close lock.
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

// 30 Apr 2026, 19:00 UTC is already 1 May in India.
const NOW = new Date("2026-04-30T19:00:00Z");

async function foundation(tx: LedgerTx) {
  const [someone] = await tx.select({ id: user.id }).from(user).limit(1);
  if (!someone) {
    throw new Error("Seed a user first");
  }
  const ids = { bank: uuidv7(), fd: uuidv7(), user: someone.id };
  await tx.insert(orgAccount).values([
    {
      createdAt: NOW,
      id: ids.bank,
      kind: "bank",
      name: `Ledger test bank ${ids.bank}`,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: ids.fd,
      kind: "deposit",
      name: `Ledger test FD ${ids.fd}`,
      updatedAt: NOW,
    },
  ]);
  await tx
    .insert(fund)
    .values({
      code: "CORPUS",
      createdAt: NOW,
      id: CORPUS_FUND_ID,
      name: "Corpus Fund",
      restriction: "restricted",
      updatedAt: NOW,
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
          ["fdInterest", "income"],
        ] as const
      ).map(([key, type]) => ({
        code: `TEST_${key}`,
        createdAt: NOW,
        id: LEDGER_ACCOUNT_HEAD_IDS[key],
        name: `Test ${key}`,
        type,
        updatedAt: NOW,
      }))
    )
    .onConflictDoNothing();
  // A clean 2026-27 for this transaction only.
  await tx.update(fiscalYear).set({ closedAt: null, closedBy: null });
  // Nothing waiting to post, whatever the database's own records are doing.
  await tx.delete(ledgerSourceState);
  // No open bank lines either: the database's own would block every close.
  await tx
    .update(statementLine)
    .set({ valueOn: "2026-03-31" })
    .where(eq(statementLine.matchStatus, "unmatched"));
  // The database's own income records count as looked at, so only this
  // test's records can hold up a year close.
  const existing = await listIncomeSources(tx);
  if (existing.length > 0) {
    await tx.insert(ledgerSourceState).values(
      existing.map((source) => ({
        ...source,
        checkedAt: NOW,
        id: uuidv7(),
        status: "none" as const,
      }))
    );
  }
  // Earlier opening balances are final; only a maintenance session may
  // clear them, and only inside this rolled-back transaction.
  await tx.execute(sql`SET LOCAL pi_dash.ledger_maintenance = 'on'`);
  await tx.delete(openingBalance);
  await tx.execute(sql`SET LOCAL pi_dash.ledger_maintenance = 'off'`);
  const [year] = await tx
    .select()
    .from(fiscalYear)
    .where(eq(fiscalYear.startsOn, "2026-04-01"));
  if (!year) {
    throw new Error("Seed the finance dimensions first");
  }
  return { ...ids, yearId: year.id };
}

const receipt = (orgAccountId: string, amountPaise = 5000) => ({
  action: "post",
  economicOn: "2026-04-30",
  entries: [
    {
      accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.fdInterest,
      amountPaise,
      effect: "increase" as const,
      fundId: GENERAL_FUND_ID,
    },
  ],
  movements: [
    {
      amountPaise,
      direction: "in" as const,
      kind: "receipt" as const,
      orgAccountId,
    },
  ],
  sourceId: uuidv7(),
  sourceType: "test_source",
});

const codeOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    return error instanceof LedgerError ? error.code : String(error);
  }
  return null;
};

it.skipIf(!localDatabase)(
  "posts once per key, dated in India time and the economic date's period",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const input = receipt(ids.bank);
      const first = await post(tx, input, { actorId: ids.user, now: NOW });
      const again = await post(tx, input, { actorId: ids.user, now: NOW });
      expect(first.created).toBe(true);
      expect(again).toEqual({ created: false, posting: first.posting });
      expect(first.posting.postedOn).toBe("2026-05-01");
      expect(first.posting.fiscalYearId).toBe(ids.yearId);
      const [entry] = await tx
        .select({ month: fiscalPeriod.month, postedOn: ledgerEntry.postedOn })
        .from(ledgerEntry)
        .innerJoin(
          fiscalPeriod,
          eq(fiscalPeriod.id, ledgerEntry.fiscalPeriodId)
        )
        .where(eq(ledgerEntry.postingId, first.posting.id));
      // 30 April is the first month (April) even though it posted on 1 May.
      expect(entry).toEqual({ month: 1, postedOn: "2026-05-01" });
      const count = await tx
        .select({ id: posting.id })
        .from(posting)
        .where(eq(posting.sourceId, input.sourceId));
      expect(count).toHaveLength(1);
    });
  }
);

it.skipIf(!localDatabase)(
  "reverses by appending mirrored rows, once",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const { posting: original } = await post(tx, receipt(ids.bank), {
        actorId: ids.user,
        now: NOW,
      });
      expect(
        await codeOf(() =>
          reverse(tx, original.id, { actorId: ids.user, reason: " " })
        )
      ).toBe("invalid");
      const first = await reverse(tx, original.id, {
        actorId: ids.user,
        now: NOW,
        reason: "Wrong account",
      });
      const again = await reverse(tx, original.id, {
        actorId: ids.user,
        reason: "Wrong account",
      });
      expect(again.posting.id).toBe(first.posting.id);
      expect(first.posting).toMatchObject({
        action: "reverse:post",
        reason: "Wrong account",
        reversesPostingId: original.id,
      });
      const [movement] = await tx
        .select()
        .from(accountMovement)
        .where(eq(accountMovement.postingId, first.posting.id));
      expect(movement).toMatchObject({ amountPaise: 5000, direction: "out" });
      const [entry] = await tx
        .select()
        .from(ledgerEntry)
        .where(eq(ledgerEntry.postingId, first.posting.id));
      expect(entry).toMatchObject({ amountPaise: 5000, effect: "decrease" });
      expect(
        await codeOf(() =>
          reverse(tx, first.posting.id, { actorId: ids.user, reason: "Again" })
        )
      ).toBe("invalid");
    });
  }
);

// The year 2026-27 has ended by then.
const AFTER_YEAR_END = new Date("2027-04-02T06:00:00Z");

it.skipIf(!localDatabase)(
  "closes only an ended year with its opening balances, then refuses postings until reopened",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      // Not ended yet: blocked even with everything else in place.
      const running = await yearCloseChecklist(tx, ids.yearId, NOW);
      expect(running.canClose).toBe(false);
      expect(running.checks.find((c) => c.id === "year_ended")).toMatchObject({
        ok: false,
        required: true,
      });
      expect(
        await codeOf(() =>
          closeYear(tx, ids.yearId, { actorId: ids.user, now: NOW })
        )
      ).toBe("invalid");
      // Ended, but the cutover year still needs its opening balances.
      expect(
        await codeOf(() =>
          closeYear(tx, ids.yearId, {
            actorId: ids.user,
            now: AFTER_YEAR_END,
          })
        )
      ).toBe("invalid");
      await postOpeningBalance(
        tx,
        {
          caConfirmedOn: "2026-04-15",
          caName: "Test CA",
          fiscalYearId: ids.yearId,
          id: uuidv7(),
          lines: [
            { amountPaise: 1000, kind: "account", orgAccountId: ids.bank },
            { amountPaise: 1000, fundId: GENERAL_FUND_ID, kind: "fund" },
          ],
        },
        { actorId: ids.user, now: NOW }
      );
      const checklist = await yearCloseChecklist(
        tx,
        ids.yearId,
        AFTER_YEAR_END
      );
      expect(checklist.canClose).toBe(true);
      // The pre-cutover 2025-26 is not the books' business.
      expect(
        checklist.checks.some((c) => c.id === "previous_year_closed")
      ).toBe(false);
      await closeYear(tx, ids.yearId, {
        actorId: ids.user,
        now: AFTER_YEAR_END,
      });
      expect(
        await codeOf(() =>
          post(tx, receipt(ids.bank), { actorId: ids.user, now: NOW })
        )
      ).toBe("closed_year");
      expect(
        await codeOf(() =>
          reopenYear(
            tx,
            { fiscalYearId: ids.yearId, reason: "no" },
            { actorId: ids.user }
          )
        )
      ).toBe("invalid");
      await reopenYear(
        tx,
        { fiscalYearId: ids.yearId, reason: "CA found a missing receipt" },
        { actorId: ids.user, now: AFTER_YEAR_END }
      );
      const { created } = await post(tx, receipt(ids.bank), {
        actorId: ids.user,
        now: NOW,
      });
      expect(created).toBe(true);
      const events = await tx
        .select({
          action: fiscalYearEvent.action,
          reason: fiscalYearEvent.reason,
        })
        .from(fiscalYearEvent)
        .where(eq(fiscalYearEvent.fiscalYearId, ids.yearId))
        .orderBy(fiscalYearEvent.occurredAt, fiscalYearEvent.id);
      expect(events.slice(-2)).toEqual([
        { action: "close", reason: null },
        { action: "reopen", reason: "CA found a missing receipt" },
      ]);
    });
  }
);

it.skipIf(!localDatabase)(
  "won't close a year while one of its bank lines is open",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      await postOpeningBalance(
        tx,
        {
          caConfirmedOn: "2026-04-15",
          caName: "Test CA",
          fiscalYearId: ids.yearId,
          id: uuidv7(),
          lines: [
            { amountPaise: 1000, kind: "account", orgAccountId: ids.bank },
            { amountPaise: 1000, fundId: GENERAL_FUND_ID, kind: "fund" },
          ],
        },
        { actorId: ids.user, now: NOW }
      );
      const lineId = uuidv7();
      await tx.insert(statementLine).values({
        amountPaise: 30_000,
        createdAt: NOW,
        direction: "debit",
        id: lineId,
        lineHash: `h1:${uuidv7()}`,
        orgAccountId: ids.bank,
        position: 1,
        updatedAt: NOW,
        valueOn: "2026-09-12",
      });
      const open = await yearCloseChecklist(tx, ids.yearId, AFTER_YEAR_END);
      expect(open.canClose).toBe(false);
      expect(open.checks.find((c) => c.id === "open_bank_lines")).toMatchObject(
        { ok: false, required: true }
      );
      expect(
        await codeOf(() =>
          closeYear(tx, ids.yearId, { actorId: ids.user, now: AFTER_YEAR_END })
        )
      ).toBe("invalid");
      await tx
        .update(statementLine)
        .set({
          matchKind: "other",
          matchStatus: "matched",
          matchedAt: NOW,
        })
        .where(eq(statementLine.id, lineId));
      const explained = await yearCloseChecklist(
        tx,
        ids.yearId,
        AFTER_YEAR_END
      );
      expect(
        explained.checks.find((c) => c.id === "open_bank_lines")
      ).toMatchObject({ ok: true });
    });
  }
);

it.skipIf(!localDatabase)(
  "closes years in order and reopens them in reverse order",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const [next] = await tx
        .select()
        .from(fiscalYear)
        .where(eq(fiscalYear.startsOn, "2027-04-01"));
      if (!next) {
        throw new Error("Seed 2027-28 first");
      }
      const afterNextEnd = new Date("2028-04-02T06:00:00Z");
      // 2027-28 waits for 2026-27.
      const blocked = await yearCloseChecklist(tx, next.id, afterNextEnd);
      expect(
        blocked.checks.find((c) => c.id === "previous_year_closed")
      ).toMatchObject({ ok: false, required: true });
      expect(
        await codeOf(() =>
          closeYear(tx, next.id, { actorId: ids.user, now: afterNextEnd })
        )
      ).toBe("invalid");
      await postOpeningBalance(
        tx,
        {
          caConfirmedOn: "2026-04-15",
          caName: "Test CA",
          fiscalYearId: ids.yearId,
          id: uuidv7(),
          lines: [
            { amountPaise: 1000, kind: "account", orgAccountId: ids.bank },
            { amountPaise: 1000, fundId: GENERAL_FUND_ID, kind: "fund" },
          ],
        },
        { actorId: ids.user, now: NOW }
      );
      await closeYear(tx, ids.yearId, {
        actorId: ids.user,
        now: AFTER_YEAR_END,
      });
      await closeYear(tx, next.id, { actorId: ids.user, now: afterNextEnd });
      // 2026-27 can't reopen while 2027-28 is closed.
      expect(
        await codeOf(() =>
          reopenYear(
            tx,
            { fiscalYearId: ids.yearId, reason: "Late correction" },
            { actorId: ids.user }
          )
        )
      ).toBe("invalid");
      await reopenYear(
        tx,
        { fiscalYearId: next.id, reason: "Late correction" },
        { actorId: ids.user }
      );
      await reopenYear(
        tx,
        { fiscalYearId: ids.yearId, reason: "Late correction" },
        { actorId: ids.user }
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "posts balanced opening balances once and allows a corrected repost after reversal",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const lines = [
        { amountPaise: 700, kind: "account" as const, orgAccountId: ids.bank },
        { amountPaise: 300, kind: "account" as const, orgAccountId: ids.fd },
        { amountPaise: 50, kind: "asset" as const, memo: "Test machine" },
        { amountPaise: 10, kind: "liability" as const },
        { amountPaise: 40, fundId: CORPUS_FUND_ID, kind: "fund" as const },
        { amountPaise: 1000, fundId: GENERAL_FUND_ID, kind: "fund" as const },
      ];
      const input = {
        caConfirmedOn: "2026-04-15",
        caName: "Test CA",
        fiscalYearId: ids.yearId,
        id: uuidv7(),
        lines,
      };
      expect(
        await codeOf(() =>
          postOpeningBalance(
            tx,
            { ...input, id: uuidv7(), lines: lines.slice(1) },
            { actorId: ids.user }
          )
        )
      ).toBe("unbalanced");
      const document = await postOpeningBalance(tx, input, {
        actorId: ids.user,
        now: NOW,
      });
      expect(
        await postOpeningBalance(tx, input, { actorId: ids.user })
      ).toEqual(document);
      expect(
        await codeOf(() =>
          postOpeningBalance(
            tx,
            { ...input, caConfirmedOn: "2026-05-01", id: uuidv7() },
            { actorId: ids.user, now: new Date("2026-04-30T06:00:00Z") }
          )
        )
      ).toBe("invalid_date");
      expect(
        await codeOf(() =>
          postOpeningBalance(
            tx,
            { ...input, id: uuidv7() },
            { actorId: ids.user }
          )
        )
      ).toBe("invalid");
      const movements = await tx
        .select()
        .from(accountMovement)
        .where(eq(accountMovement.postingId, document.postingId));
      expect(movements.map((m) => [m.kind, m.occurredOn]).sort()).toEqual([
        ["opening", "2026-04-01"],
        ["opening", "2026-04-01"],
      ]);
      await reverseOpeningBalance(
        tx,
        { id: document.id, reason: "CA corrected the FD" },
        { actorId: ids.user, now: NOW }
      );
      const replacement = await postOpeningBalance(
        tx,
        { ...input, id: uuidv7() },
        { actorId: ids.user, now: NOW }
      );
      expect(replacement.id).not.toBe(document.id);
    });
  }
);

/** Runs a statement that must be refused, inside a savepoint. */
async function refusal(tx: LedgerTx, run: () => Promise<unknown>) {
  await tx.execute(sql`SAVEPOINT refusal`);
  let message = "";
  try {
    await run();
  } catch (error) {
    message = String((error as Error).cause ?? error);
  }
  await tx.execute(sql`ROLLBACK TO SAVEPOINT refusal`);
  return message;
}

it.skipIf(!localDatabase)(
  "refuses updates, deletes and truncates of the books in the database",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const { posting: created } = await post(tx, receipt(ids.bank), {
        actorId: ids.user,
        now: NOW,
      });
      expect(
        await refusal(tx, () =>
          tx
            .update(accountMovement)
            .set({ amountPaise: 1 })
            .where(eq(accountMovement.postingId, created.id))
        )
      ).toContain("append-only");
      expect(
        await refusal(tx, () =>
          tx.delete(ledgerEntry).where(eq(ledgerEntry.postingId, created.id))
        )
      ).toContain("append-only");
      expect(
        await refusal(tx, () => tx.execute(sql`TRUNCATE "movement_allocation"`))
      ).toContain("TRUNCATE");

      const document = await postOpeningBalance(
        tx,
        {
          caConfirmedOn: "2026-04-15",
          caName: "Test CA",
          fiscalYearId: ids.yearId,
          id: uuidv7(),
          lines: [
            { amountPaise: 1000, kind: "account", orgAccountId: ids.bank },
            { amountPaise: 1000, fundId: GENERAL_FUND_ID, kind: "fund" },
          ],
        },
        { actorId: ids.user, now: NOW }
      );
      expect(
        await refusal(tx, () =>
          tx
            .update(openingBalance)
            .set({ caName: "Someone else" })
            .where(eq(openingBalance.id, document.id))
        )
      ).toContain("Opening balances are final");
      expect(
        await refusal(tx, () =>
          tx.delete(openingBalance).where(eq(openingBalance.id, document.id))
        )
      ).toContain("Opening balances are final");
      // A deleted login's reference may become NULL.
      await tx
        .update(openingBalance)
        .set({ createdBy: null })
        .where(eq(openingBalance.id, document.id));

      await closeYear(tx, ids.yearId, {
        actorId: ids.user,
        now: AFTER_YEAR_END,
      });
      expect(
        await refusal(tx, () =>
          tx
            .update(fiscalYearEvent)
            .set({ reason: "Rewritten" })
            .where(eq(fiscalYearEvent.fiscalYearId, ids.yearId))
        )
      ).toContain("append-only");
      expect(
        await refusal(tx, () =>
          tx
            .delete(fiscalYearEvent)
            .where(eq(fiscalYearEvent.fiscalYearId, ids.yearId))
        )
      ).toContain("append-only");
      await tx
        .update(fiscalYearEvent)
        .set({ actorId: null })
        .where(eq(fiscalYearEvent.fiscalYearId, ids.yearId));
    });
  }
);

// ── Concurrency ──────────────────────────────────────────────────────────────
// These need committed state seen by several connections, so they commit and
// then put the database back (removing their own year history with the
// maintenance switch). They need the 2026-27 opening balances to stand (the
// dev seed posts fake ones). In this file so they never run alongside the
// rolled-back tests above, whose open transactions hold the year rows.

function connect() {
  const client = new SQL(databaseUrl as string, { max: 2 });
  return { client, database: drizzle({ client, schema }) };
}

/**
 * Holds the books tests' lock (see inRolledBackTransaction) on its own
 * session while a committing test runs, so no rolled-back test in another
 * file holds the year rows meanwhile.
 */
async function exclusively(work: () => Promise<void>) {
  const client = new SQL(databaseUrl as string, { max: 1 });
  const reserved = await client.reserve();
  try {
    await reserved`SELECT pg_advisory_lock(hashtextextended('ledger:db-tests', 0))`;
    await work();
  } finally {
    await reserved`SELECT pg_advisory_unlock(hashtextextended('ledger:db-tests', 0))`;
    reserved.release();
    await client.close();
  }
}

it.skipIf(!localDatabase)(
  "installs the guards once when several servers start together",
  () =>
    exclusively(async () => {
      // Imported here: the module reads the app's database settings on load.
      const { ensureLedgerTriggers } = await import("./immutability");
      const setup = connect();
      const runners = Array.from({ length: 4 }, connect);
      try {
        // An outdated version makes every start want to replace the functions.
        await setup.database.execute(
          sql`COMMENT ON FUNCTION "ledger_reject_change"() IS 'outdated'`
        );
        const results = await Promise.all(
          runners.map(({ database }) => ensureLedgerTriggers(database as never))
        );
        const replaced = results.filter((r) => r.includes("functions"));
        expect(replaced).toHaveLength(1);
        expect(results.filter((r) => r.length === 0)).toHaveLength(3);
        expect(await ensureLedgerTriggers(setup.database as never)).toEqual([]);
      } finally {
        await Promise.all(
          [setup, ...runners].map(({ client }) => client.close())
        );
      }
    })
);

it.skipIf(!localDatabase)(
  "never lets closing a later year and reopening an earlier one both commit",
  () =>
    exclusively(async () => {
      const { client, database } = connect();
      const other = connect();
      const startedAt = new Date();
      const afterFirstEnd = new Date("2027-04-02T06:00:00Z");
      const afterSecondEnd = new Date("2028-04-02T06:00:00Z");
      const years = await database
        .select()
        .from(fiscalYear)
        .where(inArray(fiscalYear.label, ["2026-27", "2027-28"]))
        .orderBy(fiscalYear.startsOn);
      const [first, second] = years;
      const [someone] = await database
        .select({ id: user.id })
        .from(user)
        .limit(1);
      const [opening] = first
        ? await database
            .select({ id: openingBalance.id })
            .from(openingBalance)
            .where(
              and(
                eq(openingBalance.fiscalYearId, first.id),
                isNull(openingBalance.reversalPostingId)
              )
            )
        : [];
      if (!(first && second && someone && opening)) {
        throw new Error("Seed the books first (bun run seed)");
      }
      const actor = { actorId: someone.id };
      // The seeded income records count as looked at for this test (else a
      // freshly seeded database can't close 2026-27); removed afterwards.
      const marked = await database.transaction(async (tx) => {
        const sources = await listIncomeSources(tx as unknown as LedgerTx);
        if (sources.length === 0) {
          return [];
        }
        const inserted = await tx
          .insert(ledgerSourceState)
          .values(
            sources.map((source) => ({
              ...source,
              checkedAt: startedAt,
              id: uuidv7(),
              status: "none" as const,
            }))
          )
          .onConflictDoNothing()
          .returning({ id: ledgerSourceState.id });
        return inserted.map((r) => r.id);
      });
      try {
        await database.transaction((tx) =>
          closeYear(tx as unknown as LedgerTx, first.id, {
            ...actor,
            now: afterFirstEnd,
          })
        );
        // Race: close 2027-28 (needs 2026-27 closed) against reopening
        // 2026-27 (needs 2027-28 open).
        const outcomes = await Promise.allSettled([
          database.transaction((tx) =>
            closeYear(tx as unknown as LedgerTx, second.id, {
              ...actor,
              now: afterSecondEnd,
            })
          ),
          other.database.transaction((tx) =>
            reopenYear(
              tx as unknown as LedgerTx,
              { fiscalYearId: first.id, reason: "Concurrency test" },
              actor
            )
          ),
        ]);
        expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(
          1
        );
        const after = await database
          .select({ closedAt: fiscalYear.closedAt, id: fiscalYear.id })
          .from(fiscalYear)
          .where(inArray(fiscalYear.id, [first.id, second.id]));
        const closed = new Map(after.map((y) => [y.id, y.closedAt !== null]));
        // Either both closed (the close won) or neither (the reopen won):
        // never 2027-28 closed on top of an open 2026-27.
        expect(closed.get(second.id) && !closed.get(first.id)).toBe(false);
      } finally {
        await database.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL pi_dash.ledger_maintenance = 'on'`);
          await tx
            .update(fiscalYear)
            .set({ closedAt: null, closedBy: null })
            .where(inArray(fiscalYear.id, [first.id, second.id]));
          await tx
            .delete(fiscalYearEvent)
            .where(
              and(
                inArray(fiscalYearEvent.fiscalYearId, [first.id, second.id]),
                gte(fiscalYearEvent.id, uuidv7AtOrBefore(startedAt))
              )
            );
        });
        if (marked.length > 0) {
          await database
            .delete(ledgerSourceState)
            .where(inArray(ledgerSourceState.id, marked));
        }
        await Promise.all([client.close(), other.client.close()]);
      }
    })
);

/** The smallest uuidv7 for an instant, to select rows created since then. */
function uuidv7AtOrBefore(at: Date): string {
  const hex = at.getTime().toString(16).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-000000000000`;
}
