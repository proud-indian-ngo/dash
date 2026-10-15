import { LEDGER_ACCOUNT_HEAD_IDS } from "@pi-dash/shared/constants";
import { balanceSummary, LEDGER_CUTOVER_ON } from "@pi-dash/shared/ledger";
import { SQL } from "bun";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
  movementAllocation,
  posting,
} from "../schema/ledger";
import { party } from "../schema/party";
import { reimbursement, reimbursementLineItem } from "../schema/reimbursement";
import { statementAllocation, statementLine } from "../schema/statement-line";
import { vendor, vendorPayment, vendorPaymentLineItem } from "../schema/vendor";
import { vendorPaymentTransaction } from "../schema/vendor-payment-transaction";
import type { LedgerTx } from "./engine";
import {
  type IncomeSource,
  listIncomeSources,
  postIncomeSource,
} from "./income-posting";

/**
 * Database-backed checks of bank debit matching in the books (layer 3-3b):
 * a matched debit moves only a payment's account and date, unmatching
 * restores the default, bank charges and taxes post from the line, and the
 * balance check stays where it was after every step. Opt in with
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

async function foundation(tx: LedgerTx) {
  const [someone] = await tx.select({ id: user.id }).from(user).limit(1);
  if (!someone) {
    throw new Error("Seed a user first");
  }
  const ids = {
    category: uuidv7(),
    hdfc: uuidv7(),
    main: uuidv7(),
    user: someone.id,
    vendor: uuidv7(),
  };
  // Two active bank accounts; the main one is where an unmatched payment
  // leaves from.
  await tx
    .update(orgAccount)
    .set({ active: false, isMain: false })
    .where(eq(orgAccount.kind, "bank"));
  await tx.insert(orgAccount).values([
    {
      createdAt: NOW,
      id: ids.main,
      isMain: true,
      kind: "bank",
      name: `Main test bank ${ids.main}`,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: ids.hdfc,
      kind: "bank",
      name: `HDFC test bank ${ids.hdfc}`,
      updatedAt: NOW,
    },
  ]);
  await tx
    .insert(accountHead)
    .values([
      {
        code: "TEST_SUPPLIER_ADVANCES",
        createdAt: NOW,
        id: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
        name: "Test supplier advances",
        type: "asset",
        updatedAt: NOW,
      },
      {
        code: "TEST_BANK_CHARGES",
        createdAt: NOW,
        id: LEDGER_ACCOUNT_HEAD_IDS.bankCharges,
        name: "Test bank charges",
        type: "expense",
        updatedAt: NOW,
      },
      {
        code: "TEST_TAXES_AND_FEES",
        createdAt: NOW,
        id: LEDGER_ACCOUNT_HEAD_IDS.taxesAndFees,
        name: "Test taxes and fees",
        type: "expense",
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
  const [aProgramme] = await tx
    .select({ id: programme.id })
    .from(programme)
    .limit(1);
  if (!aProgramme) {
    throw new Error("Seed the finance dimensions first");
  }
  return { ...ids, programme: aProgramme.id };
}

type Ids = Awaited<ReturnType<typeof foundation>>;

async function addClaim(
  tx: LedgerTx,
  ids: Ids,
  amounts: number[] = [30_000, 12_500],
  over: Partial<typeof reimbursement.$inferInsert> = {}
) {
  const id = uuidv7();
  await tx.insert(reimbursement).values({
    approvalScreenshotKey: `approval-screenshots/${id}/proof.png`,
    chargedProgrammeId: ids.programme,
    chargedTo: "programme",
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
    amounts.map((amountPaise, index) => ({
      amountPaise,
      categoryId: ids.category,
      createdAt: NOW,
      description: `Line ${index + 1}`,
      id: uuidv7(),
      reimbursementId: id,
      sortOrder: index,
      updatedAt: NOW,
    }))
  );
  return id;
}

async function addDebit(
  tx: LedgerTx,
  orgAccountId: string,
  over: Partial<typeof statementLine.$inferInsert> = {}
) {
  const id = uuidv7();
  await tx.insert(statementLine).values({
    amountPaise: 42_500,
    createdAt: NOW,
    direction: "debit",
    id,
    lineHash: `test-${id}`,
    orgAccountId,
    position: 1,
    updatedAt: NOW,
    valueOn: "2026-06-05",
    ...over,
  });
  return id;
}

/** A clock that moves forward, so each change moves the watermark. */
let tick = 0;
const later = () => new Date(NOW.getTime() + ++tick * 60_000);

async function allocate(
  tx: LedgerTx,
  lineId: string,
  rows: {
    amountPaise: number;
    kind: (typeof statementAllocation.$inferInsert)["kind"];
    reimbursementId?: string;
    vendorPaymentTransactionId?: string;
  }[]
) {
  const at = later();
  await tx.insert(statementAllocation).values(
    rows.map((r) => ({
      amountPaise: r.amountPaise,
      createdAt: at,
      id: uuidv7(),
      kind: r.kind,
      reimbursementId: r.reimbursementId ?? null,
      statementLineId: lineId,
      vendorPaymentTransactionId: r.vendorPaymentTransactionId ?? null,
    }))
  );
}

async function release(tx: LedgerTx, lineId: string) {
  await tx
    .update(statementAllocation)
    .set({ releasedAt: later() })
    .where(
      and(
        eq(statementAllocation.statementLineId, lineId),
        isNull(statementAllocation.releasedAt)
      )
    );
}

const run = (tx: LedgerTx, source: IncomeSource) =>
  postIncomeSource(tx, source, { actorId: null, now: NOW });

const claimSource = (sourceId: string): IncomeSource => ({
  sourceId,
  sourceType: "reimbursement",
});

const chargeSource = (sourceId: string): IncomeSource => ({
  sourceId,
  sourceType: "statement_charge",
});

/** The standing (not reversed, not reversal) movements of a source. */
async function standingMovements(tx: LedgerTx, sourceId: string) {
  const rows = await tx
    .select({
      account: accountMovement.orgAccountId,
      amount: accountMovement.amountPaise,
      id: accountMovement.id,
      kind: accountMovement.kind,
      on: accountMovement.occurredOn,
      postingId: posting.id,
    })
    .from(accountMovement)
    .innerJoin(posting, eq(posting.id, accountMovement.postingId))
    .where(
      and(
        eq(posting.sourceId, sourceId),
        isNull(posting.reversesPostingId),
        sql`not exists (select 1 from ${posting} r where r.reverses_posting_id = ${posting.id})`
      )
    )
    .orderBy(accountMovement.occurredOn, accountMovement.amountPaise);
  const lines =
    rows.length > 0
      ? await tx
          .select({
            documentId: movementAllocation.documentId,
            movementId: movementAllocation.accountMovementId,
          })
          .from(movementAllocation)
          .where(
            inArray(
              movementAllocation.accountMovementId,
              rows.map((r) => r.id)
            )
          )
      : [];
  const lineOf = new Map(lines.map((l) => [l.movementId, l.documentId]));
  return rows.map((r) => [
    r.account,
    r.on,
    r.amount,
    r.kind,
    lineOf.get(r.id) ?? null,
  ]);
}

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

/**
 * The Books page's balance check over everything posted: assets less
 * liabilities less funds (each fund carrying its income less expenditure).
 * Zero when the books agree; compared before and after each step, since a
 * seeded database may hold books of its own.
 */
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

async function recognisePostings(tx: LedgerTx, sourceId: string) {
  return (await postingsOf(tx, sourceId)).filter((p) =>
    p.action.endsWith("recognise")
  ).length;
}

it.skipIf(!localDatabase)(
  "moves only the payment to a matched debit, restores the default on unmatch, and rematches",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const baseline = await booksDifference(tx);
      const claim = await addClaim(tx, ids);
      await run(tx, claimSource(claim));
      expect(await standingMovements(tx, claim)).toEqual([
        [ids.main, "2026-06-03", 42_500, "payout", null],
      ]);
      expect(await booksDifference(tx)).toBe(baseline);

      // Matched in full to an HDFC debit two days later.
      const line = await addDebit(tx, ids.hdfc);
      await allocate(tx, line, [
        { amountPaise: 42_500, kind: "reimbursement", reimbursementId: claim },
      ]);
      expect(await run(tx, claimSource(claim))).toMatchObject({
        posted: 1,
        reversed: 1,
        status: "posted",
      });
      expect(await standingMovements(tx, claim)).toEqual([
        [ids.hdfc, "2026-06-05", 42_500, "payout", line],
      ]);
      // The expense entries were never touched: one recognise posting.
      expect(await recognisePostings(tx, claim)).toBe(1);
      expect(await balanceOf(tx, ids.main)).toBe(0);
      expect(await balanceOf(tx, ids.hdfc)).toBe(-42_500);
      expect(await booksDifference(tx)).toBe(baseline);
      // Nothing changed, nothing written.
      expect(await run(tx, claimSource(claim))).toMatchObject({
        posted: 0,
        reversed: 0,
      });

      // Unmatched: back to the main account on the approval day.
      await release(tx, line);
      expect(await run(tx, claimSource(claim))).toMatchObject({
        posted: 1,
        reversed: 1,
      });
      expect(await standingMovements(tx, claim)).toEqual([
        [ids.main, "2026-06-03", 42_500, "payout", null],
      ]);
      expect(await booksDifference(tx)).toBe(baseline);

      // Rematched to another debit.
      const other = await addDebit(tx, ids.main, { valueOn: "2026-06-04" });
      await allocate(tx, other, [
        { amountPaise: 42_500, kind: "reimbursement", reimbursementId: claim },
      ]);
      await run(tx, claimSource(claim));
      expect(await standingMovements(tx, claim)).toEqual([
        [ids.main, "2026-06-04", 42_500, "payout", other],
      ]);
      expect(await recognisePostings(tx, claim)).toBe(1);
      expect(await booksDifference(tx)).toBe(baseline);
    });
  }
);

it.skipIf(!localDatabase)(
  "splits one debit across two claims and one claim across two debits",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const baseline = await booksDifference(tx);
      const first = await addClaim(tx, ids, [30_000]);
      const second = await addClaim(tx, ids, [12_500]);
      const both = await addDebit(tx, ids.hdfc);
      await allocate(tx, both, [
        { amountPaise: 30_000, kind: "reimbursement", reimbursementId: first },
        { amountPaise: 12_500, kind: "reimbursement", reimbursementId: second },
      ]);
      await run(tx, claimSource(first));
      await run(tx, claimSource(second));
      expect(await standingMovements(tx, first)).toEqual([
        [ids.hdfc, "2026-06-05", 30_000, "payout", both],
      ]);
      expect(await standingMovements(tx, second)).toEqual([
        [ids.hdfc, "2026-06-05", 12_500, "payout", both],
      ]);

      // A third claim, paid by two debits and, for the rest, by default.
      const third = await addClaim(tx, ids, [50_000]);
      const part1 = await addDebit(tx, ids.hdfc, {
        amountPaise: 20_000,
        valueOn: "2026-06-02",
      });
      const part2 = await addDebit(tx, ids.main, {
        amountPaise: 25_000,
        valueOn: "2026-06-07",
      });
      await allocate(tx, part1, [
        { amountPaise: 20_000, kind: "reimbursement", reimbursementId: third },
      ]);
      await allocate(tx, part2, [
        { amountPaise: 25_000, kind: "reimbursement", reimbursementId: third },
      ]);
      await run(tx, claimSource(third));
      expect(await standingMovements(tx, third)).toEqual([
        [ids.hdfc, "2026-06-02", 20_000, "payout", part1],
        [ids.main, "2026-06-03", 5000, "payout", null],
        [ids.main, "2026-06-07", 25_000, "payout", part2],
      ]);
      expect(await balanceOf(tx, ids.hdfc)).toBe(-62_500);
      expect(await balanceOf(tx, ids.main)).toBe(-30_000);
      expect(await booksDifference(tx)).toBe(baseline);
    });
  }
);

it.skipIf(!localDatabase)(
  "posts bank charges and a tax payment from the line, and reverses them on unmatch",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const baseline = await booksDifference(tx);
      const line = await addDebit(tx, ids.hdfc, {
        amountPaise: 125_900,
        valueOn: "2026-08-12",
      });
      await allocate(tx, line, [
        { amountPaise: 5900, kind: "bank_charges" },
        { amountPaise: 120_000, kind: "tax_payment" },
      ]);
      expect(await run(tx, chargeSource(line))).toMatchObject({
        posted: 2,
        status: "posted",
      });
      expect(await standingMovements(tx, line)).toEqual([
        [ids.hdfc, "2026-08-12", 5900, "fee", line],
        [ids.hdfc, "2026-08-12", 120_000, "tax_remittance", line],
      ]);
      const heads = await tx
        .select({
          head: ledgerEntry.accountHeadId,
          paise: ledgerEntry.amountPaise,
        })
        .from(ledgerEntry)
        .innerJoin(posting, eq(posting.id, ledgerEntry.postingId))
        .where(eq(posting.sourceId, line))
        .orderBy(ledgerEntry.amountPaise);
      expect(heads).toEqual([
        { head: LEDGER_ACCOUNT_HEAD_IDS.bankCharges, paise: 5900 },
        { head: LEDGER_ACCOUNT_HEAD_IDS.taxesAndFees, paise: 120_000 },
      ]);
      expect(await booksDifference(tx)).toBe(baseline);

      await release(tx, line);
      expect(await run(tx, chargeSource(line))).toMatchObject({
        reason: "unmatched",
        reversed: 2,
        status: "none",
      });
      expect(await standingMovements(tx, line)).toEqual([]);
      expect(await balanceOf(tx, ids.hdfc)).toBe(0);
      expect(await booksDifference(tx)).toBe(baseline);
    });
  }
);

it.skipIf(!localDatabase)(
  "links lines before the cutover as evidence only, and waits for the CA across it",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const baseline = await booksDifference(tx);
      // Both before the cutover: history.
      const old = await addClaim(tx, ids, [42_500], {
        reviewedAt: new Date("2026-03-20T06:00:00Z"),
      });
      const oldLine = await addDebit(tx, ids.hdfc, { valueOn: "2026-03-21" });
      await allocate(tx, oldLine, [
        { amountPaise: 42_500, kind: "reimbursement", reimbursementId: old },
      ]);
      expect(await run(tx, claimSource(old))).toMatchObject({
        reason: "before_cutover",
        status: "none",
      });
      const charges = await addDebit(tx, ids.hdfc, {
        amountPaise: 590,
        valueOn: "2026-03-31",
      });
      await allocate(tx, charges, [{ amountPaise: 590, kind: "bank_charges" }]);
      expect(await run(tx, chargeSource(charges))).toMatchObject({
        reason: "before_cutover",
        status: "none",
      });
      expect(await postingsOf(tx, old)).toEqual([]);
      expect(await postingsOf(tx, charges)).toEqual([]);

      // Approved after the cutover, paid by the bank before it.
      const across = await addClaim(tx, ids, [42_500], {
        reviewedAt: new Date("2026-04-02T06:00:00Z"),
      });
      const before = await addDebit(tx, ids.hdfc, { valueOn: "2026-03-30" });
      await allocate(tx, before, [
        { amountPaise: 42_500, kind: "reimbursement", reimbursementId: across },
      ]);
      expect(await run(tx, claimSource(across))).toMatchObject({
        reason: "bank_debit_across_cutover",
        status: "waiting",
      });
      expect(await postingsOf(tx, across)).toEqual([]);
      expect(await booksDifference(tx)).toBe(baseline);
    });
  }
);

it.skipIf(!localDatabase)(
  "keeps the books balanced through edits, a closed year and a release before void",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const baseline = await booksDifference(tx);
      const claim = await addClaim(tx, ids);
      const line = await addDebit(tx, ids.hdfc);
      await allocate(tx, line, [
        { amountPaise: 42_500, kind: "reimbursement", reimbursementId: claim },
      ]);
      await run(tx, claimSource(claim));

      // The claim lowered below its match: waits, the books stand as posted.
      await tx
        .update(reimbursementLineItem)
        .set({ amountPaise: 10_000, updatedAt: later() })
        .where(eq(reimbursementLineItem.reimbursementId, claim));
      expect(await run(tx, claimSource(claim))).toMatchObject({
        reason: "match_exceeds_amount",
        status: "waiting",
      });
      expect(await booksDifference(tx)).toBe(baseline);

      // Corrected back; then the year closes and the match moves.
      await tx
        .update(reimbursementLineItem)
        .set({ amountPaise: 21_250, updatedAt: later() })
        .where(eq(reimbursementLineItem.reimbursementId, claim));
      expect(await run(tx, claimSource(claim))).toMatchObject({
        status: "posted",
      });
      await tx.update(fiscalYear).set({ closedAt: NOW });
      await release(tx, line);
      expect(await run(tx, claimSource(claim))).toMatchObject({
        reason: "year_closed",
        status: "waiting",
      });
      expect(await standingMovements(tx, claim)).toEqual([
        [ids.hdfc, "2026-06-05", 42_500, "payout", line],
      ]);
      expect(await booksDifference(tx)).toBe(baseline);
      await tx.update(fiscalYear).set({ closedAt: null });
      await run(tx, claimSource(claim));
      expect(await standingMovements(tx, claim)).toEqual([
        [ids.main, "2026-06-03", 42_500, "payout", null],
      ]);

      // Released, then voided: reversed on the void day.
      await tx
        .update(reimbursement)
        .set({
          updatedAt: later(),
          voidedAt: new Date("2026-11-02T06:00:00Z"),
          voidReason: "Duplicate",
        })
        .where(eq(reimbursement.id, claim));
      expect(await run(tx, claimSource(claim))).toMatchObject({
        reason: "voided",
        status: "none",
      });
      expect(await standingMovements(tx, claim)).toEqual([]);
      expect(await balanceOf(tx, ids.hdfc)).toBe(0);
      expect(await booksDifference(tx)).toBe(baseline);
    });
  }
);

it.skipIf(!localDatabase)(
  "moves a vendor payment to its matched debit, leaving its supplier advance and invoice alone",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const baseline = await booksDifference(tx);
      const vpId = uuidv7();
      await tx.insert(vendorPayment).values({
        chargedTo: "organisation",
        createdAt: NOW,
        id: vpId,
        status: "paid",
        title: "Tent hire",
        updatedAt: NOW,
        userId: ids.user,
        vendorId: ids.vendor,
      });
      await tx.insert(vendorPaymentLineItem).values({
        amountPaise: 150_000,
        categoryId: ids.category,
        createdAt: NOW,
        id: uuidv7(),
        sortOrder: 0,
        updatedAt: NOW,
        vendorPaymentId: vpId,
      });
      const paymentId = uuidv7();
      await tx.insert(vendorPaymentTransaction).values({
        amountPaise: 150_000,
        createdAt: NOW,
        id: paymentId,
        paymentReference: "AXISN12345678",
        status: "approved",
        transactionDate: new Date("2026-08-10T06:00:00Z"),
        updatedAt: NOW,
        userId: ids.user,
        vendorPaymentId: vpId,
      });
      const payment: IncomeSource = {
        sourceId: paymentId,
        sourceType: "vendor_payment_transaction",
      };
      await run(tx, payment);
      const line = await addDebit(tx, ids.hdfc, {
        amountPaise: 150_000,
        reference: "AXISN12345678",
        valueOn: "2026-08-11",
      });
      await allocate(tx, line, [
        {
          amountPaise: 150_000,
          kind: "vendor_payment_transaction",
          vendorPaymentTransactionId: paymentId,
        },
      ]);
      expect(await run(tx, payment)).toMatchObject({ posted: 1, reversed: 1 });
      expect(await standingMovements(tx, paymentId)).toEqual([
        [ids.hdfc, "2026-08-11", 150_000, "payout", line],
      ]);
      expect(await recognisePostings(tx, paymentId)).toBe(1);
      expect(await booksDifference(tx)).toBe(baseline);
    });
  }
);

it.skipIf(!localDatabase)(
  "allows one live allocation per document and line, and counts what a void would release",
  async () => {
    const { countLiveDocumentAllocations } =
      await import("../queries/bank-debits");
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const claim = await addClaim(tx, ids);
      const line = await addDebit(tx, ids.hdfc);
      await allocate(tx, line, [
        { amountPaise: 10_000, kind: "reimbursement", reimbursementId: claim },
      ]);
      await tx.execute(sql`savepoint dup`);
      await expect(
        allocate(tx, line, [
          {
            amountPaise: 10_000,
            kind: "reimbursement",
            reimbursementId: claim,
          },
        ])
      ).rejects.toThrow();
      await tx.execute(sql`rollback to savepoint dup`);
      expect(
        await countLiveDocumentAllocations(tx as never, {
          reimbursementIds: [claim],
          vendorPaymentTransactionIds: [],
        })
      ).toBe(1);
      await release(tx, line);
      expect(
        await countLiveDocumentAllocations(tx as never, {
          reimbursementIds: [claim],
          vendorPaymentTransactionIds: [],
        })
      ).toBe(0);
      // Released, the same pair can be matched again.
      await allocate(tx, line, [
        { amountPaise: 10_000, kind: "reimbursement", reimbursementId: claim },
      ]);
    });
  }
);
