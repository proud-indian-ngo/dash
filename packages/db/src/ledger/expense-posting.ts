import { requestCostCentreId } from "@pi-dash/shared/cost-centre";
import { financialYearOf, todayInKolkata } from "@pi-dash/shared/income";
import {
  type ExpenseSourceType,
  LEDGER_SOURCE_TYPES,
  signedPaise,
} from "@pi-dash/shared/ledger";
import { PROVISION_HEADS } from "@pi-dash/shared/provisions";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { user } from "../schema/auth";
import { expenseCategory } from "../schema/expense-category";
import {
  accountHead,
  fiscalYear,
  orgAccount,
} from "../schema/finance-dimensions";
import {
  accountMovement,
  auditedFigures,
  ledgerEntry,
  posting,
} from "../schema/ledger";
import { reimbursement, reimbursementLineItem } from "../schema/reimbursement";
import { statementAllocation, statementLine } from "../schema/statement-line";
import { teamEvent } from "../schema/team-event";
import { vendorPayment, vendorPaymentLineItem } from "../schema/vendor";
import { vendorPaymentTransaction } from "../schema/vendor-payment-transaction";
import type { LedgerTx } from "./engine";
import { ensureExpenseCategoryHeads } from "./expense-heads";
import {
  allocateProvision,
  type BankMatchFacts,
  type ExpenseChargeFacts,
  type ExpenseLineFacts,
  type PayingAccountFacts,
  invoiceAcceptedDay,
  paymentTiming,
  type ProvisionBaseEntry,
  type ProvisionClaim,
  provisionClaimsOf,
  provisionOutstanding,
  type ReimbursementFacts,
  reimbursementPlan,
  type StatementChargeFacts,
  statementChargePlan,
  timingWait,
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
    costCentreId: string | null;
    eventId: string | null;
  }
): Promise<ExpenseChargeFacts> {
  const [event] = request.eventId
    ? await tx
        .select({
          costCentreId: teamEvent.costCentreId,
          programmeId: teamEvent.programmeId,
          projectId: teamEvent.projectId,
        })
        .from(teamEvent)
        .where(eq(teamEvent.id, request.eventId))
        .limit(1)
    : [];
  return {
    chargedProgrammeId: request.chargedProgrammeId,
    chargedProjectId: request.chargedProjectId,
    chargedTo: request.chargedTo,
    costCentreId: requestCostCentreId({ ...request, event }),
    eventId: request.eventId,
    eventProgrammeId:
      request.chargedTo === "event" ? (event?.programmeId ?? null) : null,
    eventProjectId:
      request.chargedTo === "event" ? (event?.projectId ?? null) : null,
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
    provisionHeadId?: string | null;
  }[],
  options: { readOnly?: boolean } = {}
): Promise<ExpenseLineFacts[]> {
  // A read (the approval picker) never writes: a category without a head
  // then reads as having none.
  if (!options.readOnly) {
    await ensureExpenseCategoryHeads(tx, [
      ...new Set(lines.map((l) => l.categoryId)),
    ]);
  }
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
    ...(l.provisionHeadId && { provisionHeadId: l.provisionHeadId }),
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
  // Only an approved one needs its lines, accounts and bank debits (one
  // approved before the cutover still posts when a debit after it paid it).
  if (row.status !== "approved") {
    return {
      activeBankAccountIds: [],
      approvedOn,
      mainAccountId: null,
      charge: await chargeFacts(tx, row),
      claimantName: null,
      hasPaymentProof: Boolean(row.approvalScreenshotKey),
      id: row.id,
      lines: [],
      matches: [],
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

/**
 * A vendor payment request's facts. With `provision` off, what its lines
 * may clear of a provision is left out: that is how another invoice asks
 * whether this one posts (it does whatever the split), without recursing.
 * With `readOnly`, nothing is written (no category heads are created).
 */
async function vendorPaymentFacts(
  tx: LedgerTx,
  id: string,
  options: { provision: boolean; readOnly?: boolean } = { provision: true }
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
            provisionHeadId: vendorPaymentLineItem.provisionHeadId,
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
            id: vendorPaymentTransaction.id,
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
  let paymentWaiting: VendorPaymentFacts["paymentWaiting"] = null;
  for (const p of payments) {
    if (p.amountPaise <= 0) {
      continue;
    }
    // By when its money actually left (its matched bank debits, else its
    // date), as `vendorPaymentTransactionPlan` books it.
    const timing = paymentTiming({
      defaultOn: todayInKolkata(p.transactionDate),
      matches: await bankMatchFacts(tx, { vendorPaymentTransactionId: p.id }),
      totalPaise: p.amountPaise,
    });
    if (timing.kind === "before") {
      paidBeforeCutoverPaise += p.amountPaise;
    } else if (timing.kind === "after") {
      paidPaise += p.amountPaise;
    } else {
      paymentWaiting ??= timingWait(timing);
    }
  }
  const acceptedOn = dayOf(row.invoiceReviewedAt);
  const day = invoiceAcceptedDay({ acceptedOn, invoiceDate: row.invoiceDate });
  const provisionAvailablePaise: Record<string, number> = {};
  if (options.provision && day && !row.voidedAt) {
    for (const [headId, claimPaise] of provisionClaimsOf(lines)) {
      const { base, claims } = await provisionLedger(tx, headId, row.id);
      const taken = allocateProvision(base, [
        ...claims,
        { claimPaise, id: row.id, on: day },
      ]);
      provisionAvailablePaise[headId] = taken.get(row.id) ?? 0;
    }
  }
  return {
    acceptedOn,
    charge: await chargeFacts(tx, row),
    id: row.id,
    invoiceDate: row.invoiceDate,
    lines: await lineFacts(tx, lines, { readOnly: options.readOnly }),
    paidBeforeCutoverPaise,
    paidPaise,
    paymentWaiting,
    provisionAvailablePaise,
    status: row.status,
    title: row.title,
    vendorId: row.vendorId,
    voidedOn: dayOf(row.voidedAt),
  };
}

// ── Provisions ──────────────────────────────────────────────────────────────

/** The day before an ISO day. */
function dayBefore(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Days the books can no longer change: a closed year, and every day up to
 * the end of the last year whose audited figures are matched (the engine
 * refuses those dates, `resolvePeriods`).
 */
async function frozenDays(tx: LedgerTx): Promise<(day: string) => boolean> {
  const [matched] = (await tx.execute(sql`
    select max(y.ends_on)::text as through from ${auditedFigures} a
    join ${fiscalYear} y on y.id = a.fiscal_year_id
    where a.status = 'matched' and a.reversed_at is null`)) as unknown as {
    through: string | null;
  }[];
  const closed = await tx
    .select({ endsOn: fiscalYear.endsOn, startsOn: fiscalYear.startsOn })
    .from(fiscalYear)
    .where(isNotNull(fiscalYear.closedAt));
  const through = matched?.through ?? null;
  return (day) =>
    (through !== null && day <= through) ||
    closed.some((y) => day >= y.startsOn && day <= y.endsOn);
}

/**
 * Everything `allocateProvision` needs for one provision head, leaving out
 * one invoice (the one asking):
 * - `claims`: the other standing (not voided), accepted invoices with lines
 *   charged to it that post (from the cutover, paid as their invoice
 *   needs) on a day that can still change, each by its own record, not by
 *   what its postings say right now;
 * - `base`: the provision's entries that no claim's record decides, as
 *   they stand in the books: the opening balances (a provision for the
 *   year before the cutover), the audited figures, and the standing
 *   entries of every other invoice that is not a claim (one that waits
 *   with its posting kept, one in a closed or matched year, one about to
 *   be reversed). A voided invoice is no claim for anyone. Voided in the
 *   year it posted in, its entries are left out, so invoices dated before
 *   its void day are allocated as if it never claimed; its own reversal
 *   still lands on the void day, so the provision can dip below zero in
 *   between, within that year, and that year's closing is right. One that
 *   posted on a frozen day, or in an earlier year than its void, stays in
 *   the base with its reversal, as it stands.
 */
export async function provisionLedger(
  tx: LedgerTx,
  headId: string,
  exceptId: string | null,
  options: { readOnly?: boolean } = {}
): Promise<{ base: ProvisionBaseEntry[]; claims: ProvisionClaim[] }> {
  const isFrozen = await frozenDays(tx);
  const candidates = await tx
    .selectDistinct({ id: vendorPayment.id })
    .from(vendorPayment)
    .innerJoin(
      vendorPaymentLineItem,
      eq(vendorPaymentLineItem.vendorPaymentId, vendorPayment.id)
    )
    .where(
      and(
        eq(vendorPayment.status, "completed"),
        isNull(vendorPayment.voidedAt),
        eq(vendorPaymentLineItem.provisionHeadId, headId),
        exceptId ? ne(vendorPayment.id, exceptId) : undefined
      )
    );
  const claims: ProvisionClaim[] = [];
  for (const candidate of candidates) {
    const facts = await vendorPaymentFacts(tx, candidate.id, {
      provision: false,
      readOnly: options.readOnly,
    });
    const on = facts ? invoiceAcceptedDay(facts) : null;
    const claimPaise = facts
      ? (provisionClaimsOf(facts.lines).get(headId) ?? 0)
      : 0;
    // Only an invoice that posts takes from the provision; whether it
    // posts never depends on how its lines split. One on a frozen day, or
    // one that waits, is in the base as its postings stand. The read-only
    // picker creates no category heads, so a line whose category has none
    // yet counts as mapped: the posting run will make the head.
    const planned =
      facts && options.readOnly
        ? {
            ...facts,
            lines: facts.lines.map((l) => ({
              ...l,
              accountHeadId: l.accountHeadId ?? "unmapped-category",
            })),
          }
        : facts;
    if (
      planned &&
      on &&
      !isFrozen(on) &&
      claimPaise > 0 &&
      vendorPaymentPlan(planned).kind === "post"
    ) {
      claims.push({ claimPaise, id: planned.id, on });
    }
  }
  const claimIds = new Set(claims.map((c) => c.id));

  const reversal = alias(posting, "reversal");
  const rows = await tx
    .select({
      amountPaise: ledgerEntry.amountPaise,
      economicOn: ledgerEntry.economicOn,
      effect: ledgerEntry.effect,
      isReversal: sql<boolean>`${posting.reversesPostingId} is not null`,
      reversalOn: reversal.economicOn,
      reversed: sql<boolean>`${reversal.id} is not null`,
      sourceId: posting.sourceId,
      sourceType: posting.sourceType,
      voided: sql<boolean>`exists (select 1 from ${vendorPayment} pv
        where pv.id = ${posting.sourceId} and pv.voided_at is not null)`,
      voidedOn: sql<string | null>`(select ${indiaDay(sql`pv.voided_at`)}::text
        from ${vendorPayment} pv where pv.id = ${posting.sourceId})`,
    })
    .from(ledgerEntry)
    .innerJoin(posting, eq(posting.id, ledgerEntry.postingId))
    .leftJoin(reversal, eq(reversal.reversesPostingId, posting.id))
    .where(eq(ledgerEntry.accountHeadId, headId))
    .orderBy(asc(ledgerEntry.economicOn), asc(ledgerEntry.id));
  const invoiceOf = (r: (typeof rows)[number]) =>
    r.sourceType === T.vendorPayment;
  // A voided invoice is left out (as if it never claimed) only when it was
  // voided in the year it posted in, on days that can still change. One
  // that posted on a frozen day, or in an earlier year than its void,
  // stays in the base as it stands: its share comes back on the void day,
  // for invoices from then on, and no earlier year's closing moves. Only
  // the revision the void reversed counts: one reversed earlier (a
  // re-approval) says nothing about the year it was voided in.
  const keptVoided = new Set(
    rows
      .filter(
        (r) =>
          invoiceOf(r) &&
          r.voided &&
          !r.isReversal &&
          (!r.reversed || r.reversalOn === r.voidedOn) &&
          (isFrozen(r.economicOn) ||
            (r.voidedOn !== null &&
              financialYearOf(r.economicOn).label !==
                financialYearOf(r.voidedOn).label))
      )
      .map((r) => r.sourceId)
  );
  const base: ProvisionBaseEntry[] = [];
  for (const r of rows) {
    if (invoiceOf(r)) {
      if (r.sourceId === exceptId || claimIds.has(r.sourceId)) {
        continue;
      }
      // A voided one as it stands only when kept above; any other only
      // its standing entries.
      const kept = r.voided
        ? keptVoided.has(r.sourceId)
        : !(r.isReversal || r.reversed);
      if (!kept) {
        continue;
      }
    }
    base.push({
      economicOn: r.economicOn,
      ...(r.sourceType === T.auditedFigures && { fromAudited: true as const }),
      // The opening balances, dated the year's first day, hold the
      // provision the CA made for the year before. A voided invoice's
      // entries net to nothing once reversed, so they name no year.
      forYear:
        invoiceOf(r) && r.voided
          ? null
          : financialYearOf(
              r.sourceType === T.openingBalance
                ? dayBefore(r.economicOn)
                : r.economicOn
            ).label,
      signedPaise: signedPaise(r.effect, r.amountPaise),
    });
  }
  return { base, claims };
}

/** How one invoice line was split in the books, from its standing entries. */
export interface ProvisionLineSplit {
  /** What it cleared of the provision. */
  clearedPaise: number;
  /** What it posted as expense, above the provision. */
  expensePaise: number;
  lineId: string;
  provisionHeadId: string;
}

/**
 * For a vendor payment's detail page: for each provision head, what is
 * outstanding for this invoice if it were accepted today (its approval
 * picker) and the years it is from, and how its lines charged to a
 * provision were split by the postings that stand for it.
 */
export async function vendorPaymentProvisionView(
  tx: LedgerTx,
  vendorPaymentId: string,
  today: string
): Promise<{
  outstanding: { headId: string; paise: number; years: string[] }[];
  split: ProvisionLineSplit[];
}> {
  const outstanding: { headId: string; paise: number; years: string[] }[] = [];
  const present = new Set(
    (
      await tx
        .select({ id: accountHead.id })
        .from(accountHead)
        .where(
          inArray(
            accountHead.id,
            PROVISION_HEADS.flatMap((h) => [h.id, h.excessHeadId])
          )
        )
    ).map((h) => h.id)
  );
  for (const head of PROVISION_HEADS) {
    // Read only: heads the books' reference data hasn't made yet mean
    // nothing is outstanding.
    if (!(present.has(head.id) && present.has(head.excessHeadId))) {
      outstanding.push({ headId: head.id, paise: 0, years: [] });
      continue;
    }
    const { base, claims } = await provisionLedger(
      tx,
      head.id,
      vendorPaymentId,
      { readOnly: true }
    );
    outstanding.push({
      headId: head.id,
      ...provisionOutstanding(base, claims, today),
    });
  }
  const reversal = alias(posting, "reversal");
  const entries = await tx
    .select({
      accountHeadId: ledgerEntry.accountHeadId,
      amountPaise: ledgerEntry.amountPaise,
      effect: ledgerEntry.effect,
      lineId: ledgerEntry.sourceLineId,
    })
    .from(ledgerEntry)
    .innerJoin(posting, eq(posting.id, ledgerEntry.postingId))
    .leftJoin(reversal, eq(reversal.reversesPostingId, posting.id))
    .where(
      and(
        eq(posting.sourceType, T.vendorPayment),
        eq(posting.sourceId, vendorPaymentId),
        isNull(posting.reversesPostingId),
        isNull(reversal.id)
      )
    );
  const split = new Map<string, ProvisionLineSplit>();
  for (const head of PROVISION_HEADS) {
    for (const e of entries) {
      if (
        !e.lineId ||
        (e.accountHeadId !== head.id && e.accountHeadId !== head.excessHeadId)
      ) {
        continue;
      }
      const line = split.get(e.lineId) ?? {
        clearedPaise: 0,
        expensePaise: 0,
        lineId: e.lineId,
        provisionHeadId: head.id,
      };
      if (e.accountHeadId === head.id && e.effect === "decrease") {
        line.clearedPaise += e.amountPaise;
      } else if (e.accountHeadId === head.excessHeadId) {
        line.expensePaise += e.amountPaise;
      }
      split.set(e.lineId, line);
    }
  }
  return { outstanding, split: [...split.values()] };
}

async function vendorPaymentTransactionFacts(
  tx: LedgerTx,
  id: string
): Promise<VendorPaymentTransactionFacts | null> {
  const [row] = await tx
    .select({
      amountPaise: vendorPaymentTransaction.amountPaise,
      eventCostCentreId: teamEvent.costCentreId,
      eventId: vendorPayment.eventId,
      id: vendorPaymentTransaction.id,
      requestCostCentreId: vendorPayment.costCentreId,
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
    .leftJoin(teamEvent, eq(teamEvent.id, vendorPayment.eventId))
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
    costCentreId: requestCostCentreId({
      costCentreId: row.requestCostCentreId,
      event: { costCentreId: row.eventCostCentreId },
      eventId: row.eventId,
    }),
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
 * When a vendor payment request, or anything its own posting reads, last
 * changed: the request (approval, edits, charge and status all touch it),
 * its lines and their categories, the charged event, its payments and
 * their bank matches.
 */
function vendorPaymentWatermark(id: SQL): SQL {
  return sql`(select greatest(
      wv.updated_at,
      (select max(greatest(wl.updated_at, wk.updated_at)) from ${vendorPaymentLineItem} wl
        join ${expenseCategory} wk on wk.id = wl.category_id
        where wl.vendor_payment_id = wv.id),
      (select we.updated_at from ${teamEvent} we where we.id = wv.event_id),
      (select max(wt.updated_at) from ${vendorPaymentTransaction} wt
        where wt.vendor_payment_id = wv.id),
      (select max(greatest(ws.created_at, ws.released_at)) from ${statementAllocation} ws
        join ${vendorPaymentTransaction} wt on wt.id = ws.vendor_payment_transaction_id
        where wt.vendor_payment_id = wv.id)
    ) from ${vendorPayment} wv where wv.id = ${id})`;
}

/**
 * When an expense source's record, or anything its posting reads, last
 * changed: the request (approval, edits, charge and status all touch it),
 * its lines, their categories, the charged event (its programme and
 * project) and the bank accounts; for a payment, also its request. Null when the record is
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
      // A line charged to a provision splits by what other records leave
      // outstanding (`provisionLedger`): the other invoices charged to it
      // and the provision's postings from other sources.
      return sql`(select greatest(
          ${vendorPaymentWatermark(sql`pw.id`)},
          case when exists (select 1 from ${vendorPaymentLineItem} pl
            where pl.vendor_payment_id = pw.id and pl.provision_head_id is not null)
          then greatest(
            (select max(${vendorPaymentWatermark(sql`po.id`)}) from ${vendorPayment} po
              where po.id <> pw.id and exists (select 1 from ${vendorPaymentLineItem} ol
                where ol.vendor_payment_id = po.id and ol.provision_head_id is not null)),
            (select max(pp.created_at) from ${posting} pp
              where pp.source_id <> pw.id and exists (select 1 from ${ledgerEntry} pe
                where pe.posting_id = pp.id and pe.account_head_id in (
                  select pl.provision_head_id from ${vendorPaymentLineItem} pl
                  where pl.vendor_payment_id = pw.id)))
          ) end
        ) from ${vendorPayment} pw where pw.id = ${id})`;
    case T.vendorPaymentTransaction:
      // The request's event too: its cost centre is on the payment's entries.
      return sql`(select greatest(wt.updated_at, wv.updated_at, ${banks},
          (select we.updated_at from ${teamEvent} we where we.id = wv.event_id),
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
  // Also those a bank debit in the range pays (layer 3-3b): a claim
  // approved before the cutover posts on its debit's day.
  const matchedIn = (owner: SQL) => sql`or exists (
      select 1 from ${statementAllocation} a
      join ${statementLine} l on l.id = a.statement_line_id
      where ${owner} and a.released_at is null
        and l.value_on between ${from} and ${to})`;
  const claims = rowsOf(
    await tx.execute(sql`
      select r.id from ${reimbursement} r
      where r.status = 'approved'
        and (coalesce(${indiaDay(sql`r.reviewed_at`)}, r.expense_date) between ${from} and ${to}
          ${matchedIn(sql`a.reimbursement_id = r.id`)})
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
        and (${indiaDay(sql`t.transaction_date`)} between ${from} and ${to}
          ${matchedIn(sql`a.vendor_payment_transaction_id = t.id`)})
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
  return [
    ...payments.map((p) => ({
      sourceId: p.id,
      sourceType: T.vendorPaymentTransaction,
    })),
    ...(await provisionNeighbours(tx, source.sourceId)),
  ];
}

/**
 * The other invoices charged to a provision this request is (or was)
 * charged to: what they clear depends on what it takes. Empty for a
 * request that never touched a provision.
 */
async function provisionNeighbours(
  tx: LedgerTx,
  vendorPaymentId: string
): Promise<ExpenseSource[]> {
  const rows = (await tx.execute(sql`
    select distinct o.vendor_payment_id as id
    from ${vendorPaymentLineItem} o
    where o.vendor_payment_id <> ${vendorPaymentId}
      and o.provision_head_id in (
        select l.provision_head_id from ${vendorPaymentLineItem} l
        where l.vendor_payment_id = ${vendorPaymentId}
          and l.provision_head_id is not null
        union
        select e.account_head_id from ${ledgerEntry} e
        join ${posting} p on p.id = e.posting_id
        where p.source_type = ${T.vendorPayment} and p.source_id = ${vendorPaymentId}
      )
    order by 1`)) as unknown as { id: string }[];
  return rows.map((r) => ({
    sourceId: String(r.id),
    sourceType: T.vendorPayment,
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
