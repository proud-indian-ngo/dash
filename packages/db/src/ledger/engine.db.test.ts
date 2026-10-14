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
  fiscalPeriod,
  fiscalYear,
  fund,
  orgAccount,
} from "../schema/finance-dimensions";
import {
  accountMovement,
  fiscalYearEvent,
  ledgerEntry,
  openingBalance,
  posting,
} from "../schema/ledger";
import { type LedgerTx, post, reverse } from "./engine";
import { postOpeningBalance, reverseOpeningBalance } from "./opening-balance";
import { LedgerError } from "./rules";
import { closeYear, reopenYear, yearCloseChecklist } from "./year-close";

/**
 * Database-backed checks of the posting engine. Opt in with
 * LEDGER_TEST_DATABASE_URL pointing exactly at localhost:5462 (the wt1
 * worktree database, migrated and seeded). Every test runs in a transaction
 * that is rolled back, with synthetic records and fake amounts only.
 */

const databaseUrl = process.env.LEDGER_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):5462\//.test(
    databaseUrl
  );

class Rollback extends Error {}

async function inRolledBackTransaction(run: (tx: LedgerTx) => Promise<void>) {
  const client = new SQL(databaseUrl as string, { max: 1 });
  const database = drizzle({ client, schema });
  try {
    await database.transaction(async (tx) => {
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
  await tx.delete(openingBalance);
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

it.skipIf(!localDatabase)(
  "refuses a closed year until it is reopened, keeping the history",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      // The cutover year needs its opening balances before it can close.
      expect(
        await codeOf(() => closeYear(tx, ids.yearId, { actorId: ids.user }))
      ).toBe("invalid");
      await postOpeningBalance(
        tx,
        {
          caConfirmedOn: "2026-10-01",
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
      const checklist = await yearCloseChecklist(tx, ids.yearId, NOW);
      expect(checklist.canClose).toBe(true);
      expect(checklist.checks.find((c) => c.id === "year_ended")?.ok).toBe(
        false
      );
      await closeYear(tx, ids.yearId, { actorId: ids.user, now: NOW });
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
        { actorId: ids.user, now: NOW }
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
        caConfirmedOn: "2026-10-01",
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

it.skipIf(!localDatabase)(
  "refuses updates and deletes of posted rows in the database",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const { posting: created } = await post(tx, receipt(ids.bank), {
        actorId: ids.user,
        now: NOW,
      });
      await tx.execute(sql`SAVEPOINT immutability`);
      let message = "";
      try {
        await tx
          .update(accountMovement)
          .set({ amountPaise: 1 })
          .where(eq(accountMovement.postingId, created.id));
      } catch (error) {
        message = String((error as Error).cause ?? error);
      }
      expect(message).toContain("append-only");
      await tx.execute(sql`ROLLBACK TO SAVEPOINT immutability`);
      message = "";
      try {
        await tx
          .delete(ledgerEntry)
          .where(eq(ledgerEntry.postingId, created.id));
      } catch (error) {
        message = String((error as Error).cause ?? error);
      }
      expect(message).toContain("append-only");
      await tx.execute(sql`ROLLBACK TO SAVEPOINT immutability`);
    });
  }
);
