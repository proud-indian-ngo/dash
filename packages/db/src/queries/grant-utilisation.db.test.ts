import { GENERAL_FUND_ID } from "@pi-dash/shared/constants";
import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

import { type LedgerTx, post, reverse } from "../ledger/engine";
// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "../schema";
import {
  accountHead,
  fiscalYear,
  orgAccount,
  programme,
  project,
} from "../schema/finance-dimensions";
import { grantAgreement, grantTranche } from "../schema/grant";
import { contribution, contributionRefund } from "../schema/income";
import { party } from "../schema/party";
import { loadGrantUtilisation } from "./grant-utilisation";

/**
 * Database-backed checks of the grant utilisation query and the link
 * constraints. Opt in with LEDGER_TEST_DATABASE_URL pointing at a local,
 * migrated and seeded database (a worktree's isolated database). Runs in a
 * transaction that is rolled back, with synthetic records and fake amounts.
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

/** Runs a statement the database must refuse, inside a savepoint. */
async function refused(tx: LedgerTx, run: () => Promise<unknown>) {
  await tx.execute(sql`SAVEPOINT refused`);
  try {
    await run();
  } catch {
    await tx.execute(sql`ROLLBACK TO SAVEPOINT refused`);
    return true;
  }
  await tx.execute(sql`RELEASE SAVEPOINT refused`);
  return false;
}

const NOW = new Date("2026-10-17T05:00:00Z");

async function fixture(tx: LedgerTx) {
  // Nothing closed or frozen, whatever the database's own years are doing.
  await tx.update(fiscalYear).set({ closedAt: null, closedBy: null });
  const ids = {
    account: uuidv7(),
    food: uuidv7(),
    grant: uuidv7(),
    grantor: uuidv7(),
    otherGiver: uuidv7(),
    otherProject: uuidv7(),
    programme: uuidv7(),
    project: uuidv7(),
    tranche: uuidv7(),
    travel: uuidv7(),
  };
  const tag = ids.programme.slice(-6).toUpperCase();
  await tx.insert(programme).values({
    code: `GT${tag}`,
    createdAt: NOW,
    id: ids.programme,
    name: `Grant test ${ids.programme}`,
    updatedAt: NOW,
  });
  await tx.insert(project).values(
    [ids.project, ids.otherProject].map((id, i) => ({
      code: `GTP${i}${tag}`,
      createdAt: NOW,
      id,
      name: `Grant test project ${id}`,
      programmeId: ids.programme,
      updatedAt: NOW,
    }))
  );
  await tx.insert(accountHead).values(
    (["travel", "food"] as const).map((key) => ({
      code: `GT_${key}_${tag}`.toUpperCase(),
      createdAt: NOW,
      id: ids[key],
      name: `Grant test ${key}`,
      type: "expense" as const,
      updatedAt: NOW,
    }))
  );
  await tx.insert(party).values(
    [ids.grantor, ids.otherGiver].map((id) => ({
      createdAt: NOW,
      displayName: `Grant test party ${id}`,
      id,
      kind: "organisation" as const,
      updatedAt: NOW,
    }))
  );
  await tx.insert(orgAccount).values({
    createdAt: NOW,
    id: ids.account,
    kind: "bank",
    name: `Grant test bank ${ids.account}`,
    updatedAt: NOW,
  });
  await tx.insert(grantAgreement).values({
    createdAt: NOW,
    donationType: "csr",
    endsOn: "2027-03-31",
    id: ids.grant,
    partyId: ids.grantor,
    programmeId: ids.programme,
    projectId: ids.project,
    sanctionedPaise: 1_000_000,
    startsOn: "2026-06-01",
    title: "Grant test",
    updatedAt: NOW,
  });
  await tx.insert(grantTranche).values({
    amountPaise: 500_000,
    expectedOn: "2026-06-01",
    grantId: ids.grant,
    id: ids.tranche,
  });
  return ids;
}

type Ids = Awaited<ReturnType<typeof fixture>>;

const gift = (
  ids: Ids,
  values: Partial<typeof contribution.$inferInsert> & {
    amountPaise: number;
    receivedOn: string;
  }
) => ({
  channel: "neft" as const,
  createdAt: NOW,
  fundId: GENERAL_FUND_ID,
  id: uuidv7(),
  orgAccountId: ids.account,
  partyId: ids.grantor,
  programmeId: ids.programme,
  projectId: ids.project,
  reportingMode: "electronic_or_account_payee" as const,
  updatedAt: NOW,
  ...values,
});

it.skipIf(!localDatabase)(
  "answers received, brought forward and spent by head for a range",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await fixture(tx);
      const first = gift(ids, {
        amountPaise: 500_000,
        grantId: ids.grant,
        grantTrancheId: ids.tranche,
        receivedOn: "2026-06-05",
        reference: "UTR-1",
      });
      const second = gift(ids, {
        amountPaise: 300_000,
        grantId: ids.grant,
        receivedOn: "2026-10-10",
      });
      // Reversed and pending gifts are not money received.
      const reversed = gift(ids, {
        amountPaise: 70_000,
        grantId: ids.grant,
        receivedOn: "2026-10-11",
        status: "reversed",
      });
      const pending = gift(ids, {
        amountPaise: 60_000,
        grantId: ids.grant,
        receivedOn: "2026-10-12",
        status: "pending",
      });
      // Refunded in full: received gross, then the refund on its own date.
      const refunded = gift(ids, {
        amountPaise: 40_000,
        grantId: ids.grant,
        receivedOn: "2026-10-20",
        status: "refunded",
      });
      // Received after the range ends.
      const later = gift(ids, {
        amountPaise: 90_000,
        grantId: ids.grant,
        receivedOn: "2027-01-05",
      });
      await tx
        .insert(contribution)
        .values([first, second, reversed, pending, refunded, later]);
      // Refunds are their own rows, by refund date; one after the range.
      await tx.insert(contributionRefund).values(
        (
          [
            [second.id, 20_000, "2026-10-15"],
            [refunded.id, 40_000, "2026-11-02"],
            [second.id, 5000, "2026-12-20"],
          ] as const
        ).map(([contributionId, amountPaise, refundedOn]) => ({
          amountPaise,
          contributionId,
          createdAt: NOW,
          id: uuidv7(),
          refundedOn,
          source: "manual" as const,
        }))
      );

      const spend = async (
        economicOn: string,
        accountHeadId: string,
        amountPaise: number,
        projectId: string | null = ids.project
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
                  programmeId: ids.programme,
                  ...(projectId ? { projectId } : {}),
                },
              ],
              movements: [],
              sourceId: uuidv7(),
              sourceType: "test_source",
            },
            { actorId: null, now: NOW }
          )
        ).posting;
      // Before the range: travel 100,000.
      await spend("2026-07-01", ids.travel, 100_000);
      // Within the range: travel 40,000, food 25,000; a reversed food
      // expense nets to nothing.
      await spend("2026-10-02", ids.travel, 40_000);
      await spend("2026-10-03", ids.food, 25_000);
      const voided = await spend("2026-10-04", ids.food, 70_000);
      await reverse(tx, voided.id, {
        actorId: null,
        now: NOW,
        reason: "Grant test reversal",
      });
      // Outside the grant's period, after the range, on another project or
      // on the programme alone: none of it counts.
      await spend("2026-05-20", ids.travel, 11_000);
      await spend("2026-12-05", ids.travel, 12_000);
      await spend("2026-10-05", ids.travel, 13_000, ids.otherProject);
      await spend("2026-10-06", ids.travel, 14_000, null);

      const rows = await loadGrantUtilisation(tx, {
        from: "2026-10-01",
        grantIds: [ids.grant],
        to: "2026-11-30",
      });
      expect(
        rows.receipts.map((r) => [r.contributionId, r.paise, r.trancheId])
      ).toEqual([
        [first.id, 500_000, ids.tranche],
        [second.id, 300_000, null],
        [refunded.id, 40_000, null],
      ]);
      expect(rows.receipts[0]?.reference).toBe("UTR-1");
      expect(rows.refunds.map((r) => [r.contributionId, r.paise])).toEqual([
        [second.id, 20_000],
        [refunded.id, 40_000],
      ]);
      expect(
        rows.spend
          .map((s) => [s.accountHeadId, s.period, s.paise])
          .sort((a, b) => String(a).localeCompare(String(b)))
      ).toEqual(
        [
          [ids.travel, "before", 100_000],
          [ids.travel, "within", 40_000],
          [ids.food, "within", 25_000],
        ].sort((a, b) => String(a).localeCompare(String(b)))
      );

      // The whole grant to its end: nothing before, and December's 12,000
      // now inside the range.
      const toDate = await loadGrantUtilisation(tx, {
        from: null,
        grantIds: [ids.grant],
        to: "2027-03-31",
      });
      expect(toDate.receipts).toHaveLength(4);
      expect(toDate.refunds).toHaveLength(3);
      expect(toDate.spend.every((s) => s.period === "within")).toBe(true);
      expect(toDate.spend.reduce((total, s) => total + s.paise, 0)).toBe(
        177_000
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "refuses an overlapping grant on a project and links that don't match the grant",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await fixture(tx);
      expect(
        await refused(tx, () =>
          tx.insert(grantAgreement).values({
            createdAt: NOW,
            donationType: "specific_grant",
            endsOn: "2027-03-31",
            id: uuidv7(),
            partyId: ids.otherGiver,
            programmeId: ids.programme,
            projectId: ids.project,
            sanctionedPaise: 100,
            startsOn: "2026-06-01",
            title: "Second grant",
            updatedAt: NOW,
          })
        )
      ).toBe(true);
      // The next period on the same project is fine.
      expect(
        await refused(tx, () =>
          tx.insert(grantAgreement).values({
            createdAt: NOW,
            donationType: "specific_grant",
            endsOn: "2028-03-31",
            id: uuidv7(),
            partyId: ids.otherGiver,
            programmeId: ids.programme,
            projectId: ids.project,
            sanctionedPaise: 100,
            startsOn: "2027-04-01",
            title: "Next grant",
            updatedAt: NOW,
          })
        )
      ).toBe(false);
      // Another giver, another project, or no project at all.
      for (const values of [
        { partyId: ids.otherGiver },
        {
          channel: "in_kind" as const,
          inKindDescription: "Books",
          inKindValuationBasis: "Invoice",
          orgAccountId: null,
          reportingMode: "in_kind" as const,
        },
        { projectId: ids.otherProject },
        { projectId: null },
      ]) {
        expect(
          await refused(tx, () =>
            tx.insert(contribution).values(
              gift(ids, {
                amountPaise: 1000,
                grantId: ids.grant,
                receivedOn: "2026-07-01",
                ...values,
              })
            )
          )
        ).toBe(true);
      }
      // A tranche needs its grant.
      expect(
        await refused(tx, () =>
          tx.insert(contribution).values(
            gift(ids, {
              amountPaise: 1000,
              grantTrancheId: ids.tranche,
              receivedOn: "2026-07-01",
            })
          )
        )
      ).toBe(true);
      expect(
        await refused(tx, () =>
          tx.insert(contribution).values(
            gift(ids, {
              amountPaise: 1000,
              grantId: ids.grant,
              grantTrancheId: ids.tranche,
              receivedOn: "2026-07-01",
            })
          )
        )
      ).toBe(false);
    });
  }
);

it.skipIf(!localDatabase)(
  "nets voids by the reversed entry's date and counts cash only",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await fixture(tx);
      const spend = async (
        economicOn: string,
        amountPaise: number,
        medium: "in_kind" | "monetary" = "monetary"
      ) =>
        (
          await post(
            tx,
            {
              action: "recognise",
              economicOn,
              entries: [
                {
                  accountHeadId: ids.travel,
                  amountPaise,
                  effect: "increase",
                  fundId: GENERAL_FUND_ID,
                  medium,
                  programmeId: ids.programme,
                  projectId: ids.project,
                },
              ],
              movements: [],
              sourceId: uuidv7(),
              sourceType: "test_source",
            },
            { actorId: null, now: NOW }
          )
        ).posting;
      const voidOn = async (postingId: string, on: string) =>
        await reverse(tx, postingId, {
          actorId: null,
          now: NOW,
          on,
          reason: "Grant test void",
        });
      const total = async (from: string | null, to: string) => {
        const rows = await loadGrantUtilisation(tx, {
          from,
          grantIds: [ids.grant],
          to,
        });
        return {
          before: rows.spend
            .filter((s) => s.period === "before")
            .reduce((sum, s) => sum + s.paise, 0),
          within: rows.spend
            .filter((s) => s.period === "within")
            .reduce((sum, s) => sum + s.paise, 0),
        };
      };

      // Spent in the period, voided after the grant ended: the void still
      // takes it off, on the void's own date.
      await voidOn((await spend("2026-07-01", 50_000)).id, "2027-04-10");
      // Spent before the grant started, voided inside its period: neither
      // counts, so nothing goes negative.
      await voidOn((await spend("2026-05-01", 30_000)).id, "2026-08-01");
      // Spent in the period and voided after the range: still spent then.
      await voidOn((await spend("2026-09-01", 20_000)).id, "2027-04-20");
      // In-kind consumption is not cash.
      await spend("2026-09-15", 9000, "in_kind");

      // Up to the end of the grant, before any void after it.
      expect(await total(null, "2027-03-31")).toEqual({
        before: 0,
        within: 70_000,
      });
      // After both voids: everything nets to nothing.
      expect(await total(null, "2027-04-30")).toEqual({
        before: 0,
        within: 0,
      });
      // A range starting after the spend: it is brought forward, and the
      // voids land within the range.
      expect(await total("2027-01-01", "2027-04-30")).toEqual({
        before: 70_000,
        within: -70_000,
      });
    });
  }
);
