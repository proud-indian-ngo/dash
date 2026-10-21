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
  type LedgerWaitReason,
  POSTING_ACTIONS,
} from "@pi-dash/shared/ledger";
import { provisionHeadOf } from "@pi-dash/shared/provisions";

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
 *   allocated" (`finance-books.md`, "Expense posting rules"): each payment is a
 *   `Supplier advances` asset increase, and accepting the invoice reduces
 *   it by the expense it recognises. Without this the books would not
 *   balance between payment and invoice. An invoice larger than the
 *   payments waits (it would not balance); a smaller one leaves the rest on
 *   the vendor's advance. A request paid before the cutover stays history.
 * - TDS: "Tax is deducted from a vendor payment (TDS) | Nothing; the amount
 *   owed to the government is tracked on the deduction | Nothing". The trust
 *   deducts none (founder, section 4 question 8), so nothing posts for it.
 * - The audit fee: "Founder: the payment clears the provision, and any
 *   excess is expense" (section 4 question 5, 17 October 2026). Finance
 *   charges the auditor's invoice line to "Audit fees payable" at invoice
 *   approval (`PROVISION_HEADS`); the line then decreases the provision by
 *   what is outstanding and posts the rest under "Audit fees". What is
 *   outstanding is worked out by `allocateProvision`, so the split never
 *   depends on the order the posting run looks at the invoices.
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
 * or several and none marked. A matched bank debit overrides this for the
 * part it pays (`paymentMovements`, layer 3-3b).
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

/**
 * A bank debit matched to the payment (layer 3-3b): the live
 * `statement_allocation` and its line.
 */
export interface BankMatchFacts {
  /** What the line pays of this payment. */
  amountPaise: number;
  /** The line's bank account. */
  orgAccountId: string;
  statementLineId: string;
  /** The line's value date (yyyy-MM-dd). */
  valueOn: string;
}

/**
 * When a payment's money left the bank (layer 3-3b), against the cutover:
 * the matched debits' value dates, and the default day for any part no
 * debit is matched to yet. The audited FY 2025-26 accounts are cash-basis
 * for payments (founder decision, confirmed as built on 17 October 2026), so:
 * - `before`: all of it left before 1 Apr 2026: history, nothing posts
 *   (the opening balances already hold it), even if approved after;
 * - `after`: all of it left from 1 Apr 2026: it posts, recognised no earlier
 *   than `firstOn`, the first money date;
 * - `across`: on both sides: waits for the CA;
 * - `exceeds`: the debits matched are more than the payment: waits.
 */
export type PaymentTiming =
  | { kind: "before" }
  | { firstOn: string; kind: "after" }
  | { kind: "across" }
  | { kind: "exceeds" };

export function paymentTiming(input: {
  defaultOn: string;
  matches: readonly BankMatchFacts[];
  totalPaise: number;
}): PaymentTiming {
  const matchedPaise = input.matches.reduce((sum, m) => sum + m.amountPaise, 0);
  if (matchedPaise > input.totalPaise) {
    return { kind: "exceeds" };
  }
  const days = [
    ...input.matches.map((m) => m.valueOn),
    ...(matchedPaise < input.totalPaise ? [input.defaultOn] : []),
  ].sort();
  const first = days[0] ?? input.defaultOn;
  const last = days.at(-1) ?? input.defaultOn;
  if (last < LEDGER_CUTOVER_ON) {
    return { kind: "before" };
  }
  if (first < LEDGER_CUTOVER_ON) {
    return { kind: "across" };
  }
  return { firstOn: first, kind: "after" };
}

/** Why a payment that can't post waits, from its timing; null when it posts or is history. */
export function timingWait(timing: PaymentTiming): LedgerWaitReason | null {
  if (timing.kind === "exceeds") {
    return LEDGER_WAIT_REASONS.matchExceedsAmount;
  }
  return timing.kind === "across"
    ? LEDGER_WAIT_REASONS.bankDebitAcrossCutover
    : null;
}

export type PaymentMovements =
  | { kind: "ok"; movements: MovementInput[] }
  | { kind: "wait"; reason: LedgerWaitReason };

/**
 * The money out for a payment of `totalPaise` (layer 3-3b): "the payment's
 * account and date follow the bank". Each matched bank debit pays its part
 * from the line's account on the line's value date (`bank_value_on` set,
 * reconciled to the line); whatever no debit is matched to yet leaves the
 * default paying account on the default day, as layer 3-3a posts it.
 * Matches are taken oldest line first, so the movements are stable.
 *
 * Waits when the debits matched are more than the payment (its amount was
 * lowered after matching), and when the unmatched rest has no paying
 * account. The caller has already refused matches across the cutover.
 */
export function paymentMovements(input: {
  defaultAccountId: string | null;
  defaultOn: string;
  matches: readonly BankMatchFacts[];
  movement: Omit<MovementInput, "amountPaise" | "orgAccountId">;
  totalPaise: number;
}): PaymentMovements {
  const matches = [...input.matches].sort(
    (a, b) =>
      a.valueOn.localeCompare(b.valueOn) ||
      a.statementLineId.localeCompare(b.statementLineId)
  );
  const matchedPaise = matches.reduce((sum, m) => sum + m.amountPaise, 0);
  if (matchedPaise > input.totalPaise) {
    return { kind: "wait", reason: LEDGER_WAIT_REASONS.matchExceedsAmount };
  }
  const movements: MovementInput[] = matches.map((m) => ({
    ...input.movement,
    amountPaise: m.amountPaise,
    bankValueOn: m.valueOn,
    occurredOn: m.valueOn,
    orgAccountId: m.orgAccountId,
    statementLineId: m.statementLineId,
  }));
  const restPaise = input.totalPaise - matchedPaise;
  if (restPaise > 0) {
    if (!input.defaultAccountId) {
      return { kind: "wait", reason: LEDGER_WAIT_REASONS.noPayingAccount };
    }
    movements.push({
      ...input.movement,
      amountPaise: restPaise,
      // Dated explicitly only beside a matched debit (the part's own date
      // is then the earliest debit's).
      ...(matches.length > 0 && { occurredOn: input.defaultOn }),
      orgAccountId: input.defaultAccountId,
    });
  }
  return { kind: "ok", movements };
}

/** The cash part's date: its earliest movement (a debit can precede the approval). */
const cashDayOf = (movements: readonly MovementInput[], fallback: string) =>
  movements
    .map((m) => m.occurredOn ?? fallback)
    .sort()
    .at(0) ?? fallback;

export interface ExpenseChargeFacts {
  chargedProgrammeId: string | null;
  chargedProjectId: string | null;
  chargedTo: ExpenseChargedTo;
  /**
   * The document's cost centre (`requestCostCentreId`): its event's when it
   * has one, else its own; null on older requests that never recorded a
   * city. Frozen on its expense and payment entries when it posts.
   */
  costCentreId: string | null;
  eventId: string | null;
  /** The event's current programme, when charged to an event. */
  eventProgrammeId: string | null;
  /** The event's current project, when charged to an event. */
  eventProjectId: string | null;
}

export interface ExpenseLineFacts {
  /** The category's head; null until the books' reference data maps it. */
  accountHeadId: string | null;
  amountPaise: number;
  description: string | null;
  id: string;
  /**
   * A vendor invoice line charged to a provision instead of its category's
   * head (`PROVISION_HEADS`); null or absent otherwise.
   */
  provisionHeadId?: string | null;
}

/** The dimensions every line of a request carries. */
function dimensionsOf(charge: ExpenseChargeFacts, partyId: string | null) {
  const { programmeId, projectId } = expenseProgrammeOf({
    chargedProgrammeId: charge.chargedProgrammeId,
    chargedProjectId: charge.chargedProjectId,
    chargedTo: charge.chargedTo,
    event: {
      programmeId: charge.eventProgrammeId,
      projectId: charge.eventProjectId,
    },
  });
  return {
    costCentreId: charge.costCentreId,
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

/** Voided: whatever stands is reversed on the void day (Option B). */
const voided = (voidedOn: string): SourcePlan => ({
  kind: "none",
  reason: LEDGER_SKIP_REASONS.voided,
  reverseOn: voidedOn,
});

const wait = (
  economicOn: string | null,
  reason: (typeof LEDGER_WAIT_REASONS)[keyof typeof LEDGER_WAIT_REASONS]
): SourcePlan => ({ economicOn, kind: "wait", reason });

/**
 * A wait about when or whether the money left (layer 3-3b: its bank
 * matches, its proof, its paying account): what stands is reversed while it
 * waits, so bank money a line no longer pays, or money the opening balances
 * already hold, is never counted twice.
 */
const waitOnMoney = (
  economicOn: string | null,
  reason: (typeof LEDGER_WAIT_REASONS)[keyof typeof LEDGER_WAIT_REASONS]
): SourcePlan => ({ economicOn, kind: "wait", reason, reverseStanding: true });

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
  /** Bank debits matched to it (layer 3-3b). */
  matches: BankMatchFacts[];
  status: string;
  title: string;
  /** The void day in India, once voided. */
  voidedOn: string | null;
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
  if (claim.voidedOn) {
    return voided(claim.voidedOn);
  }
  if (claim.status !== "approved") {
    return none(LEDGER_SKIP_REASONS.notApproved);
  }
  const totalPaise = claim.lines.reduce(
    (sum, l) => sum + Math.max(0, l.amountPaise),
    0
  );
  if (claim.approvedOn !== null) {
    // When the money left decides the year: cash basis before the cutover.
    const timing = paymentTiming({
      defaultOn: claim.approvedOn,
      matches: claim.matches,
      totalPaise,
    });
    if (timing.kind === "before") {
      return none(LEDGER_SKIP_REASONS.beforeCutover);
    }
    const waiting = timingWait(timing);
    if (waiting) {
      return waitOnMoney(claim.approvedOn, waiting);
    }
  }
  // A matched bank debit is proof of payment too (layer 3-3b).
  if (!(claim.hasPaymentProof || claim.matches.length > 0)) {
    return waitOnMoney(claim.approvedOn, LEDGER_WAIT_REASONS.noPaymentProof);
  }
  if (!claim.approvedOn) {
    return wait(null, LEDGER_WAIT_REASONS.noApprovalDay);
  }
  const approvedOn = claim.approvedOn;
  const entries = expenseEntries(claim.lines, claim.charge, null, claim.title);
  if (!entries) {
    return wait(approvedOn, LEDGER_WAIT_REASONS.referenceDataMissing);
  }
  if (totalPaise <= 0) {
    return none(LEDGER_SKIP_REASONS.nothingToPost);
  }
  const memo = payoutMemo(claim);
  const cash = paymentMovements({
    defaultAccountId: payingAccount(claim),
    defaultOn: approvedOn,
    matches: claim.matches,
    movement: { direction: "out", kind: "payout", memo },
    totalPaise,
  });
  if (cash.kind === "wait") {
    return waitOnMoney(approvedOn, cash.reason);
  }
  const cashOn = cashDayOf(cash.movements, approvedOn);
  // Approved before the cutover but paid after it: recognised on the first
  // payment day, the first day the books keep for it.
  const day =
    approvedOn < LEDGER_CUTOVER_ON
      ? (cash.movements.map((m) => m.occurredOn ?? cashOn).sort()[0] ?? cashOn)
      : approvedOn;
  const payable = (
    effect: "increase" | "decrease",
    amountPaise: number,
    economicOn: string
  ): EntryInput => ({
    accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.claimsPayable,
    amountPaise,
    costCentreId: claim.charge.costCentreId,
    economicOn,
    effect,
    fundId: GENERAL_FUND_ID,
    memo,
  });
  // Three parts, each unchanged by what doesn't concern it: the expense on
  // the approval day; the money out on each payment's day; and the claim as
  // payable, raised on the approval day and cleared on each payment's day,
  // so the books balance on every day in between. A payment before the
  // approval leaves the payable negative in between (an advance to the
  // claimant).
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
        economicOn: cashOn,
        entries: [],
        movements: cash.movements,
      },
      {
        action: POSTING_ACTIONS.settle,
        economicOn: day,
        entries: [
          payable("increase", totalPaise, day),
          ...cash.movements.map((m) =>
            payable("decrease", m.amountPaise, m.occurredOn ?? cashOn)
          ),
        ],
        movements: [],
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
   * The request's approved payments whose money left from the cutover (by
   * their matched bank debits, else their date): the supplier advance the
   * accepted invoice clears.
   */
  paidPaise: number;
  /**
   * Why one of its approved payments can't post yet (its bank debits on
   * both sides of the cutover, or more than it): its advance isn't booked,
   * so the invoice waits rather than clear what was never advanced.
   */
  paymentWaiting: LedgerWaitReason | null;
  /**
   * By provision head: what this invoice may clear of it, from
   * `allocateProvision` (absent means nothing). Its lines charged to the
   * provision take it in line order; the rest of them is expense.
   */
  provisionAvailablePaise: Readonly<Record<string, number>>;
  status: string;
  title: string;
  /** The vendor's party (a vendor is a party with the vendor role). */
  vendorId: string;
  /** The void day in India, once voided. */
  voidedOn: string | null;
}

// ── Provisions a vendor invoice clears ──────────────────────────────────────

/**
 * A provision movement no clearing invoice makes: the opening balances,
 * the audited figures (a new provision, a write-back), and a voided
 * invoice's posting with its reversal on the void day (final, so read from
 * the books).
 */
export interface ProvisionBaseEntry {
  economicOn: string;
  /**
   * The financial year it is a provision for, such as "2025-26"; null for
   * a voided invoice's entries, which net to nothing once reversed.
   */
  forYear: string | null;
  /**
   * From the audited figures: a difference to the CA's figure, not a
   * provision of its own year, so the years it is from can't be told.
   */
  fromAudited?: true;
  /** Positive raises the provision, negative lowers it. */
  signedPaise: number;
}

/** A standing, accepted invoice whose lines are charged to the provision. */
export interface ProvisionClaim {
  /** What its lines charged to the provision add up to. */
  claimPaise: number;
  id: string;
  /** The day it posts on (`invoiceAcceptedDay`). */
  on: string;
}

const claimOrder = (a: ProvisionClaim, b: ProvisionClaim) =>
  a.on.localeCompare(b.on) || a.id.localeCompare(b.id);

const baseOn = (base: readonly ProvisionBaseEntry[], day: string) =>
  base.reduce((sum, e) => (e.economicOn <= day ? sum + e.signedPaise : sum), 0);

/**
 * What each clearing invoice takes of a provision: in posting date order,
 * then by ID, each takes what is outstanding on its day (the base entries
 * dated up to it, less what earlier invoices took), up to its own claim.
 * An earlier invoice always comes first, and the result is a function of
 * the records alone: never of which invoice the posting run looked at
 * first, nor of what other invoices' postings stand at the moment.
 */
export function allocateProvision(
  base: readonly ProvisionBaseEntry[],
  claims: readonly ProvisionClaim[]
): Map<string, number> {
  const taken = new Map<string, number>();
  let takenPaise = 0;
  for (const claim of [...claims].sort(claimOrder)) {
    const outstanding = Math.max(0, baseOn(base, claim.on) - takenPaise);
    const take = Math.min(Math.max(0, claim.claimPaise), outstanding);
    taken.set(claim.id, take);
    takenPaise += take;
  }
  return taken;
}

/**
 * What is outstanding of a provision on a day for a new invoice that would
 * post then (ordered after every claim dated up to that day), and the
 * financial years it is a provision for: increases are used oldest first,
 * so the years are those of the increases not yet used up.
 */
export function provisionOutstanding(
  base: readonly ProvisionBaseEntry[],
  claims: readonly ProvisionClaim[],
  day: string
): { paise: number; years: string[] } {
  const earlier = claims.filter((c) => c.on <= day);
  const takenPaise = [...allocateProvision(base, earlier).values()].reduce(
    (sum, p) => sum + p,
    0
  );
  const dated = base.filter((e) => e.economicOn <= day);
  const paise = Math.max(
    0,
    dated.reduce((sum, e) => sum + e.signedPaise, 0) - takenPaise
  );
  // An audited figures entry posts the difference to the CA's figure, so
  // which years the rest is from can't be told: the amount alone.
  if (paise === 0 || base.some((e) => e.fromAudited)) {
    return { paise, years: [] };
  }
  // Increases are used up oldest first, by every decrease and claim. A
  // voided invoice's entries net to nothing by the void day, so they are
  // left out.
  const own = dated.filter((e) => e.forYear !== null);
  let used =
    takenPaise -
    own.reduce((sum, e) => (e.signedPaise < 0 ? sum + e.signedPaise : sum), 0);
  const years: string[] = [];
  const increases = own
    .filter((e) => e.signedPaise > 0)
    .sort((a, b) => a.economicOn.localeCompare(b.economicOn));
  for (const e of increases) {
    const left = e.signedPaise - Math.min(used, e.signedPaise);
    used = Math.max(0, used - e.signedPaise);
    if (left > 0 && e.forYear && !years.includes(e.forYear)) {
      years.push(e.forYear);
    }
  }
  return { paise, years };
}

/**
 * An invoice's entries: each line's expense under its category's head, or
 * for a line charged to a provision, a decrease of the provision by what
 * is still available to this invoice (in line order) and the rest as
 * expense under the provision's expense head. Still one target per line:
 * the split is the books' arithmetic, not a second choice. The provision
 * decrease carries the vendor and the General Fund (where the provision
 * was raised) but no programme or cost centre: it is not spending of the
 * year. Null when a line has no head, or names a head that is not a
 * provision.
 */
function vendorInvoiceEntries(vp: VendorPaymentFacts): EntryInput[] | null {
  const plain = vp.lines.filter((l) => !l.provisionHeadId);
  const entries = expenseEntries(plain, vp.charge, vp.vendorId, vp.title);
  if (!entries) {
    return null;
  }
  const dims = dimensionsOf(vp.charge, vp.vendorId);
  const left = new Map(Object.entries(vp.provisionAvailablePaise));
  for (const line of vp.lines) {
    if (!line.provisionHeadId || line.amountPaise <= 0) {
      continue;
    }
    const provision = provisionHeadOf(line.provisionHeadId);
    if (!provision) {
      return null;
    }
    const memo = line.description?.trim() || vp.title;
    const cleared = Math.min(
      line.amountPaise,
      Math.max(0, left.get(provision.id) ?? 0)
    );
    left.set(provision.id, (left.get(provision.id) ?? 0) - cleared);
    if (cleared > 0) {
      entries.push({
        accountHeadId: provision.id,
        amountPaise: cleared,
        effect: "decrease",
        fundId: GENERAL_FUND_ID,
        memo,
        partyId: vp.vendorId,
        sourceLineId: line.id,
      });
    }
    if (line.amountPaise > cleared) {
      entries.push({
        ...dims,
        accountHeadId: provision.excessHeadId,
        amountPaise: line.amountPaise - cleared,
        effect: "increase",
        memo,
        sourceLineId: line.id,
      });
    }
  }
  return entries;
}

/** What a request's lines charged to each provision add up to. */
export function provisionClaimsOf(
  lines: readonly Pick<ExpenseLineFacts, "amountPaise" | "provisionHeadId">[]
): Map<string, number> {
  const claims = new Map<string, number>();
  for (const line of lines) {
    if (line.provisionHeadId && line.amountPaise > 0) {
      claims.set(
        line.provisionHeadId,
        (claims.get(line.provisionHeadId) ?? 0) + line.amountPaise
      );
    }
  }
  return claims;
}

/** The day an accepted invoice is recognised: its approval day, else its date. */
export const invoiceAcceptedDay = (
  vp: Pick<VendorPaymentFacts, "acceptedOn" | "invoiceDate">
): string | null => vp.acceptedOn ?? vp.invoiceDate;

export function vendorPaymentPlan(vp: VendorPaymentFacts | null): SourcePlan {
  if (!vp) {
    return none(LEDGER_SKIP_REASONS.deleted);
  }
  if (vp.voidedOn) {
    return voided(vp.voidedOn);
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
  const entries = vendorInvoiceEntries(vp);
  if (!entries) {
    return wait(day, LEDGER_WAIT_REASONS.referenceDataMissing);
  }
  if (entries.length === 0) {
    return none(LEDGER_SKIP_REASONS.invoiceNotAccepted);
  }
  if (vp.paymentWaiting) {
    return waitOnMoney(day, vp.paymentWaiting);
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
  // The invoice's amount: every line, whether expense or provision cleared.
  const expensePaise = vp.lines.reduce(
    (sum, l) => sum + Math.max(0, l.amountPaise),
    0
  );
  // What stands is kept: the invoice moves no money, and its expense with
  // the advance it cleared (now partly unpaid) is still the right position.
  if (expensePaise > vp.paidPaise) {
    return wait(day, LEDGER_WAIT_REASONS.invoiceExceedsPayments);
  }
  entries.push({
    accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
    amountPaise: expensePaise,
    costCentreId: vp.charge.costCentreId,
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
  /** Its request's cost centre (`requestCostCentreId`). */
  costCentreId: string | null;
  id: string;
  /** Bank debits matched to it (layer 3-3b). */
  matches: BankMatchFacts[];
  /** The payment's date in India. */
  paidOn: string;
  paymentReference: string | null;
  requestStatus: string;
  status: string;
  title: string;
  vendorId: string;
  /** The void day in India of the payment, else of its request. */
  voidedOn: string | null;
}

export function vendorPaymentTransactionPlan(
  payment: VendorPaymentTransactionFacts | null
): SourcePlan {
  if (!payment) {
    return none(LEDGER_SKIP_REASONS.deleted);
  }
  if (payment.voidedOn) {
    return voided(payment.voidedOn);
  }
  if (
    payment.status !== "approved" ||
    !PAYABLE_REQUEST_STATUSES.includes(payment.requestStatus)
  ) {
    return none(LEDGER_SKIP_REASONS.notApproved);
  }
  if (payment.amountPaise <= 0) {
    return none(LEDGER_SKIP_REASONS.notApproved);
  }
  const timing = paymentTiming({
    defaultOn: payment.paidOn,
    matches: payment.matches,
    totalPaise: payment.amountPaise,
  });
  if (timing.kind === "before") {
    return none(LEDGER_SKIP_REASONS.beforeCutover);
  }
  const waiting = timingWait(timing);
  if (waiting) {
    return waitOnMoney(payment.paidOn, waiting);
  }
  const cash = paymentMovements({
    defaultAccountId: payingAccount(payment),
    defaultOn: payment.paidOn,
    matches: payment.matches,
    movement: {
      direction: "out",
      kind: "payout",
      memo: payment.title,
      paymentReference: payment.paymentReference,
    },
    totalPaise: payment.amountPaise,
  });
  if (cash.kind === "wait") {
    return waitOnMoney(payment.paidOn, cash.reason);
  }
  const cashOn = cashDayOf(cash.movements, payment.paidOn);
  // The supplier advance rises on the day the money left (each matched
  // debit's), in its own part, so an unchanged payment compares equal and
  // moving the money to its debit moves the advance with it.
  return {
    attention: 0,
    economicOn: cashOn,
    kind: "post",
    parts: [
      {
        action: POSTING_ACTIONS.recognise,
        economicOn: cashOn,
        entries: cash.movements.map((m) => ({
          accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.supplierAdvances,
          amountPaise: m.amountPaise,
          costCentreId: payment.costCentreId,
          economicOn: m.occurredOn ?? cashOn,
          effect: "increase" as const,
          fundId: GENERAL_FUND_ID,
          memo: payment.title,
          partyId: payment.vendorId,
        })),
        movements: [],
      },
      {
        action: POSTING_ACTIONS.cash,
        economicOn: cashOn,
        entries: [],
        movements: cash.movements,
      },
    ],
  };
}

// ── Bank charges and taxes on a bank debit ──────────────────────────────────

export interface StatementChargeFacts {
  /** The live bank charges on the line (zero when none). */
  bankChargesPaise: number;
  id: string;
  orgAccountId: string;
  /** The live tax or government fee payment on the line. */
  taxPaise: number;
  valueOn: string;
}

/**
 * A bank debit marked as bank charges or a tax payment (layer 3-3b): money
 * out with no document behind it, so the line itself is the source. "Bank
 * charges" is an expense under its reference head; a tax payment is an
 * expense under "Taxes and government fees", noted for the CA (the trust
 * deducts no TDS, so it is not the TDS remittance of the cutover table).
 * The money leaves the line's account on its value date (`fee` and
 * `tax_remittance`), reconciled to the line. General Fund, no programme.
 * A line before the cutover is evidence only.
 */
export function statementChargePlan(
  line: StatementChargeFacts | null
): SourcePlan {
  if (!line) {
    return none(LEDGER_SKIP_REASONS.deleted);
  }
  if (line.bankChargesPaise <= 0 && line.taxPaise <= 0) {
    return none(LEDGER_SKIP_REASONS.unmatched);
  }
  if (line.valueOn < LEDGER_CUTOVER_ON) {
    return none(LEDGER_SKIP_REASONS.beforeCutover);
  }
  const day = line.valueOn;
  const parts = [
    {
      amountPaise: line.bankChargesPaise,
      headId: LEDGER_ACCOUNT_HEAD_IDS.bankCharges,
      kind: "fee" as const,
      memo: "Bank charges",
    },
    {
      amountPaise: line.taxPaise,
      headId: LEDGER_ACCOUNT_HEAD_IDS.taxesAndFees,
      kind: "tax_remittance" as const,
      memo: "Tax or government fee",
    },
  ].filter((p) => p.amountPaise > 0);
  // One part: the expense and the money out on the same day, so it
  // balances on its own.
  return {
    attention: 0,
    economicOn: day,
    kind: "post",
    parts: [
      {
        action: POSTING_ACTIONS.cash,
        economicOn: day,
        entries: parts.map((p) => ({
          accountHeadId: p.headId,
          amountPaise: p.amountPaise,
          effect: "increase" as const,
          fundId: GENERAL_FUND_ID,
          memo: p.memo,
        })),
        movements: parts.map((p) => ({
          amountPaise: p.amountPaise,
          bankValueOn: day,
          direction: "out" as const,
          kind: p.kind,
          memo: p.memo,
          occurredOn: day,
          orgAccountId: line.orgAccountId,
          statementLineId: line.id,
        })),
      },
    ],
  };
}
