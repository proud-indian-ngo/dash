import { LEDGER_ACCOUNT_HEAD_IDS } from "@pi-dash/shared/constants";
import { SQL } from "bun";
import { and, eq, inArray, sql } from "drizzle-orm";
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
import { teamEvent } from "../schema/team-event";
import { vendor, vendorPayment, vendorPaymentLineItem } from "../schema/vendor";
import { vendorPaymentTransaction } from "../schema/vendor-payment-transaction";
import type { LedgerTx } from "./engine";
import { userHasExpensesInBooks } from "./expense-posting";
import {
  type IncomeSource,
  listIncomeSources,
  postIncomeSource,
  relatedIncomeSources,
  sweepIncomeSources,
  waitingByReason,
} from "./income-posting";

/**
 * Database-backed checks of expense posting (layer 3-3a). Opt in with
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
    bank: uuidv7(),
    category: uuidv7(),
    user: someone.id,
    vendor: uuidv7(),
  };
  // One active bank account: "the main bank account".
  await tx
    .update(orgAccount)
    .set({ active: false })
    .where(eq(orgAccount.kind, "bank"));
  await tx.insert(orgAccount).values({
    createdAt: NOW,
    id: ids.bank,
    kind: "bank",
    name: `Expense test bank ${ids.bank}`,
    updatedAt: NOW,
  });
  // The books' reference heads expense posting needs (normally made at
  // server start).
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
  // The database's own records count as looked at, so only this test's
  // records show up as waiting or unchecked.
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
  if (programmes.length !== 2) {
    throw new Error("Seed the finance dimensions first");
  }
  return {
    ...ids,
    programmeA: programmes[0]?.id as string,
    programmeB: programmes[1]?.id as string,
  };
}

type Ids = Awaited<ReturnType<typeof foundation>>;

async function addClaim(
  tx: LedgerTx,
  ids: Ids,
  over: Partial<typeof reimbursement.$inferInsert> = {},
  amounts: number[] = [30_000, 12_500]
) {
  const id = uuidv7();
  await tx.insert(reimbursement).values({
    approvalScreenshotKey: `approval-screenshots/${id}/proof.png`,
    chargedProgrammeId: ids.programmeA,
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

const run = (tx: LedgerTx, source: IncomeSource) =>
  postIncomeSource(tx, source, { actorId: null, now: NOW });

const claimSource = (sourceId: string): IncomeSource => ({
  sourceId,
  sourceType: "reimbursement",
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

/** Net expense recognised for the source, by programme. */
async function expenseByProgramme(tx: LedgerTx, sourceId: string) {
  const rows = await tx
    .select({ entry: ledgerEntry })
    .from(ledgerEntry)
    .innerJoin(posting, eq(posting.id, ledgerEntry.postingId))
    .where(eq(posting.sourceId, sourceId));
  const net = new Map<string | null, number>();
  for (const { entry } of rows) {
    net.set(
      entry.programmeId,
      (net.get(entry.programmeId) ?? 0) +
        (entry.effect === "increase" ? entry.amountPaise : -entry.amountPaise)
    );
  }
  return net;
}

/** The vendor's supplier advance standing in the books. */
async function advancesOf(tx: LedgerTx, partyId: string) {
  const [row] = await tx
    .select({
      net: sql<string>`coalesce(sum(case when ${ledgerEntry.effect} = 'increase' then ${ledgerEntry.amountPaise} else -${ledgerEntry.amountPaise} end), 0)`,
    })
    .from(ledgerEntry)
    .where(
      and(
        eq(ledgerEntry.partyId, partyId),
        eq(ledgerEntry.accountHeadId, LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances)
      )
    );
  return Number(row?.net ?? 0);
}

async function stateOf(tx: LedgerTx, sourceId: string) {
  const [row] = await tx
    .select()
    .from(ledgerSourceState)
    .where(eq(ledgerSourceState.sourceId, sourceId));
  return row;
}

it.skipIf(!localDatabase)(
  "posts an approved reimbursement per line under its category's head, once",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addClaim(tx, ids);
      expect(await run(tx, claimSource(id))).toEqual({
        posted: 2,
        reason: null,
        reversed: 0,
        status: "posted",
      });
      expect(await run(tx, claimSource(id))).toMatchObject({
        posted: 0,
        reversed: 0,
      });
      const postings = await postingsOf(tx, id);
      expect(postings.map((p) => [p.action, p.economicOn])).toEqual([
        ["recognise", "2026-06-03"],
        ["cash", "2026-06-03"],
      ]);
      expect(await balanceOf(tx, ids.bank)).toBe(-42_500);
      expect(await expenseByProgramme(tx, id)).toEqual(
        new Map([[ids.programmeA, 42_500]])
      );
      // The category got its own expense head under "Expenses".
      const [category] = await tx
        .select({ headId: expenseCategory.accountHeadId })
        .from(expenseCategory)
        .where(eq(expenseCategory.id, ids.category));
      const [head] = await tx
        .select()
        .from(accountHead)
        .where(eq(accountHead.id, category?.headId as string));
      expect(head).toMatchObject({ type: "expense" });
      const entries = await tx
        .select()
        .from(ledgerEntry)
        .where(
          inArray(
            ledgerEntry.postingId,
            postings.map((p) => p.id)
          )
        );
      expect(new Set(entries.map((e) => e.accountHeadId))).toEqual(
        new Set([head?.id])
      );
      expect(await stateOf(tx, id)).toMatchObject({ status: "posted" });
    });
  }
);

it.skipIf(!localDatabase)(
  "reverses and reposts on edits, un-approval and deletion",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addClaim(tx, ids);
      await run(tx, claimSource(id));

      // A recharge moves the recognition only.
      await tx
        .update(reimbursement)
        .set({ chargedProgrammeId: ids.programmeB })
        .where(eq(reimbursement.id, id));
      expect(await run(tx, claimSource(id))).toMatchObject({
        posted: 1,
        reversed: 1,
      });
      expect(await balanceOf(tx, ids.bank)).toBe(-42_500);
      expect(await expenseByProgramme(tx, id)).toEqual(
        new Map([
          [ids.programmeA, 0],
          [ids.programmeB, 42_500],
        ])
      );

      // An amount change reposts both parts at the next revision.
      await tx
        .update(reimbursementLineItem)
        .set({ amountPaise: 40_000 })
        .where(
          and(
            eq(reimbursementLineItem.reimbursementId, id),
            eq(reimbursementLineItem.amountPaise, 30_000)
          )
        );
      expect(await run(tx, claimSource(id))).toMatchObject({
        posted: 2,
        reversed: 2,
      });
      expect(await balanceOf(tx, ids.bank)).toBe(-52_500);
      const revisions = (await postingsOf(tx, id)).map((p) => p.sourceRevision);
      expect(Math.max(...revisions)).toBe(3);

      // Reset to pending: reversed, nothing stands.
      await tx
        .update(reimbursement)
        .set({
          approvalScreenshotKey: null,
          reviewedAt: null,
          status: "pending",
        })
        .where(eq(reimbursement.id, id));
      expect(await run(tx, claimSource(id))).toMatchObject({
        posted: 0,
        reversed: 2,
        status: "none",
      });
      expect(await balanceOf(tx, ids.bank)).toBe(0);
      expect(await stateOf(tx, id)).toMatchObject({ reason: "not_approved" });

      // Approved again, then deleted: reversed, and its state goes.
      await tx
        .update(reimbursement)
        .set({
          approvalScreenshotKey: "approval-screenshots/again.png",
          reviewedAt: APPROVED_AT,
          status: "approved",
        })
        .where(eq(reimbursement.id, id));
      expect(await run(tx, claimSource(id))).toMatchObject({ posted: 2 });
      await tx.delete(reimbursement).where(eq(reimbursement.id, id));
      expect(await run(tx, claimSource(id))).toMatchObject({
        reversed: 2,
        status: "none",
      });
      expect(await balanceOf(tx, ids.bank)).toBe(0);
      expect(await stateOf(tx, id)).toBeUndefined();
    });
  }
);

it.skipIf(!localDatabase)(
  "waits for proof of payment, never posts before the cutover, and the sweep finds both",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const noProof = await addClaim(tx, ids, { approvalScreenshotKey: null });
      const early = await addClaim(tx, ids, {
        expenseDate: "2026-03-20",
        reviewedAt: new Date("2026-03-25T06:00:00Z"),
      });
      const sources = await listIncomeSources(tx);
      expect(sources).toContainEqual(claimSource(noProof));
      expect(sources).not.toContainEqual(claimSource(early));

      const result = await sweepIncomeSources({
        actorId: null,
        now: () => NOW,
        run: (work) => work(tx),
      });
      expect(result.waiting).toBeGreaterThanOrEqual(1);
      expect(await stateOf(tx, noProof)).toMatchObject({
        economicOn: "2026-06-03",
        reason: "no_payment_proof",
        status: "waiting",
      });
      expect(await postingsOf(tx, noProof)).toEqual([]);
      expect(await run(tx, claimSource(early))).toMatchObject({
        reason: "before_cutover",
        status: "none",
      });
      const waiting = await waitingByReason(tx, {
        endsOn: "2027-03-31",
        startsOn: "2026-04-01",
      });
      // The seeded database may hold approved claims without proof too.
      expect(waiting.get("no_payment_proof")).toBeGreaterThanOrEqual(1);
    });
  }
);

it.skipIf(!localDatabase)(
  "posts a waiting claim once its payment proof is added after approval",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addClaim(tx, ids, { approvalScreenshotKey: null });
      expect(await run(tx, claimSource(id))).toMatchObject({
        reason: "no_payment_proof",
        status: "waiting",
      });
      expect(await postingsOf(tx, id)).toEqual([]);

      // What reimbursement.addPaymentProof writes: the screenshot, where
      // approval stores it, and nothing else about the claim.
      await tx
        .update(reimbursement)
        .set({
          approvalScreenshotKey: `approval-screenshots/reimbursements/${id}/approval-screenshots/added.png`,
        })
        .where(eq(reimbursement.id, id));
      expect(await run(tx, claimSource(id))).toMatchObject({
        posted: 2,
        status: "posted",
      });
      // On its approval day, out of the main bank account.
      expect(
        (await postingsOf(tx, id)).map((p) => [p.action, p.economicOn])
      ).toEqual([
        ["recognise", "2026-06-03"],
        ["cash", "2026-06-03"],
      ]);
      expect(await balanceOf(tx, ids.bank)).toBe(-42_500);
      expect(await stateOf(tx, id)).toMatchObject({ status: "posted" });

      // Replacing the proof later changes nothing in the books.
      await tx
        .update(reimbursement)
        .set({
          approvalScreenshotKey: `approval-screenshots/reimbursements/${id}/approval-screenshots/better.png`,
        })
        .where(eq(reimbursement.id, id));
      expect(await run(tx, claimSource(id))).toMatchObject({
        posted: 0,
        reversed: 0,
      });
    });
  }
);

it.skipIf(!localDatabase)(
  "says why an approved claim waits or posts nothing: no approval day, a zero total",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const noDay = await addClaim(tx, ids, { reviewedAt: null });
      expect(await run(tx, claimSource(noDay))).toMatchObject({
        reason: "no_approval_day",
        status: "waiting",
      });
      const zero = await addClaim(tx, ids, {}, [0]);
      expect(await run(tx, claimSource(zero))).toMatchObject({
        reason: "nothing_to_post",
        status: "none",
      });
    });
  }
);

it.skipIf(!localDatabase)(
  "posts a vendor payment's payment from the bank, and its expense when the invoice is accepted",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const [event] = await tx
        .select({ id: teamEvent.id, programmeId: teamEvent.programmeId })
        .from(teamEvent)
        .limit(1);
      const vpId = uuidv7();
      await tx.insert(vendorPayment).values({
        chargedTo: event ? "event" : "organisation",
        createdAt: NOW,
        eventId: event?.id ?? null,
        id: vpId,
        status: "paid",
        title: "Bus for the event",
        updatedAt: NOW,
        userId: ids.user,
        vendorId: ids.vendor,
      });
      await tx.insert(vendorPaymentLineItem).values({
        amountPaise: 250_000,
        categoryId: ids.category,
        createdAt: NOW,
        id: uuidv7(),
        sortOrder: 0,
        updatedAt: NOW,
        vendorPaymentId: vpId,
      });
      const paymentId = uuidv7();
      await tx.insert(vendorPaymentTransaction).values({
        amountPaise: 250_000,
        createdAt: NOW,
        id: paymentId,
        paymentReference: "UTR42",
        status: "approved",
        transactionDate: new Date("2026-07-10T06:00:00Z"),
        updatedAt: NOW,
        userId: ids.user,
        vendorPaymentId: vpId,
      });
      const request: IncomeSource = {
        sourceId: vpId,
        sourceType: "vendor_payment",
      };
      const payment: IncomeSource = {
        sourceId: paymentId,
        sourceType: "vendor_payment_transaction",
      };
      expect(await relatedIncomeSources(tx, request)).toEqual([payment]);
      expect(await relatedIncomeSources(tx, payment)).toEqual([request]);

      // Paid, invoice not accepted: money out as a supplier advance.
      expect(await run(tx, payment)).toMatchObject({ posted: 2 });
      expect(await run(tx, request)).toMatchObject({
        reason: "invoice_not_accepted",
        status: "none",
      });
      expect(await balanceOf(tx, ids.bank)).toBe(-250_000);
      expect(await advancesOf(tx, ids.vendor)).toBe(250_000);
      const [movement] = await tx
        .select()
        .from(accountMovement)
        .innerJoin(posting, eq(posting.id, accountMovement.postingId))
        .where(eq(posting.sourceId, paymentId));
      expect(movement?.account_movement).toMatchObject({
        kind: "payout",
        occurredOn: "2026-07-10",
        paymentReference: "UTR42",
      });

      // The invoice is accepted: the expense, with the vendor as party.
      await tx
        .update(vendorPayment)
        .set({
          invoiceDate: "2026-07-15",
          invoiceNumber: "INV-1",
          invoiceReviewedAt: new Date("2026-07-20T06:00:00Z"),
          status: "completed",
        })
        .where(eq(vendorPayment.id, vpId));
      expect(await run(tx, request)).toMatchObject({
        posted: 1,
        status: "posted",
      });
      const entries = await tx
        .select({ entry: ledgerEntry })
        .from(ledgerEntry)
        .innerJoin(posting, eq(posting.id, ledgerEntry.postingId))
        .where(eq(posting.sourceId, vpId));
      expect(entries.map((e) => e.entry)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            amountPaise: 250_000,
            economicOn: "2026-07-20",
            effect: "increase",
            eventId: event?.id ?? null,
            partyId: ids.vendor,
            programmeId: event?.programmeId ?? null,
          }),
        ])
      );
      // Money left once: the payment, not the invoice; the advance is clear.
      expect(await balanceOf(tx, ids.bank)).toBe(-250_000);
      expect(await advancesOf(tx, ids.vendor)).toBe(0);

      // Deleting the request (its payments go with it) reverses both.
      await tx.delete(vendorPayment).where(eq(vendorPayment.id, vpId));
      await run(tx, request);
      await run(tx, payment);
      expect(await balanceOf(tx, ids.bank)).toBe(0);
      expect(await stateOf(tx, vpId)).toBeUndefined();
      expect(await stateOf(tx, paymentId)).toBeUndefined();
    });
  }
);

it.skipIf(!localDatabase)(
  "keeps the books' event: an event with posted expenses can't be deleted",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const [event] = await tx
        .select({ id: teamEvent.id })
        .from(teamEvent)
        .limit(1);
      if (!event) {
        return;
      }
      const id = await addClaim(tx, ids, {
        chargedProgrammeId: null,
        chargedTo: "event",
        eventId: event.id,
      });
      await run(tx, claimSource(id));
      // The request goes; its entries (and their reversals) keep the event.
      await tx.delete(reimbursement).where(eq(reimbursement.id, id));
      await run(tx, claimSource(id));
      await expect(
        tx.transaction((sp) =>
          sp.delete(teamEvent).where(eq(teamEvent.id, event.id))
        )
      ).rejects.toThrow();
    });
  }
);

it.skipIf(!localDatabase)(
  "waits on an invoice above its approved payments, and posts once they agree, keeping the books balanced",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const vpId = uuidv7();
      await tx.insert(vendorPayment).values({
        chargedTo: "organisation",
        createdAt: NOW,
        id: vpId,
        invoiceDate: "2026-07-15",
        invoiceNumber: "INV-2",
        invoiceReviewedAt: new Date("2026-07-20T06:00:00Z"),
        status: "completed",
        title: "Sound system",
        updatedAt: NOW,
        userId: ids.user,
        vendorId: ids.vendor,
      });
      await tx.insert(vendorPaymentLineItem).values({
        amountPaise: 250_000,
        categoryId: ids.category,
        createdAt: NOW,
        id: uuidv7(),
        sortOrder: 0,
        updatedAt: NOW,
        vendorPaymentId: vpId,
      });
      const addPayment = async (amountPaise: number) => {
        const id = uuidv7();
        await tx.insert(vendorPaymentTransaction).values({
          amountPaise,
          createdAt: NOW,
          id,
          status: "approved",
          transactionDate: new Date("2026-07-10T06:00:00Z"),
          updatedAt: NOW,
          userId: ids.user,
          vendorPaymentId: vpId,
        });
        await run(tx, {
          sourceId: id,
          sourceType: "vendor_payment_transaction",
        });
        return id;
      };
      const request: IncomeSource = {
        sourceId: vpId,
        sourceType: "vendor_payment",
      };
      await addPayment(200_000);
      expect(await run(tx, request)).toMatchObject({
        reason: "invoice_exceeds_payments",
        status: "waiting",
      });
      expect(await postingsOf(tx, vpId)).toEqual([]);

      await addPayment(50_000);
      expect(await run(tx, request)).toMatchObject({
        posted: 1,
        status: "posted",
      });
      expect(await advancesOf(tx, ids.vendor)).toBe(0);
      // Expense recognised equals the money that left the bank.
      const [expense] = await tx
        .select({
          net: sql<string>`coalesce(sum(case when ${ledgerEntry.effect} = 'increase' then ${ledgerEntry.amountPaise} else -${ledgerEntry.amountPaise} end), 0)`,
        })
        .from(ledgerEntry)
        .innerJoin(posting, eq(posting.id, ledgerEntry.postingId))
        .where(
          and(
            eq(posting.sourceId, vpId),
            eq(
              ledgerEntry.accountHeadId,
              sql`(select account_head_id from expense_category where id = ${ids.category})`
            )
          )
        );
      expect(Number(expense?.net)).toBe(-(await balanceOf(tx, ids.bank)));
    });
  }
);

it.skipIf(!localDatabase)(
  "names a login whose requests the books hold, until their postings are reversed",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const claimant = uuidv7();
      await tx.insert(user).values({
        email: `expense-test-${claimant}@example.test`,
        emailVerified: true,
        id: claimant,
        isActive: true,
        name: "Expense test claimant",
        role: "volunteer",
      });
      const id = await addClaim(tx, { ...ids, user: claimant });
      expect(await userHasExpensesInBooks(tx, claimant)).toBe(false);
      await run(tx, claimSource(id));
      expect(await userHasExpensesInBooks(tx, claimant)).toBe(true);
      await tx
        .update(reimbursement)
        .set({ reviewedAt: null, status: "pending" })
        .where(eq(reimbursement.id, id));
      await run(tx, claimSource(id));
      expect(await userHasExpensesInBooks(tx, claimant)).toBe(false);
    });
  }
);

it.skipIf(!localDatabase)(
  "reverses and reposts a posted reimbursement to its new claimant",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const [first, second] = [uuidv7(), uuidv7()];
      await tx.insert(user).values(
        [
          [first, "First claimant"],
          [second, "Second claimant"],
        ].map(([id, name]) => ({
          email: `expense-test-${id}@example.test`,
          emailVerified: true,
          id: id as string,
          isActive: true,
          name: name as string,
          role: "volunteer",
        }))
      );
      const id = await addClaim(tx, { ...ids, user: first });
      await run(tx, claimSource(id));
      const payoutMemos = async () =>
        (
          await tx
            .select({
              direction: accountMovement.direction,
              memo: accountMovement.memo,
            })
            .from(accountMovement)
            .innerJoin(posting, eq(posting.id, accountMovement.postingId))
            .where(eq(posting.sourceId, id))
            .orderBy(posting.createdAt, posting.id)
        ).map((m) => `${m.direction} ${m.memo}`);
      expect(await payoutMemos()).toEqual([
        "out Class outing (paid to First claimant)",
      ]);

      // reimbursement.changeClaimant moves the request to someone else.
      await tx
        .update(reimbursement)
        .set({ updatedAt: new Date(NOW.getTime() + 1000), userId: second })
        .where(eq(reimbursement.id, id));
      expect(await run(tx, claimSource(id))).toMatchObject({
        posted: 2,
        reversed: 2,
      });
      expect(await payoutMemos()).toEqual([
        "out Class outing (paid to First claimant)",
        "in Class outing (paid to First claimant)",
        "out Class outing (paid to Second claimant)",
      ]);
      // Paid once, expensed once.
      expect(await balanceOf(tx, ids.bank)).toBe(-42_500);
      expect(await expenseByProgramme(tx, id)).toEqual(
        new Map([[ids.programmeA, 42_500]])
      );
      // The old claimant's login no longer holds it in the books.
      expect(await userHasExpensesInBooks(tx, first)).toBe(false);
      expect(await userHasExpensesInBooks(tx, second)).toBe(true);
      expect(await run(tx, claimSource(id))).toMatchObject({
        posted: 0,
        reversed: 0,
      });
    });
  }
);

it.skipIf(!localDatabase)(
  "reverses a voided reimbursement once, on the void day",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addClaim(tx, ids);
      await run(tx, claimSource(id));
      expect(await balanceOf(tx, ids.bank)).toBe(-42_500);

      const VOIDED_AT = new Date("2026-11-02T05:00:00Z");
      await tx
        .update(reimbursement)
        .set({
          updatedAt: VOIDED_AT,
          voidedAt: VOIDED_AT,
          voidReason: "Paid twice by mistake",
        })
        .where(eq(reimbursement.id, id));
      expect(await run(tx, claimSource(id))).toMatchObject({
        posted: 0,
        reason: "voided",
        reversed: 2,
        status: "none",
      });
      const postings = await postingsOf(tx, id);
      expect(
        postings.map((p) => [p.action, p.economicOn, p.reason ?? null])
      ).toEqual([
        ["recognise", "2026-06-03", null],
        ["cash", "2026-06-03", null],
        ["reverse:recognise", "2026-11-02", "The reimbursement was voided"],
        ["reverse:cash", "2026-11-02", "The reimbursement was voided"],
      ]);
      // The reversing entries and movements are dated the void day too.
      const reversalIds = postings
        .filter((p) => p.reversesPostingId)
        .map((p) => p.id);
      const entries = await tx
        .select({ economicOn: ledgerEntry.economicOn })
        .from(ledgerEntry)
        .where(inArray(ledgerEntry.postingId, reversalIds));
      const movements = await tx
        .select({ occurredOn: accountMovement.occurredOn })
        .from(accountMovement)
        .where(inArray(accountMovement.postingId, reversalIds));
      expect(new Set(entries.map((e) => e.economicOn))).toEqual(
        new Set(["2026-11-02"])
      );
      expect(movements.map((m) => m.occurredOn)).toEqual(["2026-11-02"]);
      expect(await balanceOf(tx, ids.bank)).toBe(0);
      expect(await stateOf(tx, id)).toMatchObject({
        reason: "voided",
        status: "none",
      });

      // Idempotent: another run (or the sweep) reverses nothing more.
      expect(await run(tx, claimSource(id))).toMatchObject({
        posted: 0,
        reversed: 0,
      });
      expect(await postingsOf(tx, id)).toHaveLength(4);
    });
  }
);

it.skipIf(!localDatabase)(
  "waits to reverse a void while its day's year is closed",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const id = await addClaim(tx, ids);
      await run(tx, claimSource(id));
      const VOIDED_AT = new Date("2026-11-02T05:00:00Z");
      await tx
        .update(reimbursement)
        .set({
          updatedAt: VOIDED_AT,
          voidedAt: VOIDED_AT,
          voidReason: "Duplicate",
        })
        .where(eq(reimbursement.id, id));
      await tx.update(fiscalYear).set({ closedAt: NOW });
      expect(await run(tx, claimSource(id))).toMatchObject({
        reason: "year_closed",
        reversed: 0,
        status: "waiting",
      });
      expect(await postingsOf(tx, id)).toHaveLength(2);
      await tx.update(fiscalYear).set({ closedAt: null });
      expect(await run(tx, claimSource(id))).toMatchObject({ reversed: 2 });
    });
  }
);

it.skipIf(!localDatabase)(
  "reverses a voided vendor payment request's payment through the request",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const vpId = uuidv7();
      await tx.insert(vendorPayment).values({
        chargedTo: "organisation",
        createdAt: NOW,
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
      const source: IncomeSource = {
        sourceId: paymentId,
        sourceType: "vendor_payment_transaction",
      };
      await run(tx, source);
      expect(await balanceOf(tx, ids.bank)).toBe(-10_000);
      const VOIDED_AT = new Date("2026-11-02T05:00:00Z");
      await tx
        .update(vendorPayment)
        .set({
          updatedAt: VOIDED_AT,
          voidedAt: VOIDED_AT,
          voidReason: "Wrong vendor",
        })
        .where(eq(vendorPayment.id, vpId));
      expect(await run(tx, source)).toMatchObject({
        reason: "voided",
        reversed: 2,
      });
      expect(await balanceOf(tx, ids.bank)).toBe(0);
      expect(await advancesOf(tx, ids.vendor)).toBe(0);
    });
  }
);
