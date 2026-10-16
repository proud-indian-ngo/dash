import {
  COST_CENTRE_IDS,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import { balanceSummary, LEDGER_CUTOVER_ON } from "@pi-dash/shared/ledger";
import { SQL } from "bun";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "../schema";
import { user } from "../schema/auth";
import { expenseCategory } from "../schema/expense-category";
import {
  accountHead,
  fiscalYear,
  orgAccount,
  programme,
} from "../schema/finance-dimensions";
import {
  accountMovement,
  ledgerEntry,
  ledgerSourceState,
  posting,
} from "../schema/ledger";
import { party } from "../schema/party";
import { reimbursement, reimbursementLineItem } from "../schema/reimbursement";
import { team } from "../schema/team";
import { teamEvent } from "../schema/team-event";
import { vendor, vendorPayment, vendorPaymentLineItem } from "../schema/vendor";
import { vendorPaymentTransaction } from "../schema/vendor-payment-transaction";
import { type LedgerTx, post } from "./engine";
import {
  type IncomeSource,
  listIncomeSources,
  planIncomeSource,
  postIncomeSource,
} from "./income-posting";
import { INCOME_RULES_VERSION } from "./income-rules";

/**
 * Database-backed checks that expense postings carry the document's cost
 * centre (rules version 3): from its event when it has one, else its own;
 * that postings made before (with none) reverse and repost once, entries
 * only; that a frozen year is left as it stands; and that an event whose
 * cost centre changes reposts its requests. Opt in with
 * LEDGER_TEST_DATABASE_URL pointing at a local, migrated and seeded
 * database. Every test runs in a transaction that is rolled back.
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

const NOW = new Date("2026-10-15T06:00:00Z");
/** 3 June 2026, 10:00 in India. */
const APPROVED_AT = new Date("2026-06-03T04:30:00Z");
const BLR = COST_CENTRE_IDS.bangalore;
const MUM = COST_CENTRE_IDS.mumbai;

async function foundation(tx: LedgerTx) {
  const [someone] = await tx.select({ id: user.id }).from(user).limit(1);
  const [someTeam] = await tx.select({ id: team.id }).from(team).limit(1);
  const [someProgramme] = await tx
    .select({ id: programme.id })
    .from(programme)
    .limit(1);
  if (!(someone && someTeam && someProgramme)) {
    throw new Error("Seed the database first");
  }
  const ids = {
    bank: uuidv7(),
    category: uuidv7(),
    programme: someProgramme.id,
    team: someTeam.id,
    user: someone.id,
    vendor: uuidv7(),
  };
  await tx
    .update(orgAccount)
    .set({ active: false })
    .where(eq(orgAccount.kind, "bank"));
  await tx.insert(orgAccount).values({
    createdAt: NOW,
    id: ids.bank,
    kind: "bank",
    name: `Cost centre test bank ${ids.bank}`,
    updatedAt: NOW,
  });
  await tx
    .insert(accountHead)
    .values([
      {
        code: "TEST_EXPENSES",
        createdAt: NOW,
        id: LEDGER_ACCOUNT_HEAD_IDS.expenses,
        name: "Test expenses",
        type: "expense",
        updatedAt: NOW,
      },
      {
        code: "TEST_CLAIMS_PAYABLE",
        createdAt: NOW,
        id: LEDGER_ACCOUNT_HEAD_IDS.claimsPayable,
        name: "Test claims payable",
        type: "liability",
        updatedAt: NOW,
      },
      {
        code: "TEST_SUPPLIER_ADVANCES",
        createdAt: NOW,
        id: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
        name: "Test supplier advances",
        type: "asset",
        updatedAt: NOW,
      },
    ])
    .onConflictDoNothing();
  await tx.insert(expenseCategory).values({
    createdAt: NOW,
    id: ids.category,
    name: `Test category ${ids.category}`,
    updatedAt: NOW,
  });
  await tx.insert(party).values({
    createdAt: NOW,
    displayName: "Test vendor",
    id: ids.vendor,
    kind: "organisation",
    updatedAt: NOW,
  });
  await tx.insert(vendor).values({
    createdAt: NOW,
    id: ids.vendor,
    name: "Test vendor",
    status: "approved",
    updatedAt: NOW,
  });
  await tx.update(fiscalYear).set({ closedAt: null, closedBy: null });
  await tx.delete(ledgerSourceState);
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
  return ids;
}

type Ids = Awaited<ReturnType<typeof foundation>>;

async function addEvent(tx: LedgerTx, ids: Ids, costCentreId: string) {
  const id = uuidv7();
  await tx.insert(teamEvent).values({
    costCentreId,
    createdAt: NOW,
    createdBy: ids.user,
    id,
    name: "Cost centre test event",
    programmeId: ids.programme,
    startTime: new Date("2026-06-01T04:30:00Z"),
    teamId: ids.team,
    updatedAt: new Date("2026-06-01T04:30:00Z"),
  });
  return id;
}

async function addClaim(
  tx: LedgerTx,
  ids: Ids,
  over: Partial<typeof reimbursement.$inferInsert> = {}
) {
  const id = uuidv7();
  await tx.insert(reimbursement).values({
    approvalScreenshotKey: `approval-screenshots/${id}/proof.png`,
    chargedProgrammeId: ids.programme,
    chargedTo: "programme",
    costCentreId: BLR,
    createdAt: NOW,
    expenseDate: "2026-06-01",
    id,
    reviewedAt: APPROVED_AT,
    status: "approved",
    title: "Class outing",
    updatedAt: NOW,
    userId: ids.user,
    ...over,
  });
  await tx.insert(reimbursementLineItem).values(
    [30_000, 12_500].map((amountPaise, index) => ({
      amountPaise,
      categoryId: ids.category,
      createdAt: NOW,
      id: uuidv7(),
      reimbursementId: id,
      sortOrder: index,
      updatedAt: NOW,
    }))
  );
  return id;
}

const run = (tx: LedgerTx, source: IncomeSource) =>
  postIncomeSource(tx, source, { actorId: null, now: NOW });

const claimSource = (sourceId: string): IncomeSource => ({
  sourceId,
  sourceType: "reimbursement",
});

/** Posts what the rules plan for a source, as rules version 2 did: no cost centre. */
async function postWithoutCostCentre(tx: LedgerTx, source: IncomeSource) {
  const plan = await planIncomeSource(tx, source);
  if (plan.kind !== "post") {
    throw new Error("expected a posting");
  }
  for (const part of plan.parts) {
    await post(
      tx,
      {
        ...part,
        entries: part.entries.map((e) => ({ ...e, costCentreId: null })),
        ...source,
      },
      { actorId: null, now: NOW }
    );
  }
}

async function postingsOf(tx: LedgerTx, sourceId: string) {
  return await tx
    .select()
    .from(posting)
    .where(eq(posting.sourceId, sourceId))
    .orderBy(posting.createdAt, posting.id);
}

/** Net of each cost centre over a source's entries (every head). */
async function netByCostCentre(tx: LedgerTx, sourceIds: string[]) {
  const rows = await tx
    .select({ entry: ledgerEntry })
    .from(ledgerEntry)
    .innerJoin(posting, eq(posting.id, ledgerEntry.postingId))
    .where(inArray(posting.sourceId, sourceIds));
  const net = new Map<string | null, number>();
  for (const { entry } of rows) {
    // Claims payable nets to zero once paid; the expense is what counts.
    if (entry.accountHeadId === LEDGER_ACCOUNT_HEAD_IDS.claimsPayable) {
      continue;
    }
    net.set(
      entry.costCentreId,
      (net.get(entry.costCentreId) ?? 0) +
        (entry.effect === "increase" ? entry.amountPaise : -entry.amountPaise)
    );
  }
  return net;
}

async function bankBalance(tx: LedgerTx, orgAccountId: string) {
  const [row] = await tx
    .select({
      balance: sql<string>`coalesce(sum(case when ${accountMovement.direction} = 'in' then ${accountMovement.amountPaise} else -${accountMovement.amountPaise} end), 0)`,
    })
    .from(accountMovement)
    .where(eq(accountMovement.orgAccountId, orgAccountId));
  return Number(row?.balance ?? 0);
}

/** The books' balance check: zero when assets equal funds and liabilities. */
async function booksDifference(tx: LedgerTx) {
  const entries = await tx
    .select({
      accountHeadId: ledgerEntry.accountHeadId,
      amountPaise: ledgerEntry.amountPaise,
      economicOn: ledgerEntry.economicOn,
      effect: ledgerEntry.effect,
      fundId: ledgerEntry.fundId,
      headType: accountHead.type,
      id: ledgerEntry.id,
      medium: ledgerEntry.medium,
      programmeId: ledgerEntry.programmeId,
    })
    .from(ledgerEntry)
    .innerJoin(accountHead, eq(accountHead.id, ledgerEntry.accountHeadId));
  const movements = await tx
    .select({
      amountPaise: accountMovement.amountPaise,
      direction: accountMovement.direction,
      id: accountMovement.id,
      kind: accountMovement.kind,
      occurredOn: accountMovement.occurredOn,
      orgAccountId: accountMovement.orgAccountId,
    })
    .from(accountMovement);
  const accounts = await tx.select({ id: orgAccount.id }).from(orgAccount);
  return balanceSummary({
    accountIds: accounts.map((a) => a.id),
    asOf: "9999-12-31",
    entries,
    movements,
    startsOn: LEDGER_CUTOVER_ON,
  }).differencePaise;
}

it.skipIf(!localDatabase)(
  "reposts a claim posted without a cost centre once, entries only, and the books still balance",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const baseline = await booksDifference(tx);
      const id = await addClaim(tx, ids);
      await postWithoutCostCentre(tx, claimSource(id));
      expect(await netByCostCentre(tx, [id])).toEqual(
        new Map([[null, 42_500]])
      );

      // The expense and the payable reverse and repost; the money stays.
      expect(await run(tx, claimSource(id))).toEqual({
        posted: 2,
        reason: null,
        reversed: 2,
        status: "posted",
      });
      const postings = await postingsOf(tx, id);
      expect(
        postings.map((p) => [p.action, p.economicOn, p.sourceRevision]).sort()
      ).toEqual(
        [
          ["cash", "2026-06-03", 1],
          ["recognise", "2026-06-03", 1],
          ["recognise", "2026-06-03", 2],
          ["reverse:recognise", "2026-06-03", 1],
          ["reverse:settle", "2026-06-03", 1],
          ["settle", "2026-06-03", 1],
          ["settle", "2026-06-03", 2],
        ].sort()
      );
      expect(await netByCostCentre(tx, [id])).toEqual(
        new Map([
          [null, 0],
          [BLR, 42_500],
        ])
      );
      expect(await bankBalance(tx, ids.bank)).toBe(-42_500);
      expect(await booksDifference(tx)).toBe(baseline);

      // Once: the next run changes nothing.
      expect(await run(tx, claimSource(id))).toMatchObject({
        posted: 0,
        reversed: 0,
      });
    });
  }
);

it.skipIf(!localDatabase)(
  "leaves a claim in a closed year as it stands",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addClaim(tx, ids);
      await postWithoutCostCentre(tx, claimSource(id));
      const before = await postingsOf(tx, id);
      await tx.update(fiscalYear).set({ closedAt: NOW });

      expect(await run(tx, claimSource(id))).toMatchObject({
        reason: "year_closed",
        reversed: 0,
        status: "waiting",
      });
      expect(await postingsOf(tx, id)).toEqual(before);
      expect(await netByCostCentre(tx, [id])).toEqual(
        new Map([[null, 42_500]])
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "takes an event-linked request's cost centre from its event, and reposts when the event's changes",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const baseline = await booksDifference(tx);
      const eventId = await addEvent(tx, ids, BLR);
      const claim = await addClaim(tx, ids, {
        chargedProgrammeId: null,
        chargedTo: "event",
        costCentreId: null,
        eventId,
      });
      // A vendor payment on the same event, paid once.
      const vpId = uuidv7();
      await tx.insert(vendorPayment).values({
        chargedTo: "event",
        createdAt: NOW,
        eventId,
        id: vpId,
        reviewedAt: NOW,
        status: "paid",
        title: "Sound system",
        updatedAt: NOW,
        userId: ids.user,
        vendorId: ids.vendor,
      });
      const paymentId = uuidv7();
      await tx.insert(vendorPaymentTransaction).values({
        amountPaise: 10_000,
        createdAt: NOW,
        id: paymentId,
        reviewedAt: NOW,
        status: "approved",
        transactionDate: new Date("2026-07-10T05:00:00Z"),
        updatedAt: NOW,
        userId: ids.user,
        vendorPaymentId: vpId,
      });
      const paymentSource: IncomeSource = {
        sourceId: paymentId,
        sourceType: "vendor_payment_transaction",
      };
      await run(tx, claimSource(claim));
      await run(tx, paymentSource);
      expect(await netByCostCentre(tx, [claim, paymentId])).toEqual(
        new Map([[BLR, 52_500]])
      );

      // The event moves to another cost centre: the incremental sweep sees
      // both records changed, and their entries follow the event. (Far in
      // the future, so it is later than anything seeded into the watermark.)
      await tx
        .update(teamEvent)
        .set({ costCentreId: MUM, updatedAt: new Date("2099-01-01T06:00:00Z") })
        .where(eq(teamEvent.id, eventId));
      const changed = await listIncomeSources(tx, { incremental: true });
      expect(changed).toContainEqual(claimSource(claim));
      expect(changed).toContainEqual(paymentSource);
      expect(await run(tx, claimSource(claim))).toMatchObject({
        posted: 2,
        reversed: 2,
      });
      expect(await run(tx, paymentSource)).toMatchObject({
        posted: 1,
        reversed: 1,
      });
      expect(await netByCostCentre(tx, [claim, paymentId])).toEqual(
        new Map([
          [BLR, 0],
          [MUM, 52_500],
        ])
      );
      expect(await bankBalance(tx, ids.bank)).toBe(-52_500);
      expect(await booksDifference(tx)).toBe(baseline);
    });
  }
);

it.skipIf(!localDatabase)(
  "refuses a request linked to an event that also stores a cost centre",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const eventId = await addEvent(tx, ids, BLR);
      await expect(
        tx.execute(sql`savepoint linked_with_centre`).then(() =>
          addClaim(tx, ids, {
            chargedProgrammeId: null,
            chargedTo: "event",
            costCentreId: BLR,
            eventId,
          })
        )
      ).rejects.toThrow();
      await tx.execute(sql`rollback to savepoint linked_with_centre`);
      // A vendor payment with no event needs its own.
      await expect(
        tx.execute(sql`savepoint no_centre`).then(() =>
          tx.insert(vendorPayment).values({
            chargedTo: "organisation",
            createdAt: NOW,
            id: uuidv7(),
            status: "pending",
            title: "No centre",
            updatedAt: NOW,
            userId: ids.user,
            vendorId: ids.vendor,
          })
        )
      ).rejects.toThrow();
      await tx.execute(sql`rollback to savepoint no_centre`);
    });
  }
);

it.skipIf(!localDatabase)(
  "reposts a vendor payment and its payment once, the money untouched",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const baseline = await booksDifference(tx);
      const vpId = uuidv7();
      await tx.insert(vendorPayment).values({
        chargedTo: "organisation",
        costCentreId: BLR,
        createdAt: NOW,
        id: vpId,
        invoiceDate: "2026-07-15",
        invoiceNumber: "INV-1",
        invoiceReviewedAt: new Date("2026-07-20T06:00:00Z"),
        reviewedAt: NOW,
        status: "completed",
        title: "Sound system",
        updatedAt: NOW,
        userId: ids.user,
        vendorId: ids.vendor,
      });
      await tx.insert(vendorPaymentLineItem).values({
        amountPaise: 40_000,
        categoryId: ids.category,
        createdAt: NOW,
        id: uuidv7(),
        sortOrder: 0,
        updatedAt: NOW,
        vendorPaymentId: vpId,
      });
      const paymentId = uuidv7();
      await tx.insert(vendorPaymentTransaction).values({
        amountPaise: 40_000,
        createdAt: NOW,
        id: paymentId,
        reviewedAt: NOW,
        status: "approved",
        transactionDate: new Date("2026-07-10T05:00:00Z"),
        updatedAt: NOW,
        userId: ids.user,
        vendorPaymentId: vpId,
      });
      const payment: IncomeSource = {
        sourceId: paymentId,
        sourceType: "vendor_payment_transaction",
      };
      const invoice: IncomeSource = {
        sourceId: vpId,
        sourceType: "vendor_payment",
      };
      await postWithoutCostCentre(tx, payment);
      await postWithoutCostCentre(tx, invoice);
      const before = await bankBalance(tx, ids.bank);

      // The payment's advance part and the invoice repost; the payment's
      // money part compares equal and stays.
      expect(await run(tx, payment)).toMatchObject({ posted: 1, reversed: 1 });
      expect(await run(tx, invoice)).toMatchObject({ posted: 1, reversed: 1 });
      expect(await bankBalance(tx, ids.bank)).toBe(before);
      expect(await booksDifference(tx)).toBe(baseline);
      // Expense 40,000 and the advance raised and cleared, all under BLR.
      expect(await netByCostCentre(tx, [vpId, paymentId])).toEqual(
        new Map([
          [null, 0],
          [BLR, 40_000],
        ])
      );
      expect(await run(tx, payment)).toMatchObject({ posted: 0, reversed: 0 });
      expect(await run(tx, invoice)).toMatchObject({ posted: 0, reversed: 0 });
    });
  }
);

it.skipIf(!localDatabase)(
  "reverses a voided claim posted without a cost centre on its void day, and reposts nothing",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const baseline = await booksDifference(tx);
      const id = await addClaim(tx, ids);
      await postWithoutCostCentre(tx, claimSource(id));
      const VOIDED_AT = new Date("2026-11-02T05:00:00Z");
      await tx
        .update(reimbursement)
        .set({ updatedAt: VOIDED_AT, voidedAt: VOIDED_AT, voidReason: "Dup" })
        .where(eq(reimbursement.id, id));
      expect(await run(tx, claimSource(id))).toMatchObject({
        posted: 0,
        reason: "voided",
        reversed: 3,
        status: "none",
      });
      expect(await netByCostCentre(tx, [id])).toEqual(new Map([[null, 0]]));
      expect(await bankBalance(tx, ids.bank)).toBe(0);
      expect(await booksDifference(tx)).toBe(baseline);
    });
  }
);

it.skipIf(!localDatabase)(
  "records rules version 3 after one sweep over everything while frozen sources wait, and then runs incrementally",
  async () => {
    // The runner module opens the app database pool on import; point it at
    // the test database (it is not used: the sweep runs in this transaction).
    process.env.DATABASE_URL ??= databaseUrl;
    process.env.SKIP_VALIDATION ??= "true";
    const { postPendingIncome, rulesVersionStore } =
      await import("./income-runner");
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addClaim(tx, ids);
      await postWithoutCostCentre(tx, claimSource(id));
      const before = await postingsOf(tx, id);
      const store = rulesVersionStore(tx);
      await tx.execute(
        sql`insert into app_config (key, value, updated_at)
          values ('ledger_income_rules_version', '2', now())
          on conflict (key) do update set value = '2'`
      );
      // Every year closed: the claim, like everything else, waits.
      await tx.update(fiscalYear).set({ closedAt: NOW });
      const options = {
        actorId: null,
        incremental: true,
        now: () => NOW,
        run: <T>(work: (t: LedgerTx) => Promise<T>) => work(tx),
        versionStore: store,
      };

      const first = await postPendingIncome(options);
      expect(first).toMatchObject({ failed: 0, remaining: 0, reversed: 0 });
      expect(first.waiting).toBeGreaterThanOrEqual(1);
      expect(await store.read()).toBe(INCOME_RULES_VERSION);
      expect(await postingsOf(tx, id)).toEqual(before);

      // Incremental from now on: only the waiting sources are looked at
      // again, and they still wait, so nothing moves and nothing loops.
      const second = await postPendingIncome(options);
      expect(second).toMatchObject({
        failed: 0,
        posted: 0,
        remaining: 0,
        reversed: 0,
      });
      expect(second.checked).toBeLessThanOrEqual(first.checked);
      expect(await store.read()).toBe(INCOME_RULES_VERSION);
      expect(await postingsOf(tx, id)).toEqual(before);
    });
  }
);
