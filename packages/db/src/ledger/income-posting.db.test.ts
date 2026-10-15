import {
  CORPUS_FUND_ID,
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import { SQL } from "bun";
import { and, eq, inArray, sql } from "drizzle-orm";
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
  programme,
} from "../schema/finance-dimensions";
import {
  gatewaySettlement,
  gatewaySettlementItem,
} from "../schema/gateway-settlement";
import {
  contribution,
  contributionRefund,
  otherIncome,
} from "../schema/income";
import {
  accountMovement,
  ledgerEntry,
  ledgerSourceState,
  posting,
} from "../schema/ledger";
import { party } from "../schema/party";
import { statementLine } from "../schema/statement-line";
import type { LedgerTx } from "./engine";
import {
  type IncomeSource,
  listIncomeSources,
  postIncomeSource,
  relatedIncomeSources,
  sweepIncomeSources,
} from "./income-posting";
import { yearCloseChecklist } from "./year-close";

/**
 * Database-backed checks of income posting. Opt in with
 * LEDGER_TEST_DATABASE_URL pointing at a local, migrated and seeded
 * database (a worktree's isolated database). Every test runs in a
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

const NOW = new Date("2026-10-15T06:00:00Z");
const H = LEDGER_ACCOUNT_HEAD_IDS;
const HEADS = [
  ["donationsReceived", "income"],
  ["inKindDonations", "income"],
  ["otherIncome", "income"],
  ["fdInterest", "income"],
  ["inKindConsumed", "expense"],
  ["gatewayCharges", "expense"],
  ["corpusDonations", "fund"],
] as const;

async function foundation(tx: LedgerTx) {
  const [someone] = await tx.select({ id: user.id }).from(user).limit(1);
  if (!someone) {
    throw new Error("Seed a user first");
  }
  const ids = {
    bank: uuidv7(),
    fd: uuidv7(),
    giveDo: uuidv7(),
    party: uuidv7(),
    razorpay: uuidv7(),
    user: someone.id,
  };
  // One active bank account, so payouts know where they landed.
  await tx
    .update(orgAccount)
    .set({ active: false })
    .where(eq(orgAccount.kind, "bank"));
  await tx.insert(orgAccount).values(
    (
      [
        [ids.bank, "bank"],
        [ids.razorpay, "gateway_clearing"],
        [ids.giveDo, "gateway_clearing"],
        [ids.fd, "deposit"],
      ] as const
    ).map(([id, kind]) => ({
      createdAt: NOW,
      id,
      kind,
      name: `Income test ${kind} ${id}`,
      updatedAt: NOW,
    }))
  );
  await tx
    .insert(accountHead)
    .values(
      HEADS.map(([key, type]) => ({
        code: `TEST_${key}`,
        createdAt: NOW,
        id: H[key],
        name: `Test ${key}`,
        type,
        updatedAt: NOW,
      }))
    )
    .onConflictDoNothing();
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
  await tx.insert(party).values({
    createdAt: NOW,
    displayName: "Test donor",
    id: ids.party,
    kind: "person",
    updatedAt: NOW,
  });
  await tx.update(fiscalYear).set({ closedAt: null, closedBy: null });
  await tx.delete(ledgerSourceState);
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
  const programmes = await tx
    .select({ id: programme.id })
    .from(programme)
    .limit(2);
  const [year] = await tx
    .select()
    .from(fiscalYear)
    .where(eq(fiscalYear.startsOn, "2026-04-01"));
  if (!(year && programmes.length === 2)) {
    throw new Error("Seed the finance dimensions first");
  }
  return {
    ...ids,
    programmeA: programmes[0]?.id as string,
    programmeB: programmes[1]?.id as string,
    yearId: year.id,
  };
}

type Ids = Awaited<ReturnType<typeof foundation>>;

async function addGift(
  tx: LedgerTx,
  ids: Ids,
  over: Partial<typeof contribution.$inferInsert> = {}
) {
  const id = uuidv7();
  await tx.insert(contribution).values({
    amountPaise: 100_000,
    channel: "upi",
    createdAt: NOW,
    fundId: GENERAL_FUND_ID,
    id,
    orgAccountId: ids.bank,
    partyId: ids.party,
    programmeId: ids.programmeA,
    receivedOn: "2026-05-10",
    reportingMode: "electronic_or_account_payee",
    updatedAt: NOW,
    ...over,
  });
  return id;
}

async function addSettlement(
  tx: LedgerTx,
  ids: Ids,
  over: Partial<typeof gatewaySettlement.$inferInsert>,
  items: Partial<typeof gatewaySettlementItem.$inferInsert>[]
) {
  const id = uuidv7();
  await tx.insert(gatewaySettlement).values({
    amountPaise: 0,
    createdAt: NOW,
    externalId: `setl_${id}`,
    id,
    orgAccountId: ids.razorpay,
    provider: "razorpay",
    providerAccount: "test",
    settledOn: "2026-05-12",
    status: "processed",
    updatedAt: NOW,
    ...over,
  });
  if (items.length > 0) {
    await tx.insert(gatewaySettlementItem).values(
      items.map((item) => ({
        externalId: `pay_${uuidv7()}`,
        id: uuidv7(),
        settledAt: NOW,
        settlementId: id,
        type: "payment" as const,
        ...item,
      }))
    );
  }
  return id;
}

const run = (tx: LedgerTx, source: IncomeSource) =>
  postIncomeSource(tx, source, { actorId: null, now: NOW });

const gift = (sourceId: string): IncomeSource => ({
  sourceId,
  sourceType: "contribution",
});

async function postingsOf(tx: LedgerTx, sourceId: string) {
  return await tx
    .select()
    .from(posting)
    .where(eq(posting.sourceId, sourceId))
    .orderBy(posting.createdAt, posting.id);
}

async function balanceOf(tx: LedgerTx, orgAccountId: string) {
  const [row] = await tx
    .select({
      balance: sql<string>`coalesce(sum(case when ${accountMovement.direction} = 'in' then ${accountMovement.amountPaise} else -${accountMovement.amountPaise} end), 0)`,
    })
    .from(accountMovement)
    .where(eq(accountMovement.orgAccountId, orgAccountId));
  return Number(row?.balance ?? 0);
}

async function netByHead(tx: LedgerTx, postingIds: string[]) {
  const rows = await tx
    .select()
    .from(ledgerEntry)
    .where(inArray(ledgerEntry.postingId, postingIds));
  const net = new Map<string, number>();
  for (const e of rows) {
    net.set(
      e.accountHeadId,
      (net.get(e.accountHeadId) ?? 0) +
        (e.effect === "increase" ? e.amountPaise : -e.amountPaise)
    );
  }
  return net;
}

async function stateOf(tx: LedgerTx, sourceId: string) {
  const [row] = await tx
    .select()
    .from(ledgerSourceState)
    .where(eq(ledgerSourceState.sourceId, sourceId));
  return row;
}

it.skipIf(!localDatabase)(
  "posts a Razorpay gift with its fee once, and a rerun writes nothing",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addGift(tx, ids, {
        channel: "razorpay",
        gatewayFeePaise: 2000,
        gatewayTaxPaise: 360,
        orgAccountId: ids.razorpay,
      });
      expect(await run(tx, gift(id))).toEqual({
        posted: 2,
        reason: null,
        reversed: 0,
        status: "posted",
      });
      expect(await run(tx, gift(id))).toMatchObject({ posted: 0, reversed: 0 });
      const postings = await postingsOf(tx, id);
      expect(postings.map((p) => [p.action, p.sourceRevision])).toEqual([
        ["recognise", 1],
        ["cash", 1],
      ]);
      expect(await balanceOf(tx, ids.razorpay)).toBe(100_000 - 2360);
      const net = await netByHead(
        tx,
        postings.map((p) => p.id)
      );
      expect(net.get(H.donationsReceived)).toBe(100_000);
      expect(net.get(H.gatewayCharges)).toBe(2360);
      expect(await stateOf(tx, id)).toMatchObject({
        postedOn: "2026-10-15",
        status: "posted",
      });
    });
  }
);

it.skipIf(!localDatabase)(
  "reverses and reposts only the recognition when the programme changes",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addGift(tx, ids);
      await run(tx, gift(id));
      await tx
        .update(contribution)
        .set({ programmeId: ids.programmeB })
        .where(eq(contribution.id, id));
      expect(await run(tx, gift(id))).toMatchObject({ posted: 1, reversed: 1 });
      const postings = await postingsOf(tx, id);
      expect(postings.map((p) => [p.action, p.sourceRevision])).toEqual([
        ["recognise", 1],
        ["cash", 1],
        ["reverse:recognise", 1],
        ["recognise", 2],
      ]);
      expect(await balanceOf(tx, ids.bank)).toBe(100_000);
      const entries = await tx
        .select()
        .from(ledgerEntry)
        .where(eq(ledgerEntry.postingId, postings[3]?.id as string));
      expect(entries[0]?.programmeId).toBe(ids.programmeB);
    });
  }
);

it.skipIf(!localDatabase)(
  "reverses the whole posting when the amount changes, and on delete",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addGift(tx, ids);
      await run(tx, gift(id));
      await tx
        .update(contribution)
        .set({ amountPaise: 120_000 })
        .where(eq(contribution.id, id));
      expect(await run(tx, gift(id))).toMatchObject({ posted: 2, reversed: 2 });
      expect(await balanceOf(tx, ids.bank)).toBe(120_000);
      const revisions = (await postingsOf(tx, id)).map((p) => [
        p.action,
        p.sourceRevision,
      ]);
      expect(revisions.slice(-2)).toEqual([
        ["recognise", 2],
        ["cash", 2],
      ]);

      await tx.delete(contribution).where(eq(contribution.id, id));
      expect(await run(tx, gift(id))).toMatchObject({
        reversed: 2,
        status: "none",
      });
      expect(await balanceOf(tx, ids.bank)).toBe(0);
      const reversal = (await postingsOf(tx, id)).at(-1);
      expect(reversal?.reason).toBe("The contribution was deleted");
      expect(await stateOf(tx, id)).toBeUndefined();
    });
  }
);

it.skipIf(!localDatabase)(
  "posts an in-kind gift as income and consumption, with no movement",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addGift(tx, ids, {
        channel: "in_kind",
        orgAccountId: null,
        reportingMode: "in_kind",
      });
      await run(tx, gift(id));
      const postings = await postingsOf(tx, id);
      expect(postings.map((p) => p.action)).toEqual(["recognise"]);
      const net = await netByHead(
        tx,
        postings.map((p) => p.id)
      );
      expect(net.get(H.inKindDonations)).toBe(100_000);
      expect(net.get(H.inKindConsumed)).toBe(100_000);
    });
  }
);

it.skipIf(!localDatabase)(
  "posts a gateway gift captured 30 Mar on its 2 Apr payout day, but not one paid out on 31 Mar",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const april = await addGift(tx, ids, {
        channel: "razorpay",
        orgAccountId: ids.razorpay,
        receivedOn: "2026-03-30",
      });
      const march = await addGift(tx, ids, {
        channel: "razorpay",
        orgAccountId: ids.razorpay,
        receivedOn: "2026-03-30",
      });
      const aprilPayout = await addSettlement(
        tx,
        ids,
        { amountPaise: 100_000, settledOn: "2026-04-02" },
        [{ contributionId: april, creditPaise: 100_000 }]
      );
      await addSettlement(
        tx,
        ids,
        { amountPaise: 100_000, settledOn: "2026-03-31" },
        [{ contributionId: march, creditPaise: 100_000 }]
      );
      expect(
        await relatedIncomeSources(tx, {
          sourceId: aprilPayout,
          sourceType: "gateway_settlement",
        })
      ).toEqual([gift(april)]);
      await run(tx, gift(april));
      await run(tx, {
        sourceId: aprilPayout,
        sourceType: "gateway_settlement",
      });
      expect(await run(tx, gift(march))).toMatchObject({
        reason: "before_cutover",
        status: "none",
      });
      const postings = await postingsOf(tx, april);
      expect(postings.map((p) => p.economicOn)).toEqual([
        "2026-04-02",
        "2026-04-02",
      ]);
      expect(await postingsOf(tx, march)).toEqual([]);
      // The clearing account opens and stays at zero.
      expect(await balanceOf(tx, ids.razorpay)).toBe(0);
      expect(await balanceOf(tx, ids.bank)).toBe(100_000);
    });
  }
);

it.skipIf(!localDatabase)(
  "posts give.do charges at the payout and keeps clearing at zero",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addGift(tx, ids, {
        channel: "give_do",
        gatewayFeePaise: 5000,
        orgAccountId: ids.giveDo,
      });
      const payout = await addSettlement(
        tx,
        ids,
        {
          amountPaise: 95_000,
          orgAccountId: ids.giveDo,
          provider: "give_do",
          providerAccount: "live",
          settledOn: "2026-06-05",
        },
        [{ contributionId: id, creditPaise: 95_000, feePaise: 5000 }]
      );
      await run(tx, gift(id));
      const settled = await run(tx, {
        sourceId: payout,
        sourceType: "gateway_settlement",
      });
      expect(settled).toMatchObject({ posted: 2, status: "posted" });
      expect(await balanceOf(tx, ids.giveDo)).toBe(0);
      expect(await balanceOf(tx, ids.bank)).toBe(95_000);
      const fee = await netByHead(
        tx,
        (await postingsOf(tx, payout)).map((p) => p.id)
      );
      expect(fee.get(H.gatewayCharges)).toBe(5000);
    });
  }
);

it.skipIf(!localDatabase)(
  "follows a matched bank line, and waits for the bank account when several are active",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const payout = await addSettlement(
        tx,
        ids,
        { amountPaise: 50_000, utr: "UTRTEST1" },
        []
      );
      const source: IncomeSource = {
        sourceId: payout,
        sourceType: "gateway_settlement",
      };
      const second = uuidv7();
      await tx.insert(orgAccount).values({
        createdAt: NOW,
        id: second,
        kind: "bank",
        name: `Income test second bank ${second}`,
        updatedAt: NOW,
      });
      expect(await run(tx, source)).toMatchObject({
        reason: "pick_bank_account",
        status: "waiting",
      });
      await tx.insert(statementLine).values({
        amountPaise: 50_000,
        createdAt: NOW,
        direction: "credit",
        id: uuidv7(),
        lineHash: `test-${uuidv7()}`,
        matchedSettlementId: payout,
        matchKind: "settlement",
        matchStatus: "matched",
        orgAccountId: second,
        position: 1,
        updatedAt: NOW,
        valueOn: "2026-05-13",
      });
      expect(await run(tx, source)).toMatchObject({ status: "posted" });
      expect(await balanceOf(tx, second)).toBe(50_000);
      expect((await postingsOf(tx, payout))[0]?.economicOn).toBe("2026-05-13");
    });
  }
);

it.skipIf(!localDatabase)(
  "posts a refund and other income, and keeps Razorpay clearing equal to what awaits settlement",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const settled = await addGift(tx, ids, {
        channel: "razorpay",
        gatewayFeePaise: 2000,
        gatewayTaxPaise: 360,
        orgAccountId: ids.razorpay,
      });
      const awaiting = await addGift(tx, ids, {
        amountPaise: 50_000,
        channel: "razorpay",
        gatewayFeePaise: 1000,
        gatewayTaxPaise: 180,
        orgAccountId: ids.razorpay,
        receivedOn: "2026-05-20",
      });
      const refundId = uuidv7();
      await tx.insert(contributionRefund).values({
        amountPaise: 10_000,
        contributionId: awaiting,
        createdAt: NOW,
        id: refundId,
        reference: `rfnd_${refundId}`,
        refundedOn: "2026-05-21",
        source: "razorpay",
      });
      const payout = await addSettlement(
        tx,
        ids,
        { amountPaise: 100_000 - 2360 },
        [
          {
            contributionId: settled,
            creditPaise: 100_000,
            feePaise: 2000,
            taxPaise: 360,
          },
        ]
      );
      const incomeId = uuidv7();
      await tx.insert(otherIncome).values({
        amountPaise: 3817_00,
        createdAt: NOW,
        fundId: GENERAL_FUND_ID,
        id: incomeId,
        kind: "interest",
        orgAccountId: ids.bank,
        receivedOn: "2026-06-30",
        updatedAt: NOW,
      });
      for (const source of [
        gift(settled),
        gift(awaiting),
        { sourceId: refundId, sourceType: "contribution_refund" },
        { sourceId: payout, sourceType: "gateway_settlement" },
        { sourceId: incomeId, sourceType: "other_income" },
      ] as IncomeSource[]) {
        await run(tx, source);
      }
      // Awaiting settlement: the unsettled gift less its fee and GST, less its refund.
      expect(await balanceOf(tx, ids.razorpay)).toBe(50_000 - 1180 - 10_000);
      expect(await balanceOf(tx, ids.bank)).toBe(100_000 - 2360 + 3817_00);
      const refundNet = await netByHead(
        tx,
        (await postingsOf(tx, refundId)).map((p) => p.id)
      );
      expect(refundNet.get(H.donationsReceived)).toBe(-10_000);
      const interest = await netByHead(
        tx,
        (await postingsOf(tx, incomeId)).map((p) => p.id)
      );
      expect(interest.get(H.fdInterest)).toBe(3817_00);
    });
  }
);

it.skipIf(!localDatabase)(
  "waits while the year is closed and blocks the year close",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addGift(tx, ids);
      await tx
        .update(fiscalYear)
        .set({ closedAt: NOW })
        .where(eq(fiscalYear.id, ids.yearId));
      expect(await run(tx, gift(id))).toMatchObject({
        reason: "year_closed",
        status: "waiting",
      });
      expect(await postingsOf(tx, id)).toEqual([]);
      expect(await stateOf(tx, id)).toMatchObject({
        economicOn: "2026-05-10",
        status: "waiting",
      });
      await tx
        .update(fiscalYear)
        .set({ closedAt: null })
        .where(eq(fiscalYear.id, ids.yearId));
      const checklist = await yearCloseChecklist(
        tx,
        ids.yearId,
        new Date("2027-04-02T06:00:00Z")
      );
      expect(
        checklist.checks.find((c) => c.id === "unposted_sources")
      ).toMatchObject({
        details: ["1 waiting: Year closed"],
        ok: false,
        required: true,
      });
      expect(await run(tx, gift(id))).toMatchObject({ status: "posted" });
    });
  }
);

it.skipIf(!localDatabase)(
  "backfills every source in a sweep, and a second sweep writes nothing",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const first = await addGift(tx, ids);
      const second = await addGift(tx, ids, { receivedOn: "2026-04-01" });
      const old = await addGift(tx, ids, { receivedOn: "2026-03-01" });
      const runner = <T>(work: (inner: LedgerTx) => Promise<T>) =>
        tx.transaction((sp) => work(sp as unknown as LedgerTx));
      const sweep = await sweepIncomeSources({
        actorId: ids.user,
        now: () => NOW,
        run: runner,
      });
      expect(sweep.failed).toBe(0);
      expect((await postingsOf(tx, first)).length).toBe(2);
      expect((await postingsOf(tx, second)).length).toBe(2);
      expect(await postingsOf(tx, old)).toEqual([]);
      const before = await tx.select({ id: posting.id }).from(posting);
      const again = await sweepIncomeSources({
        actorId: ids.user,
        now: () => NOW,
        run: runner,
      });
      expect(again).toMatchObject({ failed: 0, posted: 0, reversed: 0 });
      expect(await tx.select({ id: posting.id }).from(posting)).toHaveLength(
        before.length
      );
      const states = await tx
        .select({ status: ledgerSourceState.status })
        .from(ledgerSourceState)
        .where(
          and(
            eq(ledgerSourceState.sourceType, "contribution"),
            inArray(ledgerSourceState.sourceId, [first, second])
          )
        );
      expect(states).toEqual([{ status: "posted" }, { status: "posted" }]);
    });
  }
);

async function addLine(
  tx: LedgerTx,
  orgAccountId: string,
  over: Partial<typeof statementLine.$inferInsert>
) {
  const id = uuidv7();
  await tx.insert(statementLine).values({
    amountPaise: 30_000,
    createdAt: NOW,
    direction: "debit",
    id,
    lineHash: `test-${id}`,
    orgAccountId,
    position: 1,
    updatedAt: NOW,
    valueOn: "2026-07-01",
    ...over,
  });
  return id;
}

const transferSource = (sourceId: string): IncomeSource => ({
  sourceId,
  sourceType: "statement_transfer",
});

it.skipIf(!localDatabase)(
  "posts a transfer to the FD, and reverses it when the line is unmatched",
  async () => {
    // Imported here: the module opens the app database's client lazily.
    const { resetStatementLine } = await import("../queries/statement-lines");
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const lineId = await addLine(tx, ids.bank, {
        matchedAt: NOW,
        matchKind: "transfer",
        matchStatus: "matched",
        transferOrgAccountId: ids.fd,
      });
      expect(await run(tx, transferSource(lineId))).toMatchObject({
        posted: 1,
        status: "posted",
      });
      expect(await balanceOf(tx, ids.fd)).toBe(30_000);
      expect(await balanceOf(tx, ids.bank)).toBe(-30_000);
      // Unmatching clears the other account too (the check would refuse it).
      await resetStatementLine(tx as never, lineId, NOW);
      expect(await run(tx, transferSource(lineId))).toMatchObject({
        reason: "unmatched",
        reversed: 1,
        status: "none",
      });
      expect(await balanceOf(tx, ids.fd)).toBe(0);
      expect((await postingsOf(tx, lineId)).at(-1)?.reason).toBe(
        "The bank line was unmatched"
      );
    });
  }
);

/** Marks a line as a transfer to another account and pairs it, as the bank page does. */
async function markTransfer(
  tx: LedgerTx,
  lineId: string,
  otherAccountId: string,
  at: Date
) {
  const { pairTransferLine } = await import("../queries/statement-lines");
  await tx
    .update(statementLine)
    .set({
      matchedAt: at,
      matchKind: "transfer",
      matchStatus: "matched",
      transferOrgAccountId: otherAccountId,
    })
    .where(eq(statementLine.id, lineId));
  await pairTransferLine(tx as never, lineId, at);
}

it.skipIf(!localDatabase)(
  "posts each of two equal bank-to-bank transfers once, whatever order their sides are marked in",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const second = uuidv7();
      await tx.insert(orgAccount).values({
        createdAt: NOW,
        id: second,
        kind: "bank",
        name: `Income test second bank ${second}`,
        updatedAt: NOW,
      });
      // Two ₹300 transfers from the first bank to the second.
      const creditJul2 = await addLine(tx, second, {
        direction: "credit",
        valueOn: "2026-07-02",
      });
      const debitJul3 = await addLine(tx, ids.bank, { valueOn: "2026-07-03" });
      const debitJul1 = await addLine(tx, ids.bank, { valueOn: "2026-07-01" });
      const creditJul4 = await addLine(tx, second, {
        direction: "credit",
        valueOn: "2026-07-04",
      });
      const order: [string, string][] = [
        [creditJul2, ids.bank],
        [debitJul3, second],
        [debitJul1, second],
        [creditJul4, ids.bank],
      ];
      for (const [index, [lineId, other]] of order.entries()) {
        await markTransfer(
          tx,
          lineId,
          other,
          new Date(NOW.getTime() + index * 60_000)
        );
        await run(tx, transferSource(lineId));
        for (const related of await relatedIncomeSources(
          tx,
          transferSource(lineId)
        )) {
          await run(tx, related);
        }
      }
      const outcomes = [];
      for (const [lineId] of order) {
        outcomes.push((await run(tx, transferSource(lineId))).status);
      }
      // Each pair posts once, from its first-marked side.
      expect(outcomes.filter((o) => o === "posted")).toHaveLength(2);
      expect(await balanceOf(tx, ids.bank)).toBe(-60_000);
      expect(await balanceOf(tx, second)).toBe(60_000);
    });
  }
);

it.skipIf(!localDatabase)(
  "posts a transfer marked only on the receiving bank's side",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const second = uuidv7();
      await tx.insert(orgAccount).values({
        createdAt: NOW,
        id: second,
        kind: "bank",
        name: `Income test second bank ${second}`,
        updatedAt: NOW,
      });
      const credit = await addLine(tx, second, { direction: "credit" });
      await markTransfer(tx, credit, ids.bank, NOW);
      expect(await run(tx, transferSource(credit))).toMatchObject({
        posted: 1,
        status: "posted",
      });
      expect(await balanceOf(tx, second)).toBe(30_000);
      expect(await balanceOf(tx, ids.bank)).toBe(-30_000);
    });
  }
);

it.skipIf(!localDatabase)(
  "reposts a payout in an incremental sweep after its bank line is unmatched",
  async () => {
    const { resetStatementLine } = await import("../queries/statement-lines");
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const payout = await addSettlement(
        tx,
        ids,
        { amountPaise: 50_000, settledOn: "2026-05-12" },
        []
      );
      const lineId = await addLine(tx, ids.bank, {
        amountPaise: 50_000,
        direction: "credit",
        matchedAt: NOW,
        matchedSettlementId: payout,
        matchKind: "settlement",
        matchStatus: "matched",
        valueOn: "2026-05-14",
      });
      const source: IncomeSource = {
        sourceId: payout,
        sourceType: "gateway_settlement",
      };
      await run(tx, source);
      const listed = async () =>
        (await listIncomeSources(tx, { incremental: true })).some(
          (s) => s.sourceId === payout
        );
      expect(await listed()).toBe(false);
      await resetStatementLine(
        tx as never,
        lineId,
        new Date(NOW.getTime() + 60_000)
      );
      expect(await listed()).toBe(true);
      expect(await run(tx, source)).toMatchObject({ posted: 1, reversed: 1 });
      expect((await postingsOf(tx, payout)).at(-1)?.economicOn).toBe(
        "2026-05-12"
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "posts a 31 Mar refund of a 30 Mar gift on its 2 Apr payout day, leaving clearing at zero",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const giftId = await addGift(tx, ids, {
        channel: "razorpay",
        gatewayFeePaise: 2000,
        gatewayTaxPaise: 360,
        orgAccountId: ids.razorpay,
        receivedOn: "2026-03-30",
      });
      const refundId = uuidv7();
      await tx.insert(contributionRefund).values({
        amountPaise: 10_000,
        contributionId: giftId,
        createdAt: NOW,
        id: refundId,
        reference: `rfnd_${refundId}`,
        refundedOn: "2026-03-31",
        source: "razorpay",
      });
      const payout = await addSettlement(
        tx,
        ids,
        { amountPaise: 87_640, settledOn: "2026-04-02" },
        [
          {
            contributionId: giftId,
            creditPaise: 97_640,
            feePaise: 2000,
            taxPaise: 360,
          },
          {
            contributionRefundId: refundId,
            debitPaise: 10_000,
            type: "refund",
          },
        ]
      );
      const payoutSource: IncomeSource = {
        sourceId: payout,
        sourceType: "gateway_settlement",
      };
      expect(await relatedIncomeSources(tx, payoutSource)).toEqual([
        gift(giftId),
        { sourceId: refundId, sourceType: "contribution_refund" },
      ]);
      await run(tx, payoutSource);
      await run(tx, gift(giftId));
      expect(
        await run(tx, { sourceId: refundId, sourceType: "contribution_refund" })
      ).toMatchObject({ status: "posted" });
      expect((await postingsOf(tx, refundId))[0]?.economicOn).toBe(
        "2026-04-02"
      );
      expect(await balanceOf(tx, ids.razorpay)).toBe(0);
      expect(await balanceOf(tx, ids.bank)).toBe(87_640);
    });
  }
);

it.skipIf(!localDatabase)(
  "counts a record no posting run has looked at against the year close",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      await addGift(tx, ids);
      const checklist = await yearCloseChecklist(
        tx,
        ids.yearId,
        new Date("2027-04-02T06:00:00Z")
      );
      const check = checklist.checks.find((c) => c.id === "unposted_sources");
      expect(check?.ok).toBe(false);
      expect(check?.details.some((d) => d.includes("Not looked at yet"))).toBe(
        true
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "skips unchanged sources in an incremental sweep",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addGift(tx, ids);
      await run(tx, gift(id));
      const listed = async () =>
        (await listIncomeSources(tx, { incremental: true })).some(
          (s) => s.sourceId === id
        );
      expect(await listed()).toBe(false);
      await tx
        .update(contribution)
        .set({ updatedAt: new Date(NOW.getTime() + 60_000) })
        .where(eq(contribution.id, id));
      expect(await listed()).toBe(true);
    });
  }
);

/** Net of a source's standing entries by head and fund. */
async function netByHeadAndFund(tx: LedgerTx, sourceId: string) {
  const rows = await tx
    .select({
      amountPaise: ledgerEntry.amountPaise,
      effect: ledgerEntry.effect,
      fundId: ledgerEntry.fundId,
      head: ledgerEntry.accountHeadId,
    })
    .from(ledgerEntry)
    .innerJoin(posting, eq(posting.id, ledgerEntry.postingId))
    .where(eq(posting.sourceId, sourceId));
  const net = new Map<string, number>();
  for (const e of rows) {
    const key = `${e.head}:${e.fundId}`;
    net.set(
      key,
      (net.get(key) ?? 0) +
        (e.effect === "increase" ? e.amountPaise : -e.amountPaise)
    );
  }
  return new Map([...net].filter(([, paise]) => paise !== 0));
}

it.skipIf(!localDatabase)(
  "reposts a corpus gift posted as income under the Corpus Fund rule, recognition only, once; a closed year keeps its books",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      // Gifts posted before the rule: income of the Corpus Fund, fee too.
      const razorpayCorpus = {
        channel: "razorpay" as const,
        fundId: CORPUS_FUND_ID,
        gatewayFeePaise: 2000,
        gatewayTaxPaise: 360,
        orgAccountId: ids.razorpay,
        programmeId: null,
      };
      const id = await addGift(tx, ids, razorpayCorpus);
      const closed = await addGift(tx, ids, {
        ...razorpayCorpus,
        receivedOn: "2026-06-10",
      });
      await run(tx, gift(id));
      await run(tx, gift(closed));
      // Now corpus-typed (the record's own timestamp unchanged, as when
      // only the rule changed).
      await tx
        .update(contribution)
        .set({ donationType: "corpus" })
        .where(inArray(contribution.id, [id, closed]));
      const incremental = await listIncomeSources(tx, { incremental: true });
      expect(incremental.some((s) => s.sourceId === id)).toBe(false);
      const everything = await listIncomeSources(tx);
      expect(everything.some((s) => s.sourceId === id)).toBe(true);

      expect(await run(tx, gift(id))).toMatchObject({
        posted: 1,
        reversed: 1,
        status: "posted",
      });
      // The recognition moved; the money did not.
      expect(
        (await postingsOf(tx, id)).map((p) => [p.action, p.sourceRevision])
      ).toEqual([
        ["recognise", 1],
        ["cash", 1],
        ["reverse:recognise", 1],
        ["recognise", 2],
      ]);
      expect(await netByHeadAndFund(tx, id)).toEqual(
        new Map([
          [`${H.corpusDonations}:${CORPUS_FUND_ID}`, 100_000],
          [`${H.gatewayCharges}:${GENERAL_FUND_ID}`, 2360],
        ])
      );
      expect(await run(tx, gift(id))).toMatchObject({ posted: 0, reversed: 0 });

      // A closed year is left alone: the gift waits and its books stand.
      await tx
        .update(fiscalYear)
        .set({ closedAt: NOW })
        .where(eq(fiscalYear.id, ids.yearId));
      const before = await netByHeadAndFund(tx, closed);
      expect(await run(tx, gift(closed))).toMatchObject({
        reason: "year_closed",
        status: "waiting",
      });
      expect(await netByHeadAndFund(tx, closed)).toEqual(before);
      expect(before.get(`${H.donationsReceived}:${CORPUS_FUND_ID}`)).toBe(
        100_000
      );
    });
  }
);
