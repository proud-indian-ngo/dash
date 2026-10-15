import {
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import type { ExpenseChargedTo } from "@pi-dash/shared/constants";
import { expenseProgrammeOf } from "@pi-dash/shared/expense-charge";
import {
  LEDGER_CUTOVER_ON,
  LEDGER_SKIP_REASONS,
  LEDGER_WAIT_REASONS,
  POSTING_ACTIONS,
} from "@pi-dash/shared/ledger";

import type { SourcePlan } from "./income-rules";
import type { EntryInput, MovementInput } from "./rules";

/**
 * Expense posting rules (finance Phase 3, layer 3-3a), in plain functions of
 * a source's facts, like the income rules: every rule the chartered
 * accountant may change lives in this one module. Each rule quotes the
 * posting table of `docs/architecture/finance-ledger-cutover.md` section 3.
 *
 * - Reimbursements. "A reimbursement is approved (it has already been
 *   paid; the payment screenshot is attached) | Expense per line | Out of
 *   the main bank account (the trust deals in no cash), on the payment
 *   date (default: approval date)". pi-dash records no separate payment
 *   date, so the approval date is the payment date. "Approved
 *   reimbursements without a screenshot (older records) are listed for the
 *   founder (section 6)": they wait, with that reason, and post nothing.
 * - Vendor payments. "A vendor invoice is accepted | Expense (or an asset
 *   for equipment) at the invoice amount less any GST we can recover ...
 *   The trust is not GST-registered, so today this is the full invoice
 *   amount | Nothing". The invoice amount is the request's line items (the
 *   request records no separate invoice total), each under its category's
 *   head: a category mapped to an asset head posts an asset. Accepted means
 *   the invoice, or the reason for having none, was approved (status
 *   `completed`, `vendor-payments.md`), dated the day it was approved.
 * - Vendor payment payments. "A vendor payment is paid and the payment
 *   confirmed | Nothing (already recognised) | Out of the account it was
 *   paid from". A payment is confirmed when it is approved; pi-dash records
 *   no account on a payment, and the trust pays from its bank account, so
 *   it leaves the main bank account on the payment's date. Payments always
 *   come before the invoice (`vendor-payments.md`: "invoice only after
 *   payment"), so "Payments before the invoice are supplier advances until
 *   allocated" (`finance-and-programmes.md` section 3.6): each payment is a
 *   `Supplier advances` asset increase, and accepting the invoice reduces
 *   it by the expense it recognises. Without this the books would not
 *   balance between payment and invoice. An invoice larger than the
 *   payments waits (it would not balance); a smaller one leaves the rest on
 *   the vendor's advance. A request paid before the cutover stays history.
 * - TDS: "Tax is deducted from a vendor payment (TDS) | Nothing; the amount
 *   owed to the government is tracked on the deduction | Nothing". The trust
 *   deducts none (founder, section 4 question 8), so nothing posts for it.
 * - The audit fee: "Founder: treat the payment as FY 2026-27 expense"
 *   (section 4 question 5), so it posts as any other vendor payment.
 *   Writing back the opening "Audit fees payable" liability is the CA's
 *   open question; it will be an adjustment (layer 3-3c), not a rule here.
 * - Dimensions: programme and project from "Charged to"
 *   (`expenseProgrammeOf`), the event when charged to one, and the General
 *   Fund (requests carry no fund; restricted gifts: none today).
 * - Cutover: "Nothing dated before 1 April 2026 is ever posted. A record
 *   dated earlier (a contribution, a reimbursement, a vendor payment) stays
 *   in pi-dash as history". Each source is dated by the day it posts on:
 *   the approval of a reimbursement, the acceptance of an invoice, the date
 *   of a payment.
 *
 * Corrections follow the income engine: an edit, un-approval or deletion
 * after posting reverses and reposts (or only reverses) by source revision.
 */

/** "The main bank account": the account a paid expense left from. */
export interface PayingAccountFacts {
  /** Active bank accounts. */
  activeBankAccountIds: string[];
  /** The active bank account marked as the main one in Settings, if any. */
  mainAccountId: string | null;
  /**
   * The account its standing posting paid from, if posted: kept, so
   * changing the main account later doesn't move payments already posted.
   */
  postedAccountId: string | null;
}

/**
 * "Out of the main bank account (the trust deals in no cash)": the account
 * already posted from, else the bank account marked main in Settings →
 * Organisation accounts, else the only active bank account. Null with none,
 * or several and none marked; layer 3-3b adds the matched bank debit.
 */
export function payingAccount(facts: PayingAccountFacts): string | null {
  return (
    facts.postedAccountId ??
    facts.mainAccountId ??
    (facts.activeBankAccountIds.length === 1
      ? (facts.activeBankAccountIds[0] ?? null)
      : null)
  );
}

export interface ExpenseChargeFacts {
  chargedProgrammeId: string | null;
  chargedProjectId: string | null;
  chargedTo: ExpenseChargedTo;
  eventId: string | null;
  /** The event's current programme, when charged to an event. */
  eventProgrammeId: string | null;
}

export interface ExpenseLineFacts {
  /** The category's head; null until the books' reference data maps it. */
  accountHeadId: string | null;
  amountPaise: number;
  description: string | null;
  id: string;
}

/** The dimensions every line of a request carries. */
function dimensionsOf(charge: ExpenseChargeFacts, partyId: string | null) {
  const { programmeId, projectId } = expenseProgrammeOf({
    chargedProgrammeId: charge.chargedProgrammeId,
    chargedProjectId: charge.chargedProjectId,
    chargedTo: charge.chargedTo,
    event: { programmeId: charge.eventProgrammeId },
  });
  return {
    eventId: charge.chargedTo === "event" ? charge.eventId : null,
    fundId: GENERAL_FUND_ID,
    partyId,
    programmeId,
    projectId,
  };
}

/** One expense entry per line with an amount; null when a line has no head. */
function expenseEntries(
  lines: readonly ExpenseLineFacts[],
  charge: ExpenseChargeFacts,
  partyId: string | null,
  title: string
): EntryInput[] | null {
  const dims = dimensionsOf(charge, partyId);
  const entries: EntryInput[] = [];
  for (const line of lines) {
    if (line.amountPaise <= 0) {
      continue;
    }
    if (!line.accountHeadId) {
      return null;
    }
    entries.push({
      ...dims,
      accountHeadId: line.accountHeadId,
      amountPaise: line.amountPaise,
      effect: "increase",
      memo: line.description?.trim() || title,
      sourceLineId: line.id,
    });
  }
  return entries;
}

const none = (
  reason: (typeof LEDGER_SKIP_REASONS)[keyof typeof LEDGER_SKIP_REASONS]
): SourcePlan => ({
  kind: "none",
  reason,
});

const wait = (
  economicOn: string | null,
  reason: (typeof LEDGER_WAIT_REASONS)[keyof typeof LEDGER_WAIT_REASONS]
): SourcePlan => ({ economicOn, kind: "wait", reason });

// ── Reimbursements ──────────────────────────────────────────────────────────

export interface ReimbursementFacts extends PayingAccountFacts {
  /** The approval day in India; null if an approved record has none. */
  approvedOn: string | null;
  charge: ExpenseChargeFacts;
  /**
   * Who was paid (`reimbursement.user_id`), named on the payout. A claimant
   * has no party, so the name is how the books follow a claimant change.
   */
  claimantName: string | null;
  /** The payment screenshot attached at approval. */
  hasPaymentProof: boolean;
  id: string;
  lines: ExpenseLineFacts[];
  status: string;
  title: string;
}

/** The payout's memo: the title and who was paid. */
const payoutMemo = (claim: ReimbursementFacts) =>
  claim.claimantName
    ? `${claim.title} (paid to ${claim.claimantName})`
    : claim.title;

export function reimbursementPlan(
  claim: ReimbursementFacts | null
): SourcePlan {
  if (!claim) {
    return none(LEDGER_SKIP_REASONS.deleted);
  }
  if (claim.status !== "approved") {
    return none(LEDGER_SKIP_REASONS.notApproved);
  }
  if (claim.approvedOn !== null && claim.approvedOn < LEDGER_CUTOVER_ON) {
    return none(LEDGER_SKIP_REASONS.beforeCutover);
  }
  if (!(claim.hasPaymentProof && claim.approvedOn)) {
    return wait(claim.approvedOn, LEDGER_WAIT_REASONS.noPaymentProof);
  }
  const day = claim.approvedOn;
  const entries = expenseEntries(claim.lines, claim.charge, null, claim.title);
  if (!entries) {
    return wait(day, LEDGER_WAIT_REASONS.referenceDataMissing);
  }
  const totalPaise = entries.reduce((sum, e) => sum + e.amountPaise, 0);
  if (totalPaise <= 0) {
    return none(LEDGER_SKIP_REASONS.notApproved);
  }
  const account = payingAccount(claim);
  if (!account) {
    return wait(day, LEDGER_WAIT_REASONS.noPayingAccount);
  }
  return {
    attention: 0,
    economicOn: day,
    kind: "post",
    parts: [
      {
        action: POSTING_ACTIONS.recognise,
        economicOn: day,
        entries,
        movements: [],
      },
      {
        action: POSTING_ACTIONS.cash,
        economicOn: day,
        entries: [],
        movements: [
          {
            amountPaise: totalPaise,
            direction: "out",
            kind: "payout",
            memo: payoutMemo(claim),
            orgAccountId: account,
          },
        ],
      },
    ],
  };
}

// ── Vendor payments: the invoice ────────────────────────────────────────────

export interface VendorPaymentFacts {
  /** The day the invoice (or no-invoice reason) was approved, in India. */
  acceptedOn: string | null;
  charge: ExpenseChargeFacts;
  id: string;
  /** The invoice's own date, when its approval day isn't recorded. */
  invoiceDate: string | null;
  lines: ExpenseLineFacts[];
  /**
   * The request's approved payments dated before the cutover: they left the
   * bank in a year the audited opening balances hold, so the books have no
   * advance for them.
   */
  paidBeforeCutoverPaise: number;
  /**
   * The request's approved payments dated from the cutover: the supplier
   * advance the accepted invoice clears.
   */
  paidPaise: number;
  status: string;
  title: string;
  /** The vendor's party (a vendor is a party with the vendor role). */
  vendorId: string;
}

/** The day an accepted invoice is recognised: its approval day, else its date. */
export const invoiceAcceptedDay = (
  vp: Pick<VendorPaymentFacts, "acceptedOn" | "invoiceDate">
): string | null => vp.acceptedOn ?? vp.invoiceDate;

export function vendorPaymentPlan(vp: VendorPaymentFacts | null): SourcePlan {
  if (!vp) {
    return none(LEDGER_SKIP_REASONS.deleted);
  }
  if (vp.status !== "completed") {
    return none(
      vp.status === "pending" || vp.status === "rejected"
        ? LEDGER_SKIP_REASONS.notApproved
        : LEDGER_SKIP_REASONS.invoiceNotAccepted
    );
  }
  const day = invoiceAcceptedDay(vp);
  if (!day) {
    return none(LEDGER_SKIP_REASONS.invoiceNotAccepted);
  }
  if (day < LEDGER_CUTOVER_ON) {
    return none(LEDGER_SKIP_REASONS.beforeCutover);
  }
  // Recoverable GST is nil: the trust is not GST-registered (cutover doc
  // section 3), so the expense is the full amount.
  const entries = expenseEntries(vp.lines, vp.charge, vp.vendorId, vp.title);
  if (!entries) {
    return wait(day, LEDGER_WAIT_REASONS.referenceDataMissing);
  }
  if (entries.length === 0) {
    return none(LEDGER_SKIP_REASONS.invoiceNotAccepted);
  }
  // Paid before the cutover: the money left in a year the audited opening
  // balances hold, so the request stays history ("A record dated earlier
  // ... stays in pi-dash as history"). Paid on both sides of it, the
  // split is the CA's call.
  if (vp.paidBeforeCutoverPaise > 0) {
    return vp.paidPaise > 0
      ? wait(day, LEDGER_WAIT_REASONS.paidAcrossCutover)
      : none(LEDGER_SKIP_REASONS.beforeCutover);
  }
  // The expense is balanced by clearing the supplier advance the payments
  // made. An invoice above the payments would leave part of the expense
  // with nothing on the other side, so it waits until they agree; one
  // below them clears only its own amount, and the rest stays on the
  // vendor's advance for the CA to look at (an overpayment).
  const expensePaise = entries.reduce((sum, e) => sum + e.amountPaise, 0);
  if (expensePaise > vp.paidPaise) {
    return wait(day, LEDGER_WAIT_REASONS.invoiceExceedsPayments);
  }
  entries.push({
    accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
    amountPaise: expensePaise,
    effect: "decrease",
    fundId: GENERAL_FUND_ID,
    memo: vp.title,
    partyId: vp.vendorId,
  });
  return {
    attention: 0,
    economicOn: day,
    kind: "post",
    parts: [
      {
        action: POSTING_ACTIONS.recognise,
        economicOn: day,
        entries,
        movements: [],
      },
    ],
  };
}

// ── Vendor payments: each payment ───────────────────────────────────────────

/** Requests whose approved payments are real (`vendor-payments.md`: no payment before approval). */
const PAYABLE_REQUEST_STATUSES: readonly string[] = [
  "approved",
  "partially_paid",
  "paid",
  "invoice_pending",
  "completed",
];

export interface VendorPaymentTransactionFacts extends PayingAccountFacts {
  amountPaise: number;
  id: string;
  /** The payment's date in India. */
  paidOn: string;
  paymentReference: string | null;
  requestStatus: string;
  status: string;
  title: string;
  vendorId: string;
}

export function vendorPaymentTransactionPlan(
  payment: VendorPaymentTransactionFacts | null
): SourcePlan {
  if (!payment) {
    return none(LEDGER_SKIP_REASONS.deleted);
  }
  if (
    payment.status !== "approved" ||
    !PAYABLE_REQUEST_STATUSES.includes(payment.requestStatus)
  ) {
    return none(LEDGER_SKIP_REASONS.notApproved);
  }
  if (payment.paidOn < LEDGER_CUTOVER_ON) {
    return none(LEDGER_SKIP_REASONS.beforeCutover);
  }
  if (payment.amountPaise <= 0) {
    return none(LEDGER_SKIP_REASONS.notApproved);
  }
  const account = payingAccount(payment);
  if (!account) {
    return wait(payment.paidOn, LEDGER_WAIT_REASONS.noPayingAccount);
  }
  const movement: MovementInput = {
    amountPaise: payment.amountPaise,
    direction: "out",
    kind: "payout",
    memo: payment.title,
    orgAccountId: account,
    paymentReference: payment.paymentReference,
  };
  return {
    attention: 0,
    economicOn: payment.paidOn,
    kind: "post",
    parts: [
      {
        action: POSTING_ACTIONS.recognise,
        economicOn: payment.paidOn,
        entries: [
          {
            accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
            amountPaise: payment.amountPaise,
            effect: "increase",
            fundId: GENERAL_FUND_ID,
            memo: payment.title,
            partyId: payment.vendorId,
          },
        ],
        movements: [],
      },
      {
        action: POSTING_ACTIONS.cash,
        economicOn: payment.paidOn,
        entries: [],
        movements: [movement],
      },
    ],
  };
}
