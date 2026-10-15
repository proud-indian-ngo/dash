import { todayInKolkata } from "@pi-dash/shared/income";
import {
  type ExpenseSourceType,
  LEDGER_CUTOVER_ON,
  LEDGER_SOURCE_TYPES,
} from "@pi-dash/shared/ledger";
import { and, asc, eq, isNull, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { user } from "../schema/auth";
import { expenseCategory } from "../schema/expense-category";
import { orgAccount } from "../schema/finance-dimensions";
import { accountMovement, posting } from "../schema/ledger";
import { reimbursement, reimbursementLineItem } from "../schema/reimbursement";
import { statementAllocation, statementLine } from "../schema/statement-line";
import { teamEvent } from "../schema/team-event";
import { vendorPayment, vendorPaymentLineItem } from "../schema/vendor";
import { vendorPaymentTransaction } from "../schema/vendor-payment-transaction";
import type { LedgerTx } from "./engine";
import { ensureExpenseCategoryHeads } from "./expense-heads";
import {
  type BankMatchFacts,
  type ExpenseChargeFacts,
  type ExpenseLineFacts,
  type PayingAccountFacts,
  type ReimbursementFacts,
  reimbursementPlan,
  type StatementChargeFacts,
  statementChargePlan,
  type VendorPaymentFacts,
  vendorPaymentPlan,
  type VendorPaymentTransactionFacts,
  vendorPaymentTransactionPlan,
} from "./expense-rules";
import type { SourcePlan } from "./income-rules";
import { LedgerError } from "./rules";

/**
 * Expense posting (finance Phase 3, layer 3-3a), server only: loads the
 * facts of a reimbursement, a vendor payment request or one of its
 * payments for the rules in `expense-rules.ts`, and supplies what the
 * shared posting run (`income-posting.ts`, which compares, reverses and
 * reposts any source) needs to sweep them: their watermarks, which ones to
 * look at, and which sources follow them.
 */

export interface ExpenseSource {
  sourceId: string;
  sourceType: ExpenseSourceType;
}

const T = LEDGER_SOURCE_TYPES;

/** A timestamp column's day in India (timestamps are stored in UTC). */
const indiaDay = (column: SQL) =>
  sql`((${column} at time zone 'UTC') at time zone 'Asia/Kolkata')::date`;

const dayOf = (at: Date | null): string | null =>
  at ? todayInKolkata(at) : null;

// ── Facts ───────────────────────────────────────────────────────────────────

/** The active bank accounts, and the account the source's standing payment left from. */
async function payingAccountFacts(
  tx: LedgerTx,
  source: ExpenseSource
): Promise<PayingAccountFacts> {
  const banks = await tx
    .select({ id: orgAccount.id, isMain: orgAccount.isMain })
    .from(orgAccount)
    .where(and(eq(orgAccount.kind, "bank"), eq(orgAccount.active, true)))
    .orderBy(asc(orgAccount.id));
  const reversal = alias(posting, "reversal");
  const [posted] = await tx
    .select({ orgAccountId: accountMovement.orgAccountId })
    .from(accountMovement)
    .innerJoin(posting, eq(posting.id, accountMovement.postingId))
    .leftJoin(reversal, eq(reversal.reversesPostingId, posting.id))
    .where(
      and(
        eq(posting.sourceType, source.sourceType),
        eq(posting.sourceId, source.sourceId),
        isNull(posting.reversesPostingId),
        isNull(reversal.id),
        eq(accountMovement.kind, "payout"),
        eq(accountMovement.direction, "out"),
        // Not a payment a matched bank debit placed (layer 3-3b): that
        // follows the match, so unmatching restores the default account.
        isNull(accountMovement.bankValueOn)
      )
    )
    .limit(1);
  return {
    activeBankAccountIds: banks.map((b) => b.id),
    mainAccountId: banks.find((b) => b.isMain)?.id ?? null,
    postedAccountId: posted?.orgAccountId ?? null,
  };
}

/** The bank debits matched to a claim or vendor payment (live allocations). */
async function bankMatchFacts(
  tx: LedgerTx,
  target: { reimbursementId: string } | { vendorPaymentTransactionId: string }
): Promise<BankMatchFacts[]> {
  const rows = await tx
    .select({
      amountPaise: statementAllocation.amountPaise,
      orgAccountId: statementLine.orgAccountId,
      statementLineId: statementLine.id,
      valueOn: statementLine.valueOn,
    })
    .from(statementAllocation)
    .innerJoin(
      statementLine,
      eq(statementLine.id, statementAllocation.statementLineId)
    )
    .where(
      and(
        "reimbursementId" in target
          ? eq(statementAllocation.reimbursementId, target.reimbursementId)
          : eq(
              statementAllocation.vendorPaymentTransactionId,
              target.vendorPaymentTransactionId
            ),
        isNull(statementAllocation.releasedAt)
      )
    )
    .orderBy(asc(statementLine.valueOn), asc(statementLine.id));
  return rows;
}

async function chargeFacts(
  tx: LedgerTx,
  request: {
    chargedProgrammeId: string | null;
    chargedProjectId: string | null;
    chargedTo: ExpenseChargeFacts["chargedTo"];
    eventId: string | null;
  }
): Promise<ExpenseChargeFacts> {
  const [event] =
    request.chargedTo === "event" && request.eventId
      ? await tx
          .select({ programmeId: teamEvent.programmeId })
          .from(teamEvent)
          .where(eq(teamEvent.id, request.eventId))
          .limit(1)
      : [];
  return {
    chargedProgrammeId: request.chargedProgrammeId,
    chargedProjectId: request.chargedProjectId,
    chargedTo: request.chargedTo,
    eventId: request.eventId,
    eventProgrammeId: event?.programmeId ?? null,
  };
}

/**
 * A request's lines with their category's head. Categories without a head
 * get one first (a category added since the server started).
 */
async function lineFacts(
  tx: LedgerTx,
  lines: {
    amountPaise: number;
    categoryId: string;
    description: string | null;
    id: string;
  }[]
): Promise<ExpenseLineFacts[]> {
  await ensureExpenseCategoryHeads(tx, [
    ...new Set(lines.map((l) => l.categoryId)),
  ]);
  const heads = new Map<string, string | null>();
  for (const categoryId of new Set(lines.map((l) => l.categoryId))) {
    const [row] = await tx
      .select({ accountHeadId: expenseCategory.accountHeadId })
      .from(expenseCategory)
      .where(eq(expenseCategory.id, categoryId))
      .limit(1);
    heads.set(categoryId, row?.accountHeadId ?? null);
  }
  return lines.map((l) => ({
    accountHeadId: heads.get(l.categoryId) ?? null,
    amountPaise: l.amountPaise,
    description: l.description,
    id: l.id,
  }));
}

/** A login's display name, or null when it has none. */
async function userNameOf(tx: LedgerTx, userId: string) {
  const [row] = await tx
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.name.trim() || null;
}

async function reimbursementFacts(
  tx: LedgerTx,
  id: string
): Promise<ReimbursementFacts | null> {
  const [row] = await tx
    .select()
    .from(reimbursement)
    .where(eq(reimbursement.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  const approvedOn = dayOf(row.reviewedAt);
  // Only an approved one from the cutover needs its lines and accounts.
  if (
    row.status !== "approved" ||
    (approvedOn !== null && approvedOn < LEDGER_CUTOVER_ON)
  ) {
    return {
      activeBankAccountIds: [],
      approvedOn,
      mainAccountId: null,
      charge: await chargeFacts(tx, row),
      claimantName: null,
      hasPaymentProof: Boolean(row.approvalScreenshotKey),
      id: row.id,
      lines: [],
      matches: await bankMatchFacts(tx, { reimbursementId: row.id }),
      postedAccountId: null,
      status: row.status,
      title: row.title,
      voidedOn: dayOf(row.voidedAt),
    };
  }
  const lines = await tx
    .select({
      amountPaise: reimbursementLineItem.amountPaise,
      categoryId: reimbursementLineItem.categoryId,
      description: reimbursementLineItem.description,
      id: reimbursementLineItem.id,
    })
    .from(reimbursementLineItem)
    .where(eq(reimbursementLineItem.reimbursementId, id))
    .orderBy(
      asc(reimbursementLineItem.sortOrder),
      asc(reimbursementLineItem.id)
    );
  return {
    ...(await payingAccountFacts(tx, {
      sourceId: id,
      sourceType: T.reimbursement,
    })),
    approvedOn,
    charge: await chargeFacts(tx, row),
    claimantName: await userNameOf(tx, row.userId),
    hasPaymentProof: Boolean(row.approvalScreenshotKey),
    id: row.id,
    lines: await lineFacts(tx, lines),
    matches: await bankMatchFacts(tx, { reimbursementId: row.id }),
    status: row.status,
    title: row.title,
    voidedOn: dayOf(row.voidedAt),
  };
}

async function vendorPaymentFacts(
  tx: LedgerTx,
  id: string
): Promise<VendorPaymentFacts | null> {
  const [row] = await tx
    .select()
    .from(vendorPayment)
    .where(eq(vendorPayment.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  const lines =
    row.status === "completed"
      ? await tx
          .select({
            amountPaise: vendorPaymentLineItem.amountPaise,
            categoryId: vendorPaymentLineItem.categoryId,
            description: vendorPaymentLineItem.description,
            id: vendorPaymentLineItem.id,
          })
          .from(vendorPaymentLineItem)
          .where(eq(vendorPaymentLineItem.vendorPaymentId, id))
          .orderBy(
            asc(vendorPaymentLineItem.sortOrder),
            asc(vendorPaymentLineItem.id)
          )
      : [];
  // The supplier advance its accepted invoice clears: the approved
  // payments, split at the cutover by the day each posts on, exactly as
  // `vendorPaymentTransactionPlan` dates them.
  const payments =
    row.status === "completed"
      ? await tx
          .select({
            amountPaise: vendorPaymentTransaction.amountPaise,
            transactionDate: vendorPaymentTransaction.transactionDate,
          })
          .from(vendorPaymentTransaction)
          .where(
            and(
              eq(vendorPaymentTransaction.vendorPaymentId, id),
              eq(vendorPaymentTransaction.status, "approved"),
              // A voided payment's advance is reversed, so it clears nothing.
              isNull(vendorPaymentTransaction.voidedAt)
            )
          )
      : [];
  let paidPaise = 0;
  let paidBeforeCutoverPaise = 0;
  for (const p of payments) {
    if (p.amountPaise <= 0) {
      continue;
    }
    if (todayInKolkata(p.transactionDate) < LEDGER_CUTOVER_ON) {
      paidBeforeCutoverPaise += p.amountPaise;
    } else {
      paidPaise += p.amountPaise;
    }
  }
  return {
    acceptedOn: dayOf(row.invoiceReviewedAt),
    charge: await chargeFacts(tx, row),
    id: row.id,
    invoiceDate: row.invoiceDate,
    lines: await lineFacts(tx, lines),
    paidBeforeCutoverPaise,
    paidPaise,
    status: row.status,
    title: row.title,
    vendorId: row.vendorId,
    voidedOn: dayOf(row.voidedAt),
  };
}

async function vendorPaymentTransactionFacts(
  tx: LedgerTx,
  id: string
): Promise<VendorPaymentTransactionFacts | null> {
  const [row] = await tx
    .select({
      amountPaise: vendorPaymentTransaction.amountPaise,
      id: vendorPaymentTransaction.id,
      paymentReference: vendorPaymentTransaction.paymentReference,
      requestStatus: vendorPayment.status,
      status: vendorPaymentTransaction.status,
      title: vendorPayment.title,
      transactionDate: vendorPaymentTransaction.transactionDate,
      vendorId: vendorPayment.vendorId,
      voidedAt: vendorPaymentTransaction.voidedAt,
      requestVoidedAt: vendorPayment.voidedAt,
    })
    .from(vendorPaymentTransaction)
    .innerJoin(
      vendorPayment,
      eq(vendorPayment.id, vendorPaymentTransaction.vendorPaymentId)
    )
    .where(eq(vendorPaymentTransaction.id, id))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    ...(await payingAccountFacts(tx, {
      sourceId: id,
      sourceType: T.vendorPaymentTransaction,
    })),
    amountPaise: row.amountPaise,
    id: row.id,
    matches: await bankMatchFacts(tx, { vendorPaymentTransactionId: row.id }),
    paidOn: todayInKolkata(row.transactionDate),
    paymentReference: row.paymentReference,
    requestStatus: row.requestStatus,
    status: row.status,
    title: row.title,
    vendorId: row.vendorId,
    voidedOn: dayOf(row.voidedAt ?? row.requestVoidedAt),
  };
}

/** A bank debit's live bank charges and tax payment (layer 3-3b). */
async function statementChargeFacts(
  tx: LedgerTx,
  id: string
): Promise<StatementChargeFacts | null> {
  const [line] = await tx
    .select({
      direction: statementLine.direction,
      id: statementLine.id,
      orgAccountId: statementLine.orgAccountId,
      valueOn: statementLine.valueOn,
    })
    .from(statementLine)
    .where(eq(statementLine.id, id))
    .limit(1);
  if (!line) {
    return null;
  }
  const charges = await tx
    .select({
      amountPaise: statementAllocation.amountPaise,
      kind: statementAllocation.kind,
    })
    .from(statementAllocation)
    .where(
      and(
        eq(statementAllocation.statementLineId, id),
        isNull(statementAllocation.releasedAt)
      )
    );
  const sumOf = (kind: string) =>
    line.direction === "debit"
      ? charges
          .filter((c) => c.kind === kind)
          .reduce((sum, c) => sum + c.amountPaise, 0)
      : 0;
  return {
    bankChargesPaise: sumOf("bank_charges"),
    id: line.id,
    orgAccountId: line.orgAccountId,
    taxPaise: sumOf("tax_payment"),
    valueOn: line.valueOn,
  };
}

/** What the books should hold for an expense source, from its current record. */
export async function planExpenseSource(
  tx: LedgerTx,
  source: ExpenseSource
): Promise<SourcePlan> {
  switch (source.sourceType) {
    case T.reimbursement:
      return reimbursementPlan(await reimbursementFacts(tx, source.sourceId));
    case T.vendorPayment:
      return vendorPaymentPlan(await vendorPaymentFacts(tx, source.sourceId));
    case T.vendorPaymentTransaction:
      return vendorPaymentTransactionPlan(
        await vendorPaymentTransactionFacts(tx, source.sourceId)
      );
    case T.statementCharge:
      return statementChargePlan(
        await statementChargeFacts(tx, source.sourceId)
      );
    default:
      throw new LedgerError("invalid", "Not an expense source");
  }
}

// ── Sweeping ────────────────────────────────────────────────────────────────

/**
 * When an expense source's record, or anything its posting reads, last
 * changed: the request (approval, edits, charge and status all touch it),
 * its lines, their categories, the charged event (its programme) and the
 * bank accounts; for a payment, also its request. Null when the record is
 * gone.
 */
export function expenseSourceWatermark(type: ExpenseSourceType, id: SQL): SQL {
  const banks = sql`(select max(wa.updated_at) from ${orgAccount} wa where wa.kind = 'bank')`;
  // A bank debit matched or released (layer 3-3b); released rows stay, so
  // an unmatch moves the watermark too.
  const matched = (column: SQL, owner: SQL) =>
    sql`(select max(greatest(ws.created_at, ws.released_at)) from ${statementAllocation} ws where ${column} = ${owner})`;
  switch (type) {
    case T.reimbursement:
      return sql`(select greatest(
          wr.updated_at,
          (select max(greatest(wl.updated_at, wk.updated_at)) from ${reimbursementLineItem} wl
            join ${expenseCategory} wk on wk.id = wl.category_id
            where wl.reimbursement_id = wr.id),
          (select we.updated_at from ${teamEvent} we where we.id = wr.event_id),
          ${banks},
          ${matched(sql`ws.reimbursement_id`, sql`wr.id`)}
        ) from ${reimbursement} wr where wr.id = ${id})`;
    case T.vendorPayment:
      return sql`(select greatest(
          wv.updated_at,
          (select max(greatest(wl.updated_at, wk.updated_at)) from ${vendorPaymentLineItem} wl
            join ${expenseCategory} wk on wk.id = wl.category_id
            where wl.vendor_payment_id = wv.id),
          (select we.updated_at from ${teamEvent} we where we.id = wv.event_id),
          (select max(wt.updated_at) from ${vendorPaymentTransaction} wt
            where wt.vendor_payment_id = wv.id)
        ) from ${vendorPayment} wv where wv.id = ${id})`;
    case T.vendorPaymentTransaction:
      return sql`(select greatest(wt.updated_at, wv.updated_at, ${banks},
          ${matched(sql`ws.vendor_payment_transaction_id`, sql`wt.id`)})
        from ${vendorPaymentTransaction} wt
        join ${vendorPayment} wv on wv.id = wt.vendor_payment_id
        where wt.id = ${id})`;
    case T.statementCharge:
      return sql`(select greatest(wl.updated_at,
          ${matched(sql`ws.statement_line_id`, sql`wl.id`)})
        from ${statementLine} wl where wl.id = ${id})`;
    default:
      return sql`null::timestamp`;
  }
}

type Row = { id: string };

const rowsOf = (result: unknown) =>
  (result as Row[]).map((r) => ({ id: String(r.id) }));

/**
 * Expense sources dated in the range (each by the day it posts on, or would
 * post on) that may need a look. `changed` filters out the ones whose last
 * look saw them as they are (the incremental sweep).
 */
export async function listExpenseSources(
  tx: LedgerTx,
  range: { from: string; to: string },
  changed: (type: ExpenseSourceType, idColumn: SQL) => SQL
): Promise<ExpenseSource[]> {
  const { from, to } = range;
  const claims = rowsOf(
    await tx.execute(sql`
      select r.id from ${reimbursement} r
      where r.status = 'approved'
        and coalesce(${indiaDay(sql`r.reviewed_at`)}, r.expense_date) between ${from} and ${to}
        ${changed(T.reimbursement, sql`r.id`)}`)
  );
  const requests = rowsOf(
    await tx.execute(sql`
      select v.id from ${vendorPayment} v
      where v.status = 'completed'
        and coalesce(${indiaDay(sql`v.invoice_reviewed_at`)}, v.invoice_date) between ${from} and ${to}
        ${changed(T.vendorPayment, sql`v.id`)}`)
  );
  const payments = rowsOf(
    await tx.execute(sql`
      select t.id from ${vendorPaymentTransaction} t
      where t.status = 'approved'
        and ${indiaDay(sql`t.transaction_date`)} between ${from} and ${to}
        ${changed(T.vendorPaymentTransaction, sql`t.id`)}`)
  );
  // Bank debits with live bank charges or a tax payment (layer 3-3b).
  const charges = rowsOf(
    await tx.execute(sql`
      select l.id from ${statementLine} l
      where l.direction = 'debit'
        and l.value_on between ${from} and ${to}
        and exists (
          select 1 from ${statementAllocation} a
          where a.statement_line_id = l.id and a.released_at is null
            and a.kind in ('bank_charges', 'tax_payment'))
        ${changed(T.statementCharge, sql`l.id`)}`)
  );
  return [
    ...claims.map((r) => ({ sourceId: r.id, sourceType: T.reimbursement })),
    ...charges.map((r) => ({ sourceId: r.id, sourceType: T.statementCharge })),
    ...requests.map((r) => ({ sourceId: r.id, sourceType: T.vendorPayment })),
    ...payments.map((r) => ({
      sourceId: r.id,
      sourceType: T.vendorPaymentTransaction,
    })),
  ];
}

/**
 * Sources whose books follow this one: a vendor payment request's payments
 * (they post only while the request is approved), and a payment's request
 * (its accepted invoice clears the payments as supplier advances).
 */
export async function relatedExpenseSources(
  tx: LedgerTx,
  source: ExpenseSource
): Promise<ExpenseSource[]> {
  if (source.sourceType === T.vendorPaymentTransaction) {
    const [payment] = await tx
      .select({ id: vendorPaymentTransaction.vendorPaymentId })
      .from(vendorPaymentTransaction)
      .where(eq(vendorPaymentTransaction.id, source.sourceId))
      .limit(1);
    return payment
      ? [{ sourceId: payment.id, sourceType: T.vendorPayment }]
      : [];
  }
  if (source.sourceType !== T.vendorPayment) {
    return [];
  }
  const payments = await tx
    .select({ id: vendorPaymentTransaction.id })
    .from(vendorPaymentTransaction)
    .where(eq(vendorPaymentTransaction.vendorPaymentId, source.sourceId));
  return payments.map((p) => ({
    sourceId: p.id,
    sourceType: T.vendorPaymentTransaction,
  }));
}

// ── People the books name ───────────────────────────────────────────────────

/**
 * True while the books hold a standing posting for a reimbursement, vendor
 * payment request or payment this login raised or recorded. Deleting the
 * login would delete those records with it (their `user_id` cascades), and
 * the next posting run would then reverse money that really left the bank,
 * so the account can't be deleted while this holds (ban it instead).
 */
export async function userHasExpensesInBooks(
  tx: Pick<LedgerTx, "execute">,
  userId: string
): Promise<boolean> {
  const rows = (await tx.execute(sql`
    select 1 from ${posting} p
    where p.reverses_posting_id is null
      and not exists (
        select 1 from ${posting} r where r.reverses_posting_id = p.id
      )
      and (
        (p.source_type = ${T.reimbursement} and p.source_id in (
          select r.id from ${reimbursement} r where r.user_id = ${userId}))
        or (p.source_type = ${T.vendorPayment} and p.source_id in (
          select v.id from ${vendorPayment} v where v.user_id = ${userId}))
        or (p.source_type = ${T.vendorPaymentTransaction} and p.source_id in (
          select t.id from ${vendorPaymentTransaction} t
          join ${vendorPayment} v on v.id = t.vendor_payment_id
          where t.user_id = ${userId} or v.user_id = ${userId}))
      )
    limit 1`)) as unknown as unknown[];
  return rows.length > 0;
}
