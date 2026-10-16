import type { BalanceSheetLine } from "@pi-dash/shared/audited-figures";
import {
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import { SQL } from "bun";
import { and, eq, lte, sql } from "drizzle-orm";
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
} from "../schema/finance-dimensions";
import {
  auditedFigures,
  auditedFiguresLine,
  ledgerEntry,
  ledgerSourceState,
  openingBalance,
  posting,
} from "../schema/ledger";
import { party } from "../schema/party";
import { vendor, vendorPayment, vendorPaymentLineItem } from "../schema/vendor";
import { vendorPaymentTransaction } from "../schema/vendor-payment-transaction";
import { loadBalanceSheetLines, postAuditedFigures } from "./audited-figures";
import { type LedgerTx, reverse } from "./engine";
import { vendorPaymentProvisionView } from "./expense-posting";
import {
  type IncomeSource,
  listIncomeSources,
  postIncomeSource,
  relatedIncomeSources,
} from "./income-posting";
import { postOpeningBalance } from "./opening-balance";

/**
 * Database-backed checks of an auditor's invoice clearing the audit fee
 * provision. Opt in with LEDGER_TEST_DATABASE_URL pointing at a local,
 * migrated and seeded database (a worktree's isolated database). Every
 * test runs in a transaction that is rolled back, with synthetic records
 * and fake amounts only: the provision here is 7,500 and the invoices are
 * 5,000 and 9,000.
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
const NOW = new Date("2026-10-15T06:00:00Z");
const AFTER_YEAR_END = new Date("2027-04-02T06:00:00Z");
const YEAR_END = "2027-03-31";
const PROVISION_PAISE = 7500_00;

/** A day at 11:30 in India. */
const at = (day: string) => new Date(`${day}T06:00:00Z`);

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
  await tx
    .update(orgAccount)
    .set({ active: false })
    .where(eq(orgAccount.kind, "bank"));
  await tx.insert(orgAccount).values({
    createdAt: NOW,
    id: ids.bank,
    kind: "bank",
    name: `Provision test bank ${ids.bank}`,
    updatedAt: NOW,
  });
  await tx
    .insert(accountHead)
    .values(
      (
        [
          ["expenses", "expense"],
          ["supplierAdvances", "asset"],
          ["auditFeesPayable", "liability"],
          ["auditFees", "expense"],
          ["fundBalance", "fund"],
          ["fixedAssets", "asset"],
          ["yearEndAdjustments", "expense"],
          ["yearEndAdjustmentsIncome", "income"],
          ["depreciation", "expense"],
          ["fundTransfers", "fund"],
        ] as const
      ).map(([key, type]) => ({
        code: `TEST_${key}`,
        createdAt: NOW,
        id: H[key],
        name: `Test ${key}`,
        type,
        updatedAt: NOW,
      }))
    )
    .onConflictDoNothing();
  await tx.insert(expenseCategory).values({
    createdAt: NOW,
    id: ids.category,
    name: `Audit category ${ids.category}`,
    updatedAt: NOW,
  });
  await tx.insert(party).values({
    createdAt: NOW,
    displayName: "Test auditor",
    id: ids.vendor,
    kind: "organisation",
    updatedAt: NOW,
  });
  await tx.insert(vendor).values({
    createdAt: NOW,
    id: ids.vendor,
    name: "Test auditor",
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
  // The database's own provision (seed opening balances) is reversed, and
  // its documents cleared in this rolled-back transaction, so this test's
  // opening provision is the only one.
  await tx.execute(sql`SET LOCAL pi_dash.ledger_maintenance = 'on'`);
  await tx.delete(auditedFiguresLine);
  await tx.delete(auditedFigures);
  await tx.delete(openingBalance);
  await tx.execute(sql`SET LOCAL pi_dash.ledger_maintenance = 'off'`);
  const standing = (await tx.execute(sql`
    select p.id from ${posting} p
    where p.reverses_posting_id is null
      and not exists (select 1 from ${posting} r where r.reverses_posting_id = p.id)
      and exists (select 1 from ${ledgerEntry} e
        where e.posting_id = p.id and e.account_head_id = ${H.auditFeesPayable})`)) as unknown as {
    id: string;
  }[];
  for (const row of standing) {
    await reverse(tx, String(row.id), {
      actorId: someone.id,
      now: NOW,
      reason: "Test starts from its own provision",
    });
  }
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
        { amountPaise: 10_000_00, kind: "account", orgAccountId: ids.bank },
        {
          amountPaise: PROVISION_PAISE,
          kind: "liability",
          memo: "Audit fees payable",
        },
        { amountPaise: 2500_00, fundId: GENERAL_FUND_ID, kind: "fund" },
      ],
    },
    { actorId: someone.id, now: NOW }
  );
  return { ...ids, yearId: year.id };
}

type Ids = Awaited<ReturnType<typeof foundation>>;

/** An accepted auditor's invoice charged to the provision, fully paid. */
async function addInvoice(
  tx: LedgerTx,
  ids: Ids,
  input: { acceptedOn: string; amountPaise: number; paidOn: string }
) {
  const id = uuidv7();
  const lineId = uuidv7();
  const paymentId = uuidv7();
  await tx.insert(vendorPayment).values({
    chargedTo: "organisation",
    createdAt: NOW,
    id,
    invoiceDate: input.acceptedOn,
    invoiceNumber: `AUD-${id.slice(-6)}`,
    invoiceReviewedAt: at(input.acceptedOn),
    reviewedAt: at(input.paidOn),
    reviewedBy: ids.user,
    status: "completed",
    title: "Statutory audit",
    updatedAt: NOW,
    userId: ids.user,
    vendorId: ids.vendor,
  });
  await tx.insert(vendorPaymentLineItem).values({
    amountPaise: input.amountPaise,
    categoryId: ids.category,
    createdAt: NOW,
    description: "Audit fee",
    id: lineId,
    provisionHeadId: H.auditFeesPayable,
    sortOrder: 0,
    updatedAt: NOW,
    vendorPaymentId: id,
  });
  await tx.insert(vendorPaymentTransaction).values({
    amountPaise: input.amountPaise,
    createdAt: NOW,
    id: paymentId,
    paymentMethod: "bank_transfer",
    reviewedAt: NOW,
    reviewedBy: ids.user,
    status: "approved",
    transactionDate: at(input.paidOn),
    updatedAt: NOW,
    userId: ids.user,
    vendorPaymentId: id,
  });
  return { id, lineId, paymentId };
}

const invoiceSource = (sourceId: string): IncomeSource => ({
  sourceId,
  sourceType: "vendor_payment",
});
const paymentSource = (sourceId: string): IncomeSource => ({
  sourceId,
  sourceType: "vendor_payment_transaction",
});

const run = (tx: LedgerTx, source: IncomeSource, now: Date = NOW) =>
  postIncomeSource(tx, source, { actorId: null, now });

/** What the provision holds on a day, by every entry dated up to it. */
async function provisionOn(tx: LedgerTx, day: string) {
  const [row] = await tx
    .select({
      net: sql<string>`coalesce(sum(case when ${ledgerEntry.effect} = 'increase' then ${ledgerEntry.amountPaise} else -${ledgerEntry.amountPaise} end), 0)`,
    })
    .from(ledgerEntry)
    .where(
      and(
        eq(ledgerEntry.accountHeadId, H.auditFeesPayable),
        lte(ledgerEntry.economicOn, day)
      )
    );
  return Number(row?.net ?? 0);
}

/** How the invoice's line stands split: cleared from the provision, and expense. */
async function splitOf(tx: LedgerTx, id: string) {
  const { split } = await vendorPaymentProvisionView(tx, id, "2026-10-15");
  return split.map((s) => [s.clearedPaise, s.expensePaise]);
}

async function postingCount(tx: LedgerTx, sourceId: string) {
  const rows = await tx
    .select({ id: posting.id })
    .from(posting)
    .where(eq(posting.sourceId, sourceId));
  return rows.length;
}

/** Assets less liabilities less funds of the balance sheet lines. */
const balanceCheck = (lines: readonly BalanceSheetLine[]) =>
  lines.reduce(
    (sum, l) =>
      l.kind === "account" || l.kind === "asset"
        ? sum + l.booksPaise
        : sum - l.booksPaise,
    0
  );

/**
 * The books balance and the provision never goes below zero, on each day
 * (except the days a voided invoice's share is taken before its void day:
 * the accepted dip).
 */
async function expectSound(
  tx: LedgerTx,
  days: readonly string[],
  dipDays: readonly string[] = []
) {
  for (const day of days) {
    const { lines } = await loadBalanceSheetLines(tx, day);
    expect(balanceCheck(lines), `balance check on ${day}`).toBe(0);
    if (!dipDays.includes(day)) {
      expect(
        await provisionOn(tx, day),
        `provision on ${day}`
      ).toBeGreaterThanOrEqual(0);
    }
  }
}

const DAYS = ["2026-06-09", "2026-06-10", "2026-07-10", "2026-08-01", YEAR_END];

it.skipIf(!localDatabase)(
  "splits two invoices against the provision the same way in either order: the earlier one first, the rest as audit fees",
  async () => {
    const outcomes: unknown[] = [];
    for (const order of ["earlier first", "later first"] as const) {
      await inRolledBackTransaction(async (tx) => {
        const ids = await foundation(tx);
        const a = await addInvoice(tx, ids, {
          acceptedOn: "2026-06-10",
          amountPaise: 5000_00,
          paidOn: "2026-06-05",
        });
        const b = await addInvoice(tx, ids, {
          acceptedOn: "2026-07-10",
          amountPaise: 5000_00,
          paidOn: "2026-07-01",
        });
        await run(tx, paymentSource(a.paymentId));
        await run(tx, paymentSource(b.paymentId));
        const sequence = order === "earlier first" ? [a, b] : [b, a];
        for (const invoice of sequence) {
          expect(await run(tx, invoiceSource(invoice.id))).toMatchObject({
            posted: 1,
            reversed: 0,
            status: "posted",
          });
        }
        expect(await splitOf(tx, a.id)).toEqual([[5000_00, 0]]);
        expect(await splitOf(tx, b.id)).toEqual([[2500_00, 2500_00]]);
        // Looking again changes nothing (no churn), whichever goes first.
        for (const invoice of [...sequence].reverse()) {
          expect(await run(tx, invoiceSource(invoice.id))).toMatchObject({
            posted: 0,
            reversed: 0,
          });
        }
        expect(await provisionOn(tx, YEAR_END)).toBe(0);
        await expectSound(tx, DAYS);
        outcomes.push([await splitOf(tx, a.id), await splitOf(tx, b.id)]);
      });
    }
    expect(outcomes[0]).toEqual(outcomes[1]);
  }
);

it.skipIf(!localDatabase)(
  "keeps the split through an unrelated repost, resplits a later invoice when an earlier one changes, and reallocates as if a voided one never claimed",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const a = await addInvoice(tx, ids, {
        acceptedOn: "2026-06-10",
        amountPaise: 5000_00,
        paidOn: "2026-06-05",
      });
      const b = await addInvoice(tx, ids, {
        acceptedOn: "2026-07-10",
        amountPaise: 5000_00,
        paidOn: "2026-07-01",
      });
      for (const invoice of [a, b]) {
        await run(tx, paymentSource(invoice.paymentId));
        await run(tx, invoiceSource(invoice.id));
      }
      const bPostings = await postingCount(tx, b.id);

      // An unrelated repost of A (its memo) leaves B alone. Edits are
      // stamped after the seed's own postings, which the watermarks read.
      const edited = Math.max(Date.now(), NOW.getTime());
      const later = new Date(edited + 60_000);
      await tx
        .update(vendorPaymentLineItem)
        .set({ description: "Audit fee FY 2025-26", updatedAt: later })
        .where(eq(vendorPaymentLineItem.id, a.lineId));
      expect(await run(tx, invoiceSource(a.id), later)).toMatchObject({
        posted: 1,
        reversed: 1,
      });
      // B follows A (a related source) and finds nothing to change.
      expect(await relatedIncomeSources(tx, invoiceSource(a.id))).toEqual(
        expect.arrayContaining([invoiceSource(b.id)])
      );
      expect(await run(tx, invoiceSource(b.id), later)).toMatchObject({
        posted: 0,
        reversed: 0,
      });
      expect(await postingCount(tx, b.id)).toBe(bPostings);
      expect(await splitOf(tx, b.id)).toEqual([[2500_00, 2500_00]]);

      // A smaller A leaves more for B: the incremental sweep finds B too.
      const smaller = new Date(edited + 120_000);
      await tx
        .update(vendorPaymentLineItem)
        .set({ amountPaise: 3000_00, updatedAt: smaller })
        .where(eq(vendorPaymentLineItem.id, a.lineId));
      const changed = await listIncomeSources(tx, { incremental: true });
      expect(changed).toEqual(
        expect.arrayContaining([invoiceSource(a.id), invoiceSource(b.id)])
      );
      // In either order: B is worked out from A's record, not its postings.
      expect(await run(tx, invoiceSource(b.id), smaller)).toMatchObject({
        posted: 1,
        reversed: 1,
      });
      expect(await run(tx, invoiceSource(a.id), smaller)).toMatchObject({
        posted: 1,
        reversed: 1,
      });
      expect(await splitOf(tx, a.id)).toEqual([[3000_00, 0]]);
      expect(await splitOf(tx, b.id)).toEqual([[4500_00, 500_00]]);
      await expectSound(tx, DAYS);

      // A voided on 1 Aug is no claim for anyone: B (10 Jul) takes what A
      // took, and an invoice after the void takes the rest. A's own
      // reversal lands on 1 Aug, so the provision dips below zero between
      // 10 Jul and 1 Aug (the accepted trade-off); the year end is right.
      const voidedAt = at("2026-08-01");
      await tx
        .update(vendorPayment)
        .set({
          updatedAt: smaller,
          voidedAt,
          voidedBy: ids.user,
          voidReason: "Raised twice",
        })
        .where(eq(vendorPayment.id, a.id));
      await tx
        .update(vendorPaymentTransaction)
        .set({ voidedAt, voidedBy: ids.user, voidReason: "Raised twice" })
        .where(eq(vendorPaymentTransaction.id, a.paymentId));
      expect(await run(tx, invoiceSource(a.id), smaller)).toMatchObject({
        reversed: 1,
        status: "none",
      });
      await run(tx, paymentSource(a.paymentId), smaller);
      // Voiding A reposts the others charged to the provision.
      expect(await relatedIncomeSources(tx, invoiceSource(a.id))).toEqual(
        expect.arrayContaining([invoiceSource(b.id)])
      );
      expect(await run(tx, invoiceSource(b.id), smaller)).toMatchObject({
        posted: 1,
        reversed: 1,
      });
      expect(await splitOf(tx, b.id)).toEqual([[5000_00, 0]]);
      const c = await addInvoice(tx, ids, {
        acceptedOn: "2026-09-01",
        amountPaise: 5000_00,
        paidOn: "2026-08-20",
      });
      await run(tx, paymentSource(c.paymentId), smaller);
      await run(tx, invoiceSource(c.id), smaller);
      expect(await splitOf(tx, c.id)).toEqual([[2500_00, 2500_00]]);
      expect(await provisionOn(tx, "2026-07-31")).toBe(-500_00);
      expect(await provisionOn(tx, "2026-08-01")).toBe(2500_00);
      expect(await provisionOn(tx, YEAR_END)).toBe(0);
      await expectSound(
        tx,
        [...DAYS, "2026-07-31", "2026-09-01"],
        ["2026-07-10", "2026-07-31"]
      );

      // The approval picker says what is left, and from which year.
      const view = await vendorPaymentProvisionView(tx, uuidv7(), "2026-10-15");
      expect(view.outstanding).toEqual([
        { headId: H.auditFeesPayable, paise: 0, years: [] },
      ]);
      const early = await vendorPaymentProvisionView(
        tx,
        uuidv7(),
        "2026-06-01"
      );
      expect(early.outstanding).toEqual([
        {
          headId: H.auditFeesPayable,
          paise: PROVISION_PAISE,
          years: ["2025-26"],
        },
      ]);
    });
  }
);

it.skipIf(!localDatabase)(
  "clears a provision the audited figures added from the next year, and keeps a matched year's split as it stands",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const a = await addInvoice(tx, ids, {
        acceptedOn: "2026-06-10",
        amountPaise: 5000_00,
        paidOn: "2026-06-05",
      });
      await run(tx, paymentSource(a.paymentId));
      await run(tx, invoiceSource(a.id));
      expect(await provisionOn(tx, YEAR_END)).toBe(2500_00);

      // The CA provides 6,000 for FY 2026-27's audit: 3,500 more than the
      // books hold, against year-end adjustments.
      const { lines } = await loadBalanceSheetLines(tx, YEAR_END);
      const liability = `liability:${H.auditFeesPayable}`;
      const general = `fund:${GENERAL_FUND_ID}`;
      const change: Record<string, number> = {
        [general]: -3500_00,
        [liability]: 3500_00,
      };
      await postAuditedFigures(
        tx,
        {
          caName: "Test CA",
          fiscalYearId: ids.yearId,
          id: uuidv7(),
          lines: lines.map((l) => ({
            auditedPaise: l.booksPaise + (change[l.key] ?? 0),
            booksPaise: l.booksPaise,
            key: l.key,
          })),
          signedOn: "2027-04-01",
        },
        { actorId: ids.user, now: AFTER_YEAR_END }
      );
      expect(await provisionOn(tx, YEAR_END)).toBe(6000_00);
      // The audited figures post a difference, so the years can't be told.
      const picker = await vendorPaymentProvisionView(
        tx,
        uuidv7(),
        "2027-04-10"
      );
      expect(picker.outstanding).toEqual([
        { headId: H.auditFeesPayable, paise: 6000_00, years: [] },
      ]);

      // An invoice in FY 2027-28 clears it, posting in its own year.
      const nextYear = new Date("2027-06-01T06:00:00Z");
      const d = await addInvoice(tx, ids, {
        acceptedOn: "2027-05-10",
        amountPaise: 9000_00,
        paidOn: "2027-05-05",
      });
      await run(tx, paymentSource(d.paymentId), nextYear);
      expect(await run(tx, invoiceSource(d.id), nextYear)).toMatchObject({
        posted: 1,
        status: "posted",
      });
      expect(await splitOf(tx, d.id)).toEqual([[6000_00, 3000_00]]);
      const [dPosting] = await tx
        .select({ economicOn: posting.economicOn })
        .from(posting)
        .where(eq(posting.sourceId, d.id));
      expect(dPosting?.economicOn).toBe("2027-05-10");

      // A change to A inside the matched year can't post: it waits, and D
      // keeps the split the books hold for A.
      await tx
        .update(vendorPaymentLineItem)
        .set({ amountPaise: 4000_00, updatedAt: nextYear })
        .where(eq(vendorPaymentLineItem.id, a.lineId));
      expect(await run(tx, invoiceSource(a.id), nextYear)).toMatchObject({
        reason: "audited_figures_matched",
        status: "waiting",
      });
      expect(await run(tx, invoiceSource(d.id), nextYear)).toMatchObject({
        posted: 0,
        reversed: 0,
      });
      expect(await provisionOn(tx, "2027-05-10")).toBe(0);
      await expectSound(tx, [YEAR_END, "2027-05-10"]);
    });
  }
);

it.skipIf(!localDatabase)(
  "counts an invoice that cleared the provision and then waits as it stands, so a later invoice never takes it twice",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const a = await addInvoice(tx, ids, {
        acceptedOn: "2026-06-10",
        amountPaise: 5000_00,
        paidOn: "2026-06-05",
      });
      await run(tx, paymentSource(a.paymentId));
      await run(tx, invoiceSource(a.id));
      expect(await splitOf(tx, a.id)).toEqual([[5000_00, 0]]);
      // Raised above its payments: A waits with its posting kept.
      await tx
        .update(vendorPaymentLineItem)
        .set({ amountPaise: 6000_00 })
        .where(eq(vendorPaymentLineItem.id, a.lineId));
      expect(await run(tx, invoiceSource(a.id))).toMatchObject({
        reason: "invoice_exceeds_payments",
        status: "waiting",
      });
      expect(await splitOf(tx, a.id)).toEqual([[5000_00, 0]]);
      const b = await addInvoice(tx, ids, {
        acceptedOn: "2026-07-10",
        amountPaise: 5000_00,
        paidOn: "2026-07-01",
      });
      await run(tx, paymentSource(b.paymentId));
      await run(tx, invoiceSource(b.id));
      // B takes only what A's standing posting left.
      expect(await splitOf(tx, b.id)).toEqual([[2500_00, 2500_00]]);
      expect(await provisionOn(tx, YEAR_END)).toBe(0);
      await expectSound(tx, DAYS);
    });
  }
);

it.skipIf(!localDatabase)(
  "gives a voided duplicate's share to the invoice it crowded out, so the year end holds no double count",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const ids = await foundation(tx);
      const a = await addInvoice(tx, ids, {
        acceptedOn: "2026-07-10",
        amountPaise: PROVISION_PAISE,
        paidOn: "2026-07-05",
      });
      const b = await addInvoice(tx, ids, {
        acceptedOn: "2026-07-15",
        amountPaise: PROVISION_PAISE,
        paidOn: "2026-07-05",
      });
      for (const invoice of [a, b]) {
        await run(tx, paymentSource(invoice.paymentId));
        await run(tx, invoiceSource(invoice.id));
      }
      expect(await splitOf(tx, b.id)).toEqual([[0, PROVISION_PAISE]]);
      const voidedAt = at("2026-07-20");
      await tx
        .update(vendorPayment)
        .set({ voidedAt, voidedBy: ids.user, voidReason: "Duplicate" })
        .where(eq(vendorPayment.id, a.id));
      await tx
        .update(vendorPaymentTransaction)
        .set({ voidedAt, voidedBy: ids.user, voidReason: "Duplicate" })
        .where(eq(vendorPaymentTransaction.id, a.paymentId));
      await run(tx, invoiceSource(a.id));
      await run(tx, paymentSource(a.paymentId));
      await run(tx, invoiceSource(b.id));
      expect(await splitOf(tx, b.id)).toEqual([[PROVISION_PAISE, 0]]);
      expect(await provisionOn(tx, YEAR_END)).toBe(0);
      // Between B's day and A's void day the provision dips.
      expect(await provisionOn(tx, "2026-07-15")).toBe(-PROVISION_PAISE);
      await expectSound(
        tx,
        ["2026-07-09", "2026-07-15", "2026-07-20", YEAR_END],
        ["2026-07-15"]
      );
    });
  }
);
