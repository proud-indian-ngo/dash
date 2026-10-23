import { db } from "@pi-dash/db";
import {
  loadBalanceSheetLines,
  postAuditedFigures,
  reverseAuditedFigures,
} from "@pi-dash/db/ledger/audited-figures";
import type { LedgerTx } from "@pi-dash/db/ledger/engine";
import { vendorPaymentProvisionView } from "@pi-dash/db/ledger/expense-posting";
import { listIncomeSources } from "@pi-dash/db/ledger/income-posting";
import {
  postIncomeSourceNow,
  postPendingForYear,
} from "@pi-dash/db/ledger/income-runner";
import {
  postOpeningBalance,
  reverseOpeningBalance,
} from "@pi-dash/db/ledger/opening-balance";
import {
  closeYear,
  reopenYear,
  yearCloseChecklist,
} from "@pi-dash/db/ledger/year-close";
import { user } from "@pi-dash/db/schema/auth";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import {
  accountHead,
  fiscalYear,
  fund,
  orgAccount,
  programme,
  project,
} from "@pi-dash/db/schema/finance-dimensions";
import {
  gatewaySettlement,
  gatewaySettlementItem,
} from "@pi-dash/db/schema/gateway-settlement";
import { contribution } from "@pi-dash/db/schema/income";
import {
  auditedFigures,
  ledgerEntry,
  ledgerSourceState,
  openingBalance,
  posting,
} from "@pi-dash/db/schema/ledger";
import { party, partyRole } from "@pi-dash/db/schema/party";
import {
  reimbursement,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { statementLine } from "@pi-dash/db/schema/statement-line";
import {
  vendor,
  vendorPayment,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import { vendorPaymentTransaction } from "@pi-dash/db/schema/vendor-payment-transaction";
import { COST_CENTRE_IDS } from "@pi-dash/shared/constants";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lte,
  sql,
} from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Database steps for the books spec, run with Bun as a script because
 * Playwright's Node runner cannot load `@pi-dash/db`. Prints one JSON value.
 *
 * - `close-year <label>`: closes the year through the real close, as if
 *   run the day after it ended (a running year can't be closed in the UI).
 *   The year's records are posted first, as the Books close does; records
 *   other specs leave waiting in that year (a payout among several E2E
 *   bank accounts waits for its bank account) are then set aside in the
 *   close's transaction: these tests are about the
 *   close, and "won't close a year while one of its records waits" covers
 *   the waiting check.
 * - `income-fixture <run>`: a bank account and a Razorpay clearing account
 *   of this run, a Razorpay gift of 1,000 with a fee of 20 and GST of 3.60,
 *   its processed payout of 976.40 matched to a bank line the next day, a
 *   UPI gift of 500 into the bank (programme Education) and an unmatched
 *   debit of 300 to mark as a transfer to the fixed deposit.
 * - `gift <accountId> <day>`: one more UPI gift of 250 into that account.
 * - `postings <sourceId>`: the actions posted for a source, oldest first.
 * - `corpus-gift <run>`: a bank account of this run and a NEFT corpus gift
 *   of 700 into it, recorded against the Corpus Fund.
 * - `entries <sourceId>`: the standing recognition of a source, as
 *   "<head code> <fund code> <signed paise>", sorted.
 * - `ensure-opening <label>`: posts fake, balanced opening balances for the
 *   year when none stand (a year can't close without them), so each
 *   treasurer test runs on its own when CI shards split the group.
 * - `clear-opening <label>`: reverses the year's standing opening balances,
 *   if any, so the opening balances form starts empty.
 * - `waiting-payout <run>`: a processed payout with no clearing account,
 *   which waits to post ("no clearing account").
 * - `fix-payout <id>`: gives that payout a clearing account of its own.
 * - `close-year-strict <label>`: tries the real close as if the day after
 *   the year ended, without clearing anything, and reports the refusal.
 * - `reopen-year <label>`: reopens it if it is closed (test cleanup).
 * - `expense-fixture <run>`: expense posting (layer 3-3a). A bank account
 *   of this run marked as the main bank account (expenses are paid out of
 *   it), an expense category of this run, a reimbursement of 300 + 125
 *   charged to Education and approved on 20 Jun 2026 with its payment
 *   screenshot, one approved the same day without a screenshot (it waits),
 *   one approved on 20 Mar 2026 without a screenshot (before the cutover),
 *   and a vendor payment of 2,500 to a vendor of this run, paid on 10 Jul
 *   2026, with its invoice submitted and waiting for approval.
 * - `edit-claim <id>`: raises the reimbursement's first line to 350.
 * - `audited-fixture <label>`: the audited figures spec's starting point:
 *   reverses any standing audited figures of the year, and makes sure the
 *   standing opening balances name a fixed asset and an audit fee
 *   liability (reversing fake ones that don't and posting E2E ones that
 *   do: bank 1,000, "E2E sewing machine" 50, audit fees payable 100,
 *   General Fund 950).
 * - `post-audited <label>`: matches the year's audited figures through the
 *   real posting, as if the day after the year ended (a running year can't
 *   post in the UI): the books' figures, less 20 of depreciation on the
 *   E2E sewing machine and with the audit fee payable written back, the
 *   General Fund moving with them. The year's records are posted first
 *   and what other specs leave waiting is set aside, as for close-year.
 *   Reports the lines' audited figures.
 * - `reverse-audited <label>`: reverses the standing audited figures, if
 *   any, and posts what waited for the year meanwhile.
 * - `provision-fixture <run> <label>`: an auditor's invoice charged to the audit fee
 *   provision. Voids the auditor invoices of earlier runs (so the
 *   provision is whole again), makes sure the opening balances carry an
 *   audit fee liability (as `audited-fixture` does), then adds a bank
 *   account of this run marked main, an auditor of this run and a vendor
 *   payment of 150 paid on 15 Jul 2026 with its invoice waiting for
 *   approval. Reports what the approval picker should show as outstanding.
 * - `void-auditor-invoices`: voids every E2E auditor invoice and posts the
 *   reversals (cleanup: the provision stands whole for the next test).
 * - `budget-fixture <run>`: Finance → Budgets. A programme of this run
 *   with one project, an expense category of this run, and two approved
 *   reimbursements with payment proof in FY 2027-28, posted at once: 1,000
 *   charged to the programme and 600 to its project, out of whichever bank
 *   account is main (never changing it). FY 2027-28 because the books specs freeze and close
 *   FY 2026-27 while other specs run; nothing freezes the later year.
 * - `grant-fixture <run>`: Finance → Grants. The budget fixture's records,
 *   plus a grantor of this run and its NEFT gift of 2,000 on the project,
 *   received on 1 Oct 2026 into the main bank account. Reports the names
 *   and the gift's reference.
 * - `probe-guards`: tries to change and remove posted books rows, each in
 *   a rolled-back savepoint, and reports which statements the database
 *   refused. Proves the append-only guards exist in this database, whether
 *   it was migrated or pushed.
 */

async function yearByLabel(label: string) {
  const [year] = await db
    .select()
    .from(fiscalYear)
    .where(eq(fiscalYear.label, label))
    .limit(1);
  if (!year) {
    throw new Error(`No fiscal year ${label}`);
  }
  return year;
}

// The seeded volunteer, never the finance user a spec signs in as: finance
// can't approve or pay a request they raised or are paid by.
async function volunteerUserId() {
  const email = process.env.VOLUNTEER_EMAIL;
  if (!email) {
    throw new Error("VOLUNTEER_EMAIL is not set");
  }
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  if (!row) {
    throw new Error(`Test volunteer ${email} not found`);
  }
  return row.id;
}

const PROBES = {
  account_movement_update: sql`UPDATE "account_movement" SET "memo" = 'x'`,
  fiscal_year_event_delete: sql`DELETE FROM "fiscal_year_event"`,
  ledger_entry_delete: sql`DELETE FROM "ledger_entry"`,
  opening_balance_delete: sql`DELETE FROM "opening_balance"`,
  opening_balance_update: sql`UPDATE "opening_balance" SET "ca_name" = 'x'`,
  posting_truncate: sql`TRUNCATE "posting", "ledger_entry", "account_movement", "movement_allocation", "opening_balance"`,
  posting_update: sql`UPDATE "posting" SET "action" = 'x'`,
} as const;

async function probeGuards(): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  await db
    .transaction(async (tx) => {
      for (const [name, statement] of Object.entries(PROBES)) {
        await tx.execute(sql`SAVEPOINT probe`);
        try {
          const rows = await tx.execute(statement);
          results[name] =
            `allowed (${"count" in rows ? String(rows.count) : "?"} rows)`;
        } catch {
          results[name] = "refused";
        }
        await tx.execute(sql`ROLLBACK TO SAVEPOINT probe`);
      }
      // Nothing a probe did may stay.
      throw new Rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Rollback)) {
        throw error;
      }
    });
  return results;
}

class Rollback extends Error {}

/** "E2E Income Donor", seeded by seed-test-user. */
const INCOME_DONOR_ID = "01930000-0000-7000-8000-000000000721";
/** Must match GENERAL_FUND_ID and PROGRAMME_IDS.education in @pi-dash/shared/constants. */
const GENERAL_FUND_ID = "01930000-0000-7000-8000-000000000201";
const EDUCATION_ID = "01930000-0000-7000-8000-000000000001";

async function upiGift(
  accountId: string,
  receivedOn: string,
  amountPaise: number
) {
  const now = new Date();
  const id = uuidv7();
  await db.insert(contribution).values({
    amountPaise,
    channel: "upi",
    createdAt: now,
    fundId: GENERAL_FUND_ID,
    id,
    orgAccountId: accountId,
    partyId: INCOME_DONOR_ID,
    programmeId: EDUCATION_ID,
    receivedOn,
    reference: `E2EBOOKS${id.slice(-8)}`,
    reportingMode: "electronic_or_account_payee",
    status: "received",
    updatedAt: now,
  });
  return id;
}

export type IncomeFixture = Awaited<ReturnType<typeof incomeFixture>>;

async function incomeFixture(run: string) {
  const now = new Date();
  const bankId = uuidv7();
  const clearingId = uuidv7();
  const bankName = `E2E Books Bank ${run}`;
  const clearingName = `E2E Books Razorpay ${run}`;
  await db.insert(orgAccount).values([
    {
      createdAt: now,
      id: bankId,
      kind: "bank",
      name: bankName,
      updatedAt: now,
    },
    {
      createdAt: now,
      id: clearingId,
      kind: "gateway_clearing",
      name: clearingName,
      updatedAt: now,
    },
  ]);
  const razorpayGiftId = uuidv7();
  await db.insert(contribution).values({
    amountPaise: 100_000,
    channel: "razorpay",
    createdAt: now,
    fundId: GENERAL_FUND_ID,
    gatewayFeePaise: 2000,
    gatewayTaxPaise: 360,
    id: razorpayGiftId,
    orgAccountId: clearingId,
    partyId: INCOME_DONOR_ID,
    programmeId: EDUCATION_ID,
    receivedOn: "2026-06-10",
    reference: `pay_E2EBOOKS${run}`,
    reportingMode: "electronic_or_account_payee",
    status: "received",
    updatedAt: now,
  });
  const settlementId = uuidv7();
  await db.insert(gatewaySettlement).values({
    amountPaise: 97_640,
    createdAt: now,
    externalId: `setl_E2EBOOKS${run}`,
    feesPaise: 2000,
    grossPaise: 100_000,
    id: settlementId,
    itemCount: 1,
    orgAccountId: clearingId,
    paymentCount: 1,
    provider: "razorpay",
    providerAccount: "test",
    settledOn: "2026-06-11",
    status: "processed",
    taxPaise: 360,
    updatedAt: now,
    utr: `E2EBOOKSUTR${run}`,
  });
  await db.insert(gatewaySettlementItem).values({
    contributionId: razorpayGiftId,
    // The line's net, as Razorpay's recon reports it.
    creditPaise: 97_640,
    externalId: `pay_E2EBOOKS${run}`,
    feePaise: 2000,
    id: uuidv7(),
    settledAt: now,
    settlementId,
    taxPaise: 360,
    type: "payment",
  });
  const line = (over: Partial<typeof statementLine.$inferInsert>) => ({
    amountPaise: 0,
    createdAt: now,
    direction: "credit" as const,
    id: uuidv7(),
    lineHash: `e2e-books-${uuidv7()}`,
    narration: "",
    orgAccountId: bankId,
    position: 1,
    updatedAt: now,
    valueOn: "2026-06-12",
    ...over,
  });
  const transferLineId = uuidv7();
  await db.insert(statementLine).values([
    line({
      amountPaise: 97_640,
      matchedAt: now,
      matchedSettlementId: settlementId,
      matchKind: "settlement",
      matchReason: "utr",
      matchStatus: "matched",
      narration: `RAZORPAY E2EBOOKSUTR${run}`,
    }),
    line({
      amountPaise: 30_000,
      direction: "debit",
      id: transferLineId,
      narration: `TRANSFER TO FD E2E${run}`,
      position: 2,
      valueOn: "2026-07-01",
    }),
  ]);
  const upiGiftId = await upiGift(bankId, "2026-06-15", 50_000);
  return {
    bankId,
    bankName,
    clearingName,
    razorpayGiftId,
    settlementId,
    transferLineId,
    upiGiftId,
  };
}

async function waitingPayout(run: string) {
  const now = new Date();
  const id = uuidv7();
  await db.insert(gatewaySettlement).values({
    amountPaise: 12_300,
    createdAt: now,
    externalId: `setl_E2EWAIT${run}`,
    id,
    provider: "razorpay",
    providerAccount: "test",
    settledOn: "2026-07-02",
    status: "processed",
    updatedAt: now,
  });
  return { id };
}

async function fixPayout(id: string) {
  const now = new Date();
  const clearingId = uuidv7();
  await db.insert(orgAccount).values({
    createdAt: now,
    id: clearingId,
    kind: "gateway_clearing",
    name: `E2E Books fixed clearing ${clearingId}`,
    updatedAt: now,
  });
  await db
    .update(gatewaySettlement)
    .set({ orgAccountId: clearingId, updatedAt: now })
    .where(eq(gatewaySettlement.id, id));
  return { id };
}

/**
 * Posts every record of the year first (as the Books close does), so none
 * counts as not looked at, then sets aside what other specs left waiting
 * and closes, in one transaction.
 */
async function closeAfterPosting(
  year: { endsOn: string; id: string; startsOn: string },
  actorId: string,
  dayAfter: Date
) {
  const swept = await postPendingForYear(year.id, {
    actorId,
    deadline: Date.now() + 60_000,
    onFailure: (source, error) => {
      process.stderr.write(
        `close-year: ${source.sourceType} ${source.sourceId} failed: ${String(error)}\n`
      );
    },
  });
  process.stderr.write(`close-year posting: ${JSON.stringify(swept)}\n`);
  return await db.transaction(async (tx) => {
    // Set aside (not deleted: a source with no state row counts as not
    // looked at, which blocks the close too).
    await tx
      .update(ledgerSourceState)
      .set({ reason: null, status: "none" })
      .where(
        and(
          eq(ledgerSourceState.status, "waiting"),
          gte(ledgerSourceState.economicOn, year.startsOn),
          lte(ledgerSourceState.economicOn, year.endsOn)
        )
      );
    // Open bank lines other specs leave in the year are moved out of it for
    // the close, in one statement just before it, and put back by ID before
    // commit, so specs running alongside never see them change. The
    // ledger's DB tests cover that check.
    const outside = new Date(`${year.startsOn}T00:00:00Z`);
    outside.setUTCDate(outside.getUTCDate() - 1);
    const moved = (await tx.execute(sql`
      update ${statementLine} l
      set value_on = ${outside.toISOString().slice(0, 10)}::date
      from (
        select id, value_on from ${statementLine}
        where match_status = 'unmatched'
          and value_on between ${year.startsOn}::date and ${year.endsOn}::date
        for update
      ) old
      where l.id = old.id
      returning old.id, old.value_on::text as "valueOn"`)) as unknown as {
      id: string;
      valueOn: string;
    }[];
    const checklist = await yearCloseChecklist(tx, year.id, dayAfter);
    // Shown when the close refuses, to say which check held it up.
    process.stderr.write(
      `close-year checklist: ${JSON.stringify(checklist.checks)}\n`
    );
    const closed = await closeYear(tx, year.id, { actorId, now: dayAfter });
    const idsByDay = new Map<string, string[]>();
    for (const line of moved) {
      idsByDay.set(line.valueOn, [
        ...(idsByDay.get(line.valueOn) ?? []),
        line.id,
      ]);
    }
    for (const [valueOn, ids] of idsByDay) {
      await tx
        .update(statementLine)
        .set({ valueOn })
        .where(inArray(statementLine.id, ids));
    }
    return closed;
  });
}

export type ExpenseFixture = Awaited<ReturnType<typeof expenseFixture>>;

async function expenseFixture(run: string) {
  const now = new Date();
  const userId = await volunteerUserId();
  const bankId = uuidv7();
  const bankName = `E2E Expense Bank ${run}`;
  const categoryId = uuidv7();
  const categoryName = `E2E Books Category ${run}`;
  await db.transaction(async (tx) => {
    // Expenses are paid out of the main bank account; this run's is it.
    await tx
      .update(orgAccount)
      .set({ isMain: false, updatedAt: now })
      .where(eq(orgAccount.isMain, true));
    await tx.insert(orgAccount).values({
      createdAt: now,
      id: bankId,
      isMain: true,
      kind: "bank",
      name: bankName,
      updatedAt: now,
    });
  });
  await db.insert(expenseCategory).values({
    createdAt: now,
    id: categoryId,
    name: categoryName,
    updatedAt: now,
  });
  const approvedAt = new Date("2026-06-20T05:00:00Z");
  const claim = async (
    title: string,
    withProof: boolean,
    reviewedAt: Date = approvedAt
  ) => {
    const id = uuidv7();
    await db.insert(reimbursement).values({
      approvalScreenshotKey: withProof
        ? `attachments/approval-screenshots/reimbursements/${id}/approval-screenshots/e2e-proof.png`
        : null,
      chargedProgrammeId: EDUCATION_ID,
      chargedTo: "programme",
      createdAt: now,
      expenseDate: "2026-06-18",
      id,
      reviewedAt,
      reviewedBy: userId,
      status: "approved",
      title,
      updatedAt: now,
      userId,
    });
    await db.insert(reimbursementLineItem).values(
      [30_000, 12_500].map((amountPaise, index) => ({
        amountPaise,
        categoryId,
        createdAt: now,
        description: `${title} line ${index + 1}`,
        id: uuidv7(),
        reimbursementId: id,
        sortOrder: index,
        updatedAt: now,
      }))
    );
    return id;
  };
  const claimTitle = `E2E books claim ${run}`;
  const claimId = await claim(claimTitle, true);
  const noProofId = await claim(`E2E books claim without proof ${run}`, false);
  // Approved before the cutover: history, never on the missing-proof list.
  const earlyNoProofTitle = `E2E books early claim without proof ${run}`;
  const earlyNoProofId = await claim(
    earlyNoProofTitle,
    false,
    new Date("2026-03-20T05:00:00Z")
  );

  const vendorId = uuidv7();
  await db.insert(party).values({
    createdAt: now,
    displayName: `E2E Books Vendor ${run}`,
    id: vendorId,
    kind: "organisation",
    updatedAt: now,
  });
  await db.insert(vendor).values({
    createdAt: now,
    id: vendorId,
    name: `E2E Books Vendor ${run}`,
    status: "approved",
    updatedAt: now,
  });
  const vendorPaymentId = uuidv7();
  const vendorPaymentTitle = `E2E books vendor payment ${run}`;
  await db.insert(vendorPayment).values({
    costCentreId: COST_CENTRE_IDS.bangalore,
    chargedTo: "organisation",
    createdAt: now,
    id: vendorPaymentId,
    invoiceDate: "2026-07-12",
    invoiceNumber: `INV-E2E-${run}`,
    reviewedAt: now,
    reviewedBy: userId,
    status: "invoice_pending",
    title: vendorPaymentTitle,
    updatedAt: now,
    userId,
    vendorId,
  });
  await db.insert(vendorPaymentLineItem).values({
    amountPaise: 250_000,
    categoryId,
    createdAt: now,
    id: uuidv7(),
    sortOrder: 0,
    updatedAt: now,
    vendorPaymentId,
  });
  const paymentId = uuidv7();
  await db.insert(vendorPaymentTransaction).values({
    amountPaise: 250_000,
    createdAt: now,
    id: paymentId,
    paymentMethod: "bank_transfer",
    paymentReference: `E2EUTR${run}`,
    reviewedAt: now,
    reviewedBy: userId,
    status: "approved",
    transactionDate: new Date("2026-07-10T05:00:00Z"),
    updatedAt: now,
    userId,
    vendorPaymentId,
  });
  return {
    bankName,
    categoryName,
    claimId,
    claimTitle,
    earlyNoProofId,
    earlyNoProofTitle,
    noProofId,
    paymentId,
    vendorPaymentId,
    vendorPaymentTitle,
  };
}

async function editClaim(id: string) {
  const [line] = await db
    .select({ id: reimbursementLineItem.id })
    .from(reimbursementLineItem)
    .where(eq(reimbursementLineItem.reimbursementId, id))
    .orderBy(asc(reimbursementLineItem.sortOrder))
    .limit(1);
  if (!line) {
    throw new Error(`Reimbursement ${id} has no lines`);
  }
  const now = new Date();
  await db
    .update(reimbursementLineItem)
    .set({ amountPaise: 35_000, updatedAt: now })
    .where(eq(reimbursementLineItem.id, line.id));
  await db
    .update(reimbursement)
    .set({ updatedAt: now })
    .where(eq(reimbursement.id, id));
  return { id };
}

const AUDITOR_TITLE = "E2E auditor invoice";

/** Voids the auditor invoices of every run, and posts their reversals. */
async function voidAuditorInvoices() {
  const userId = await volunteerUserId();
  const now = new Date();
  const open = await db
    .select({ id: vendorPayment.id })
    .from(vendorPayment)
    .where(
      and(
        like(vendorPayment.title, `${AUDITOR_TITLE}%`),
        isNull(vendorPayment.voidedAt)
      )
    );
  for (const { id } of open) {
    await db.transaction(async (tx) => {
      const values = {
        updatedAt: now,
        voidedAt: now,
        voidedBy: userId,
        voidReason: "E2E rerun starts clean",
      };
      await tx
        .update(vendorPayment)
        .set(values)
        .where(eq(vendorPayment.id, id));
      await tx
        .update(vendorPaymentTransaction)
        .set(values)
        .where(eq(vendorPaymentTransaction.vendorPaymentId, id));
    });
    // The request, then (as its related sources) its payments.
    await postIncomeSourceNow({ sourceId: id, sourceType: "vendor_payment" });
  }
  return { voided: open.length };
}

async function budgetFixture(run: string) {
  const now = new Date();
  const userId = await volunteerUserId();
  const programmeId = uuidv7();
  const projectId = uuidv7();
  const categoryId = uuidv7();
  const names = {
    category: `E2E Budget Category ${run}`,
    programme: `E2E Budget Programme ${run}`,
    project: `E2E Budget Project ${run}`,
  };
  const code = run
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-10)
    .toUpperCase();
  await db.transaction(async (tx) => {
    // The claims are paid out of the main bank account. Other specs set
    // their own as main while they post, so this one never changes it: it
    // only adds one when none exists.
    const [main] = await tx
      .select({ id: orgAccount.id })
      .from(orgAccount)
      .where(eq(orgAccount.isMain, true))
      .limit(1);
    if (!main) {
      await tx
        .insert(orgAccount)
        .values({
          createdAt: now,
          id: uuidv7(),
          isMain: true,
          kind: "bank",
          name: `E2E Budget Bank ${run}`,
          updatedAt: now,
        })
        .onConflictDoNothing();
    }
    await tx.insert(programme).values({
      code: `B${code}`,
      createdAt: now,
      id: programmeId,
      name: names.programme,
      updatedAt: now,
    });
    await tx.insert(project).values({
      code: `BP${code}`,
      createdAt: now,
      id: projectId,
      name: names.project,
      programmeId,
      updatedAt: now,
    });
    await tx.insert(expenseCategory).values({
      createdAt: now,
      id: categoryId,
      name: names.category,
      updatedAt: now,
    });
  });
  const claim = async (
    amountPaise: number,
    chargedProjectId: string | null
  ) => {
    const id = uuidv7();
    await db.insert(reimbursement).values({
      approvalScreenshotKey: `attachments/approval-screenshots/reimbursements/${id}/approval-screenshots/e2e-proof.png`,
      chargedProgrammeId: programmeId,
      chargedProjectId,
      chargedTo: "programme",
      costCentreId: COST_CENTRE_IDS.bangalore,
      createdAt: now,
      expenseDate: "2027-05-08",
      id,
      reviewedAt: new Date("2027-05-10T05:00:00Z"),
      reviewedBy: userId,
      status: "approved",
      title: `E2E budget claim ${run}`,
      updatedAt: now,
      userId,
    });
    await db.insert(reimbursementLineItem).values({
      amountPaise,
      categoryId,
      createdAt: now,
      description: `E2E budget claim ${run}`,
      id: uuidv7(),
      reimbursementId: id,
      sortOrder: 0,
      updatedAt: now,
    });
    await postIncomeSourceNow({ sourceId: id, sourceType: "reimbursement" });
    const [entry] = await db
      .select({ id: ledgerEntry.id })
      .from(ledgerEntry)
      .innerJoin(posting, eq(posting.id, ledgerEntry.postingId))
      .where(eq(posting.sourceId, id))
      .limit(1);
    if (!entry) {
      throw new Error("The budget fixture's claim did not post");
    }
  };
  await claim(100_000, null);
  await claim(60_000, projectId);
  return names;
}

async function grantFixture(run: string) {
  const names = await budgetFixture(run);
  const [grantProject] = await db
    .select({ id: project.id, programmeId: project.programmeId })
    .from(project)
    .where(eq(project.name, names.project))
    .limit(1);
  const [main] = await db
    .select({ id: orgAccount.id })
    .from(orgAccount)
    .where(eq(orgAccount.isMain, true))
    .limit(1);
  if (!(grantProject && main)) {
    throw new Error("The grant fixture's project or bank account is missing");
  }
  const now = new Date();
  const partyId = uuidv7();
  const grantor = `E2E Grantor ${run}`;
  const reference = `E2EGRANT${run.replace(/[^A-Za-z0-9]/g, "").slice(-10)}`;
  await db.transaction(async (tx) => {
    await tx.insert(party).values({
      createdAt: now,
      displayName: grantor,
      id: partyId,
      kind: "organisation",
      updatedAt: now,
    });
    await tx.insert(partyRole).values({
      active: true,
      id: uuidv7(),
      partyId,
      role: "grantor",
      since: now,
    });
    await tx.insert(contribution).values({
      amountPaise: 200_000,
      channel: "neft",
      createdAt: now,
      donationType: "csr",
      fundId: GENERAL_FUND_ID,
      id: uuidv7(),
      orgAccountId: main.id,
      partyId,
      programmeId: grantProject.programmeId,
      projectId: grantProject.id,
      receivedOn: "2026-10-01",
      reference,
      reportingMode: "electronic_or_account_payee",
      status: "received",
      updatedAt: now,
    });
  });
  return { ...names, grantor, reference };
}

async function provisionFixture(run: string, yearLabel: string) {
  await voidAuditorInvoices();
  await auditedFixture(yearLabel);
  const now = new Date();
  const userId = await volunteerUserId();
  const bankId = uuidv7();
  await db.transaction(async (tx) => {
    // Paid out of the main bank account; this run's is it.
    await tx
      .update(orgAccount)
      .set({ isMain: false, updatedAt: now })
      .where(eq(orgAccount.isMain, true));
    await tx.insert(orgAccount).values({
      createdAt: now,
      id: bankId,
      isMain: true,
      kind: "bank",
      name: `E2E Audit Bank ${run}`,
      updatedAt: now,
    });
  });
  const categoryId = uuidv7();
  await db.insert(expenseCategory).values({
    createdAt: now,
    id: categoryId,
    name: `E2E Audit Category ${run}`,
    updatedAt: now,
  });
  const vendorId = uuidv7();
  await db.insert(party).values({
    createdAt: now,
    displayName: `E2E Auditors ${run}`,
    id: vendorId,
    kind: "organisation",
    updatedAt: now,
  });
  await db.insert(vendor).values({
    createdAt: now,
    id: vendorId,
    name: `E2E Auditors ${run}`,
    status: "approved",
    updatedAt: now,
  });
  const vendorPaymentId = uuidv7();
  const amountPaise = 15_000;
  await db.insert(vendorPayment).values({
    costCentreId: COST_CENTRE_IDS.bangalore,
    chargedTo: "organisation",
    createdAt: now,
    id: vendorPaymentId,
    invoiceDate: "2026-07-16",
    invoiceNumber: `AUD-E2E-${run}`,
    reviewedAt: now,
    reviewedBy: userId,
    status: "invoice_pending",
    title: `${AUDITOR_TITLE} ${run}`,
    updatedAt: now,
    userId,
    vendorId,
  });
  await db.insert(vendorPaymentLineItem).values({
    amountPaise,
    categoryId,
    createdAt: now,
    description: "Statutory audit fee",
    id: uuidv7(),
    sortOrder: 0,
    updatedAt: now,
    vendorPaymentId,
  });
  await db.insert(vendorPaymentTransaction).values({
    amountPaise,
    createdAt: now,
    id: uuidv7(),
    paymentMethod: "bank_transfer",
    paymentReference: `E2EAUDIT${run}`,
    reviewedAt: now,
    reviewedBy: userId,
    status: "approved",
    transactionDate: new Date("2026-07-15T05:00:00Z"),
    updatedAt: now,
    userId,
    vendorPaymentId,
  });
  const view = await db.transaction((tx) =>
    vendorPaymentProvisionView(
      tx as unknown as LedgerTx,
      vendorPaymentId,
      // Today in India.
      new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
    )
  );
  const [provision] = view.outstanding;
  return {
    amountPaise,
    outstandingPaise: provision?.paise ?? 0,
    vendorPaymentId,
    years: provision?.years ?? [],
  };
}

/** "E2E Bank Account", seeded by seed-test-user. */
const E2E_BANK_ID = "01930000-0000-7000-8000-000000000711";

async function ensureOpening(label: string) {
  const year = await yearByLabel(label);
  const [standing] = await db
    .select({ id: openingBalance.id })
    .from(openingBalance)
    .where(
      and(
        eq(openingBalance.fiscalYearId, year.id),
        isNull(openingBalance.reversalPostingId)
      )
    )
    .limit(1);
  if (standing) {
    return { id: standing.id, posted: false };
  }
  const actorId = await volunteerUserId();
  const id = uuidv7();
  await db.transaction((tx) =>
    postOpeningBalance(
      tx,
      {
        caConfirmedOn: year.startsOn,
        caName: "E2E Test CA",
        fiscalYearId: year.id,
        id,
        lines: [
          { amountPaise: 100_000, kind: "account", orgAccountId: E2E_BANK_ID },
          { amountPaise: 100_000, fundId: GENERAL_FUND_ID, kind: "fund" },
        ],
      },
      { actorId }
    )
  );
  return { id, posted: true };
}

async function clearOpening(label: string) {
  const year = await yearByLabel(label);
  const [standing] = await db
    .select({ id: openingBalance.id })
    .from(openingBalance)
    .where(
      and(
        eq(openingBalance.fiscalYearId, year.id),
        isNull(openingBalance.reversalPostingId)
      )
    )
    .limit(1);
  if (!standing) {
    return { reversed: false };
  }
  const actorId = await volunteerUserId();
  await db.transaction((tx) =>
    reverseOpeningBalance(
      tx,
      { id: standing.id, reason: "E2E rerun starts clean" },
      { actorId }
    )
  );
  return { id: standing.id, reversed: true };
}

const E2E_ASSET = "E2E sewing machine";
/** Must match LEDGER_ACCOUNT_HEAD_IDS in @pi-dash/shared/constants. */
const FIXED_ASSETS_HEAD_ID = "01930000-0000-7000-8000-000000000801";
const AUDIT_FEES_PAYABLE_HEAD_ID = "01930000-0000-7000-8000-000000000802";

async function reverseAudited(label: string) {
  const year = await yearByLabel(label);
  const [standing] = await db
    .select({ id: auditedFigures.id })
    .from(auditedFigures)
    .where(
      and(
        eq(auditedFigures.fiscalYearId, year.id),
        isNull(auditedFigures.reversedAt)
      )
    )
    .limit(1);
  if (!standing) {
    return { reversed: false };
  }
  const actorId = await volunteerUserId();
  await db.transaction((tx) =>
    reverseAuditedFigures(
      tx,
      { id: standing.id, reason: "E2E rerun starts clean" },
      { actorId }
    )
  );
  // What other specs recorded meanwhile waited for the match: post it now.
  await postPendingForYear(year.id, { actorId, deadline: Date.now() + 60_000 });
  return { id: standing.id, reversed: true };
}

async function auditedFixture(label: string) {
  await reverseAudited(label);
  const year = await yearByLabel(label);
  const lines = await db.transaction((tx) =>
    loadBalanceSheetLines(tx, year.endsOn)
  );
  const hasAsset = lines.lines.some(
    (l) =>
      l.accountHeadId === FIXED_ASSETS_HEAD_ID &&
      l.memo === E2E_ASSET &&
      l.booksPaise > 0
  );
  const hasLiability = lines.lines.some(
    (l) => l.accountHeadId === AUDIT_FEES_PAYABLE_HEAD_ID && l.booksPaise > 0
  );
  if (hasAsset && hasLiability) {
    return { posted: false };
  }
  const actorId = await volunteerUserId();
  const [standing] = await db
    .select({ id: openingBalance.id })
    .from(openingBalance)
    .where(
      and(
        eq(openingBalance.fiscalYearId, year.id),
        isNull(openingBalance.reversalPostingId)
      )
    )
    .limit(1);
  await db.transaction(async (tx) => {
    if (standing) {
      await reverseOpeningBalance(
        tx,
        { id: standing.id, reason: "E2E audited figures need an asset" },
        { actorId }
      );
    }
    await postOpeningBalance(
      tx,
      {
        caConfirmedOn: year.startsOn,
        caName: "E2E Test CA",
        fiscalYearId: year.id,
        id: uuidv7(),
        lines: [
          { amountPaise: 100_000, kind: "account", orgAccountId: E2E_BANK_ID },
          { amountPaise: 5000, kind: "asset", memo: E2E_ASSET },
          {
            amountPaise: 10_000,
            kind: "liability",
            memo: "E2E audit fees payable",
          },
          { amountPaise: 95_000, fundId: GENERAL_FUND_ID, kind: "fund" },
        ],
      },
      { actorId }
    );
  });
  return { posted: true };
}

async function postAudited(label: string) {
  const year = await yearByLabel(label);
  const dayAfter = new Date(`${year.endsOn}T00:00:00Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 2);
  const signedOn = new Date(`${year.endsOn}T00:00:00Z`);
  signedOn.setUTCDate(signedOn.getUTCDate() + 1);
  const actorId = await volunteerUserId();
  // As the close step does: post the year's records, then set aside what
  // other specs leave waiting (a match refuses while anything waits).
  await postPendingForYear(year.id, {
    actorId,
    deadline: Date.now() + 60_000,
  });
  return await db.transaction(async (tx) => {
    await tx
      .update(ledgerSourceState)
      .set({ reason: null, status: "none" })
      .where(
        and(
          eq(ledgerSourceState.status, "waiting"),
          gte(ledgerSourceState.economicOn, year.startsOn),
          lte(ledgerSourceState.economicOn, year.endsOn)
        )
      );
    // Records other specs created since the posting above, which no run
    // has looked at yet, are set aside the same way.
    const sources = await listIncomeSources(tx, {
      range: { endsOn: year.endsOn, startsOn: year.startsOn },
    });
    if (sources.length > 0) {
      await tx
        .insert(ledgerSourceState)
        .values(
          sources.map((source) => ({
            ...source,
            checkedAt: new Date(),
            id: uuidv7(),
            status: "none" as const,
          }))
        )
        .onConflictDoNothing();
    }
    const { lines } = await loadBalanceSheetLines(tx, year.endsOn);
    const asset = lines.find(
      (l) => l.accountHeadId === FIXED_ASSETS_HEAD_ID && l.memo === E2E_ASSET
    );
    const liability = lines.find(
      (l) => l.accountHeadId === AUDIT_FEES_PAYABLE_HEAD_ID
    );
    if (!(asset && liability)) {
      throw new Error("Run audited-fixture first");
    }
    const audited = new Map(lines.map((l) => [l.key, l.booksPaise]));
    audited.set(asset.key, asset.booksPaise - 2000);
    audited.set(liability.key, 0);
    const general = `fund:${GENERAL_FUND_ID}`;
    audited.set(
      general,
      (audited.get(general) ?? 0) - 2000 + liability.booksPaise
    );
    const document = await postAuditedFigures(
      tx,
      {
        caName: "E2E Test CA",
        fiscalYearId: year.id,
        id: uuidv7(),
        lines: lines.map((l) => ({
          auditedPaise: audited.get(l.key) ?? 0,
          booksPaise: l.booksPaise,
          key: l.key,
        })),
        signedOn: signedOn.toISOString().slice(0, 10),
      },
      { actorId, now: dayAfter }
    );
    return {
      assetAuditedPaise: audited.get(asset.key),
      id: document.id,
      liabilityBooksPaise: liability.booksPaise,
    };
  });
}

/** Must match CORPUS_FUND_ID in @pi-dash/shared/constants. */
const CORPUS_FUND_ID = "01930000-0000-7000-8000-000000000202";

export type CorpusGift = Awaited<ReturnType<typeof corpusGift>>;

async function corpusGift(run: string) {
  const now = new Date();
  const bankId = uuidv7();
  const bankName = `E2E Books Corpus Bank ${run}`;
  await db.insert(orgAccount).values({
    createdAt: now,
    id: bankId,
    kind: "bank",
    name: bankName,
    updatedAt: now,
  });
  const id = uuidv7();
  await db.insert(contribution).values({
    amountPaise: 70_000,
    channel: "neft",
    createdAt: now,
    donationType: "corpus",
    fundId: CORPUS_FUND_ID,
    id,
    orgAccountId: bankId,
    partyId: INCOME_DONOR_ID,
    receivedOn: "2026-06-20",
    reference: `E2ECORPUS${run}`,
    reportingMode: "electronic_or_account_payee",
    status: "received",
    updatedAt: now,
  });
  return { bankId, bankName, id };
}

/** A source's recognition net of reversals, by head and fund code. */
async function entriesOf(sourceId: string) {
  const rows = await db
    .select({
      amountPaise: ledgerEntry.amountPaise,
      effect: ledgerEntry.effect,
      fund: fund.code,
      head: accountHead.code,
    })
    .from(ledgerEntry)
    .innerJoin(posting, eq(posting.id, ledgerEntry.postingId))
    .innerJoin(accountHead, eq(accountHead.id, ledgerEntry.accountHeadId))
    .innerJoin(fund, eq(fund.id, ledgerEntry.fundId))
    .where(eq(posting.sourceId, sourceId));
  const net = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.head} ${row.fund}`;
    net.set(
      key,
      (net.get(key) ?? 0) +
        (row.effect === "increase" ? row.amountPaise : -row.amountPaise)
    );
  }
  return [...net]
    .filter(([, paise]) => paise !== 0)
    .map(([key, paise]) => `${key} ${paise}`)
    .sort();
}

async function postingsOf(sourceId: string) {
  const rows = await db
    .select({ action: posting.action })
    .from(posting)
    .where(eq(posting.sourceId, sourceId))
    .orderBy(asc(posting.createdAt), asc(posting.id));
  return rows.map((r) => r.action);
}

const [action, label = "2026-27"] = process.argv.slice(2);
let result: unknown;
if (action === "close-year") {
  const year = await yearByLabel(label);
  const dayAfter = new Date(`${year.endsOn}T00:00:00Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 2);
  const actorId = await volunteerUserId();
  // Other specs keep recording gifts while this runs, so a record can
  // arrive between the posting and the close: try a few times.
  for (let attempt = 1; ; attempt += 1) {
    try {
      result = await closeAfterPosting(year, actorId, dayAfter);
      break;
    } catch (error) {
      if (attempt >= 3) {
        throw error;
      }
    }
  }
} else if (action === "reopen-year") {
  const year = await yearByLabel(label);
  result = year.closedAt
    ? await db.transaction(async (tx) =>
        reopenYear(
          tx,
          { fiscalYearId: year.id, reason: "E2E cleanup" },
          { actorId: await volunteerUserId() }
        )
      )
    : { label, reopened: false };
} else if (action === "audited-fixture") {
  result = await auditedFixture(label);
} else if (action === "post-audited") {
  result = await postAudited(label);
} else if (action === "reverse-audited") {
  result = await reverseAudited(label);
} else if (action === "probe-guards") {
  result = await probeGuards();
} else if (action === "close-year-strict") {
  const year = await yearByLabel(label);
  const dayAfter = new Date(`${year.endsOn}T00:00:00Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 2);
  const actorId = await volunteerUserId();
  try {
    await db.transaction((tx) =>
      closeYear(tx, year.id, { actorId, now: dayAfter })
    );
    result = { closed: true };
  } catch (error) {
    result = {
      refused: error instanceof Error ? error.message : String(error),
    };
  }
} else if (action === "ensure-opening") {
  result = await ensureOpening(label);
} else if (action === "clear-opening") {
  result = await clearOpening(label);
} else if (action === "waiting-payout") {
  result = await waitingPayout(label);
} else if (action === "fix-payout") {
  result = await fixPayout(label);
} else if (action === "income-fixture") {
  result = await incomeFixture(label);
} else if (action === "gift") {
  const [, accountId, day] = process.argv.slice(2);
  result = { id: await upiGift(accountId ?? "", day ?? "2026-05-01", 25_000) };
} else if (action === "budget-fixture") {
  result = await budgetFixture(label);
} else if (action === "grant-fixture") {
  result = await grantFixture(label);
} else if (action === "expense-fixture") {
  result = await expenseFixture(label);
} else if (action === "edit-claim") {
  result = await editClaim(label);
} else if (action === "postings") {
  result = await postingsOf(label);
} else if (action === "provision-fixture") {
  result = await provisionFixture(label, process.argv[4] ?? "2026-27");
} else if (action === "void-auditor-invoices") {
  result = await voidAuditorInvoices();
} else if (action === "corpus-gift") {
  result = await corpusGift(label);
} else if (action === "entries") {
  result = await entriesOf(label);
} else {
  throw new Error(`Unknown action ${action}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
