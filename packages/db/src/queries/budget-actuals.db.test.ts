import { GENERAL_FUND_ID } from "@pi-dash/shared/constants";
import { SQL } from "bun";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

import { type LedgerTx, post, reverse } from "../ledger/engine";
// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "../schema";
import {
  accountHead,
  fiscalYear,
  programme,
  project,
} from "../schema/finance-dimensions";
import { loadBudgetActuals } from "./budget-actuals";

/**
 * Database-backed checks of the budget actuals query. Opt in with
 * LEDGER_TEST_DATABASE_URL pointing at a local, migrated and seeded
 * database (a worktree's isolated database). Runs in a transaction that is
 * rolled back, with synthetic records and fake amounts only.
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
      // One books test transaction at a time across test files.
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

const NOW = new Date("2026-10-17T05:00:00Z");

it.skipIf(!localDatabase)(
  "sums the year's expense per programme, project and head, net of reversals",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      // Nothing closed or frozen, whatever the database's own years are doing.
      await tx.update(fiscalYear).set({ closedAt: null, closedBy: null });
      const [year] = await tx
        .select()
        .from(fiscalYear)
        .where(eq(fiscalYear.startsOn, "2026-04-01"));
      if (!year) {
        throw new Error("Seed the finance dimensions first");
      }
      const ids = {
        food: uuidv7(),
        income: uuidv7(),
        programme: uuidv7(),
        project: uuidv7(),
        travel: uuidv7(),
      };
      await tx.insert(programme).values({
        code: `BT${ids.programme.slice(-6)}`.toUpperCase(),
        createdAt: NOW,
        id: ids.programme,
        name: `Budget test ${ids.programme}`,
        updatedAt: NOW,
      });
      await tx.insert(project).values({
        code: `BTP${ids.project.slice(-6)}`.toUpperCase(),
        createdAt: NOW,
        id: ids.project,
        name: `Budget test project ${ids.project}`,
        programmeId: ids.programme,
        updatedAt: NOW,
      });
      await tx.insert(accountHead).values(
        (
          [
            ["travel", "expense"],
            ["food", "expense"],
            ["income", "income"],
          ] as const
        ).map(([key, type]) => ({
          code: `BT_${key}_${ids[key].slice(-6)}`.toUpperCase(),
          createdAt: NOW,
          id: ids[key],
          name: `Budget test ${key}`,
          type,
          updatedAt: NOW,
        }))
      );

      const spend = async (
        economicOn: string,
        accountHeadId: string,
        amountPaise: number,
        dims: { programmeId?: string; projectId?: string } = {}
      ) =>
        (
          await post(
            tx,
            {
              action: "recognise",
              economicOn,
              entries: [
                {
                  accountHeadId,
                  amountPaise,
                  effect: "increase",
                  fundId: GENERAL_FUND_ID,
                  ...dims,
                },
              ],
              movements: [],
              sourceId: uuidv7(),
              sourceType: "test_source",
            },
            { actorId: null, now: NOW }
          )
        ).posting;
      const inProgramme = { programmeId: ids.programme };
      const inProject = { programmeId: ids.programme, projectId: ids.project };

      await spend("2026-05-10", ids.travel, 100_000, inProgramme);
      await spend("2026-06-10", ids.travel, 40_000, inProject);
      // A reversed expense nets to nothing and drops out.
      const voided = await spend("2026-06-11", ids.food, 70_000, inProgramme);
      await reverse(tx, voided.id, {
        actorId: null,
        now: NOW,
        reason: "Budget test reversal",
      });
      // A partly reversed head keeps the rest: 25,000 less a 5,000 refund.
      await spend("2026-07-01", ids.food, 25_000, inProject);
      await post(
        tx,
        {
          action: "recognise",
          economicOn: "2026-07-02",
          entries: [
            {
              accountHeadId: ids.food,
              amountPaise: 5000,
              effect: "decrease",
              fundId: GENERAL_FUND_ID,
              ...inProject,
            },
          ],
          movements: [],
          sourceId: uuidv7(),
          sourceType: "test_source",
        },
        { actorId: null, now: NOW }
      );
      // Spend with no programme still shows, so the total reconciles.
      await spend("2026-08-01", ids.travel, 30_000);
      // Income and other years are left out.
      await spend("2026-08-02", ids.income, 99_000, inProgramme);
      await spend("2027-04-01", ids.travel, 88_000, inProgramme);

      const ours = new Set([ids.travel, ids.food, ids.income]);
      const actuals = (await loadBudgetActuals(tx, year.id))
        .filter((a) => ours.has(a.accountHeadId))
        .sort(
          (a, b) =>
            a.paise - b.paise || a.accountHeadId.localeCompare(b.accountHeadId)
        );
      expect(actuals).toEqual([
        {
          accountHeadId: ids.food,
          paise: 20_000,
          programmeId: ids.programme,
          projectId: ids.project,
        },
        {
          accountHeadId: ids.travel,
          paise: 30_000,
          programmeId: null,
          projectId: null,
        },
        {
          accountHeadId: ids.travel,
          paise: 40_000,
          programmeId: ids.programme,
          projectId: ids.project,
        },
        {
          accountHeadId: ids.travel,
          paise: 100_000,
          programmeId: ids.programme,
          projectId: null,
        },
      ]);
    });
  }
);
