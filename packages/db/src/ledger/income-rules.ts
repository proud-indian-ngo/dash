import {
  CORPUS_FUND_ID,
  GENERAL_FUND_ID,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import {
  LEDGER_CUTOVER_ON,
  LEDGER_SKIP_REASONS,
  LEDGER_WAIT_REASONS,
  type LedgerSkipReason,
  type LedgerWaitReason,
  POSTING_ACTIONS,
} from "@pi-dash/shared/ledger";

import type { EntryInput, MovementInput } from "./rules";

/**
 * Income posting rules (finance Phase 3, layer 3-2), in plain functions of
 * a source's facts. Every rule the chartered accountant may change lives in
 * this one module, so a change is a one-place edit:
 *
 * - Gateway gifts (Razorpay, give.do) are income on the donor's payment
 *   date at the full amount; the money goes into the gateway's clearing
 *   account. Razorpay's fee and GST are an expense at the gift; give.do's
 *   charges are an expense when the payout file reports them.
 * - Direct gifts (UPI, NEFT, cheque, and cash should it ever occur) are
 *   income into the account they were deposited in.
 * - A corpus gift (donation type corpus: the donor's written direction
 *   that it form part of the corpus) is a capital receipt: it is credited
 *   straight to the Corpus Fund under `Corpus donations`, never income, so
 *   it stays out of the year's surplus; the type decides the fund, even for
 *   a gift recorded against another. Its gateway charges are General Fund
 *   expenditure, so the Corpus Fund keeps the gross the donor gave, and a
 *   refund reduces the Corpus Fund. (Founder decision, 16 October 2026.)
 * - In-kind gifts are in-kind income and an equal in-kind consumption
 *   expense, with no money movement (first release: in-kind as consumed).
 * - A refund reduces donation income with the gift's dimensions and takes
 *   the money out of the gift's account (clearing for gateway gifts).
 * - Other income is FD interest (kind interest, or anything credited to a
 *   fixed deposit) or other income, into its account.
 * - A processed gateway payout is a transfer of the net amount out of
 *   clearing into the bank, on the day it reached the bank (the matched
 *   bank line's date, else the settlement date), into the matched line's
 *   account, else the account it was already posted to, else the only
 *   active bank account; an instant settlement fee is an expense, and so
 *   are a Razorpay line's charges when its gift was recorded with none.
 * - A bank line marked as a transfer between own accounts posts both legs
 *   once the other account is picked; between two bank accounts, from the
 *   side marked first.
 * - Cutover: nothing dated before 1 April 2026 posts, except a gateway gift
 *   captured earlier whose payout reached the bank on or after it: that
 *   gift posts as FY 2026-27 income on the payout's bank day, so the
 *   clearing account opens and stays at zero (founder answer, CA to
 *   confirm). A refund of such a gift made before 1 April that the same
 *   kind of payout took back posts on that payout's bank day too, for the
 *   same reason: the audited balance sheet holds no gateway balance at 31
 *   March 2026 (founder rule, CA to confirm).
 *
 * No TDS and no cash handling: the trust deducts none and keeps no cash.
 * Every source posts in up to two parts: `recognise` (income and expense
 * entries) and `cash` (movements). A change that touches only the
 * recognition (programme, project, fund, donor, donation type) reverses and
 * reposts that part alone, so a classification correction never moves money.
 */

export const GATEWAY_CHANNELS: readonly string[] = ["razorpay", "give_do"];

/**
 * Bumped when a rule changes how sources already posted should stand, so
 * the next posting run looks at every source once (`postPendingIncome`),
 * not only those whose records changed. 1: corpus gifts credit the Corpus
 * Fund directly and their gateway charges are General Fund expenditure.
 * 2 (layer 3-3b): each reimbursement gains a `settle` part ("Claims
 * payable" raised on approval, cleared on each payment's day); its expense
 * and money parts, and every vendor payment, compare equal and stay.
 * 3 (cost centres): expense and payment entries of reimbursements, vendor
 * payments and their payments carry the document's cost centre, so their
 * entries-bearing parts reverse and repost once (money parts compare equal
 * and stay; sources in a closed or matched year wait and stand as they are).
 */
export const INCOME_RULES_VERSION = 3;

/** The entries and movements of one part of a source's posting. */
export interface PlanPart {
  action: string;
  economicOn: string;
  entries: EntryInput[];
  movements: MovementInput[];
}

export type SourcePlan =
  /** Nothing should stand in the books for it; anything standing is reversed. */
  | {
      kind: "none";
      reason: LedgerSkipReason;
      /**
       * Reverse what stands on this day rather than on its own dates: a
       * voided request is undone from the void day.
       */
      reverseOn?: string;
    }
  /**
   * It should post but can't yet; whatever stands is left alone, unless
   * `reverseStanding`: the wait comes from its bank matches (layer 3-3b),
   * so what stands may count bank money a line no longer pays, or money
   * the opening balances already hold, and it is reversed while it waits.
   */
  | {
      economicOn: string | null;
      kind: "wait";
      reason: LedgerWaitReason;
      reverseStanding?: boolean;
    }
  | {
      /** Settlement lines the books can't use, for a person to look at. */
      attention: number;
      economicOn: string;
      kind: "post";
      parts: PlanPart[];
    };

const none = (reason: LedgerSkipReason): SourcePlan => ({
  kind: "none",
  reason,
});

/** Drops empty parts; a source with nothing left posts nothing. */
function post(
  economicOn: string,
  parts: PlanPart[],
  attention = 0
): SourcePlan {
  const kept = parts.filter(
    (p) => p.entries.length > 0 || p.movements.length > 0
  );
  return { attention, economicOn, kind: "post", parts: kept };
}

/** The heads the rules post under, for the reference data check. */
export function headsOf(plan: SourcePlan): string[] {
  if (plan.kind !== "post") {
    return [];
  }
  return [
    ...new Set(
      plan.parts.flatMap((p) => p.entries.map((e) => e.accountHeadId))
    ),
  ];
}

// ── Contributions ───────────────────────────────────────────────────────────

/**
 * Statuses of a gift whose receipt posts. Pending gifts haven't arrived and
 * reversed ones were taken back, so neither posts (as `countsAsReceived`
 * leaves them out of income). A refunded gift posts its receipt; its
 * refunds post separately.
 */
const RECEIVED_STATUSES: readonly string[] = [
  "received",
  "receipted",
  "refunded",
];

export interface GiftDimensions {
  /** The corpus type makes the gift a capital receipt of the Corpus Fund. */
  donationType: string;
  fundId: string;
  partyId: string;
  programmeId: string | null;
  projectId: string | null;
}

export interface ContributionFacts extends GiftDimensions {
  amountPaise: number;
  channel: string;
  gatewayFeePaise: number;
  gatewayTaxPaise: number;
  id: string;
  orgAccountId: string | null;
  receivedOn: string;
  reference: string | null;
  /**
   * The earliest day a processed payout that settled this gift reached the
   * bank, for the cutover exception; null when no processed payout has.
   */
  settledBankOn: string | null;
  status: string;
}

/** A corpus gift: a capital receipt, credited straight to the Corpus Fund. */
export const isCorpusGift = (gift: Pick<GiftDimensions, "donationType">) =>
  gift.donationType === "corpus";

/** The gift's dimensions; a corpus gift is always the Corpus Fund's. */
const dimensionsOf = (gift: GiftDimensions) => ({
  fundId: isCorpusGift(gift) ? CORPUS_FUND_ID : gift.fundId,
  partyId: gift.partyId,
  programmeId: gift.programmeId,
  projectId: gift.projectId,
});

/** Where a money gift (and its refund) is credited: corpus or income. */
const giftHeadOf = (gift: GiftDimensions) =>
  isCorpusGift(gift)
    ? LEDGER_ACCOUNT_HEAD_IDS.corpusDonations
    : LEDGER_ACCOUNT_HEAD_IDS.donationsReceived;

/**
 * The dimensions of a gift's gateway charges: the gift's, except that a
 * corpus gift's charges are General Fund expenditure, so the Corpus Fund
 * keeps the gross amount the donor gave.
 */
const chargeDimensionsOf = (gift: GiftDimensions) => ({
  ...dimensionsOf(gift),
  ...(isCorpusGift(gift) && { fundId: GENERAL_FUND_ID }),
});

/**
 * The day a gift posts on: its received date, or for a gateway gift
 * captured before the cutover, the day its payout reached the bank when
 * that is on or after the cutover. Null when it doesn't post.
 */
export function contributionPostingDay(
  gift: Pick<ContributionFacts, "channel" | "receivedOn" | "settledBankOn">
): string | null {
  if (gift.receivedOn >= LEDGER_CUTOVER_ON) {
    return gift.receivedOn;
  }
  if (
    GATEWAY_CHANNELS.includes(gift.channel) &&
    gift.settledBankOn !== null &&
    gift.settledBankOn >= LEDGER_CUTOVER_ON
  ) {
    return gift.settledBankOn;
  }
  return null;
}

export function contributionPlan(gift: ContributionFacts | null): SourcePlan {
  if (!gift) {
    return none(LEDGER_SKIP_REASONS.deleted);
  }
  if (!RECEIVED_STATUSES.includes(gift.status)) {
    return none(LEDGER_SKIP_REASONS.notReceived);
  }
  const day = contributionPostingDay(gift);
  if (!day) {
    return none(LEDGER_SKIP_REASONS.beforeCutover);
  }
  const dims = dimensionsOf(gift);

  if (gift.channel === "in_kind") {
    return post(day, [
      {
        action: POSTING_ACTIONS.recognise,
        economicOn: day,
        entries: [
          {
            ...dims,
            accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.inKindDonations,
            amountPaise: gift.amountPaise,
            effect: "increase",
            medium: "in_kind",
          },
          {
            ...dims,
            accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.inKindConsumed,
            amountPaise: gift.amountPaise,
            effect: "increase",
            medium: "in_kind",
          },
        ],
        movements: [],
      },
    ]);
  }

  if (!gift.orgAccountId) {
    // The database refuses a money gift without an account; nothing to post.
    return none(LEDGER_SKIP_REASONS.notReceived);
  }
  const entries: EntryInput[] = [
    {
      ...dims,
      accountHeadId: giftHeadOf(gift),
      amountPaise: gift.amountPaise,
      effect: "increase",
    },
  ];
  const movements: MovementInput[] = [
    {
      amountPaise: gift.amountPaise,
      direction: "in",
      kind: "receipt",
      orgAccountId: gift.orgAccountId,
      paymentReference: gift.reference,
    },
  ];
  // Razorpay reports its fee and GST with the payment. give.do's charges
  // arrive with its payout file and post with the payout, so a fee filled
  // on a give.do gift from that file is not posted again here.
  const chargesPaise = gift.gatewayFeePaise + gift.gatewayTaxPaise;
  if (gift.channel === "razorpay" && chargesPaise > 0) {
    entries.push({
      ...chargeDimensionsOf(gift),
      accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.gatewayCharges,
      amountPaise: chargesPaise,
      effect: "increase",
      memo: "Razorpay fee and GST",
    });
    movements.push({
      amountPaise: chargesPaise,
      direction: "out",
      kind: "fee",
      memo: "Razorpay fee and GST",
      orgAccountId: gift.orgAccountId,
      paymentReference: gift.reference,
    });
  }
  return post(day, [
    {
      action: POSTING_ACTIONS.recognise,
      economicOn: day,
      entries,
      movements: [],
    },
    { action: POSTING_ACTIONS.cash, economicOn: day, entries: [], movements },
  ]);
}

// ── Refunds ─────────────────────────────────────────────────────────────────

export interface RefundFacts {
  amountPaise: number;
  gift: Pick<ContributionFacts, "channel" | "orgAccountId"> & GiftDimensions;
  id: string;
  reference: string | null;
  refundedOn: string;
  /**
   * The earliest day a processed payout that took this refund back reached
   * the bank, for the cutover exception; null when none has.
   */
  settledBankOn: string | null;
}

/**
 * The day a refund posts on: its own date from the cutover, even for a
 * gift received before it (a reduction of FY 2026-27 income; CA proposal);
 * or, for a gateway refund made before the cutover, the bank day of the
 * payout that took it back when that is on or after the cutover (mirrors
 * the gift's exception; CA to confirm). Null when it doesn't post.
 */
export function refundPostingDay(
  refund: Pick<RefundFacts, "gift" | "refundedOn" | "settledBankOn">
): string | null {
  if (refund.refundedOn >= LEDGER_CUTOVER_ON) {
    return refund.refundedOn;
  }
  if (
    GATEWAY_CHANNELS.includes(refund.gift.channel) &&
    refund.settledBankOn !== null &&
    refund.settledBankOn >= LEDGER_CUTOVER_ON
  ) {
    return refund.settledBankOn;
  }
  return null;
}

export function refundPlan(refund: RefundFacts | null): SourcePlan {
  if (!refund) {
    return none(LEDGER_SKIP_REASONS.deleted);
  }
  const day = refundPostingDay(refund);
  if (!day) {
    return none(LEDGER_SKIP_REASONS.beforeCutover);
  }
  const { gift } = refund;
  if (gift.channel === "in_kind" || !gift.orgAccountId) {
    return none(LEDGER_SKIP_REASONS.notReceived);
  }
  return post(day, [
    {
      action: POSTING_ACTIONS.recognise,
      economicOn: day,
      entries: [
        {
          ...dimensionsOf(gift),
          accountHeadId: giftHeadOf(gift),
          amountPaise: refund.amountPaise,
          effect: "decrease",
          memo: "Refund",
        },
      ],
      movements: [],
    },
    {
      action: POSTING_ACTIONS.cash,
      economicOn: day,
      entries: [],
      movements: [
        {
          amountPaise: refund.amountPaise,
          direction: "out",
          kind: "refund",
          orgAccountId: gift.orgAccountId,
          paymentReference: refund.reference,
        },
      ],
    },
  ]);
}

// ── Other income ────────────────────────────────────────────────────────────

export interface OtherIncomeFacts {
  /** The kind of account it was received into. */
  accountKind: string;
  amountPaise: number;
  fundId: string;
  id: string;
  kind: string;
  orgAccountId: string;
  receivedOn: string;
}

/** FD interest for interest or anything credited to a fixed deposit; other income otherwise. */
export function otherIncomeHead(
  income: Pick<OtherIncomeFacts, "accountKind" | "kind">
): string {
  return income.kind === "interest" || income.accountKind === "deposit"
    ? LEDGER_ACCOUNT_HEAD_IDS.fdInterest
    : LEDGER_ACCOUNT_HEAD_IDS.otherIncome;
}

export function otherIncomePlan(income: OtherIncomeFacts | null): SourcePlan {
  if (!income) {
    return none(LEDGER_SKIP_REASONS.deleted);
  }
  if (income.receivedOn < LEDGER_CUTOVER_ON) {
    return none(LEDGER_SKIP_REASONS.beforeCutover);
  }
  const day = income.receivedOn;
  return post(day, [
    {
      action: POSTING_ACTIONS.recognise,
      economicOn: day,
      entries: [
        {
          accountHeadId: otherIncomeHead(income),
          amountPaise: income.amountPaise,
          effect: "increase",
          fundId: income.fundId,
        },
      ],
      movements: [],
    },
    {
      action: POSTING_ACTIONS.cash,
      economicOn: day,
      entries: [],
      movements: [
        {
          amountPaise: income.amountPaise,
          direction: "in",
          kind: "receipt",
          orgAccountId: income.orgAccountId,
        },
      ],
    },
  ]);
}

// ── Gateway settlements ─────────────────────────────────────────────────────

export interface SettlementItemFacts {
  /** The linked gift's dimensions; null when the line is linked to no gift. */
  gift: GiftDimensions | null;
  /** Fee plus GST recorded on the linked gift itself (Razorpay posts it there). */
  giftChargesPaise: number;
  feePaise: number;
  /** Linked to a recorded refund. */
  refundLinked: boolean;
  taxPaise: number;
  type: string;
}

export interface SettlementFacts {
  /** Active bank accounts, for a payout whose bank line isn't matched. */
  activeBankAccountIds: string[];
  amountPaise: number;
  /** The bank statement line matched to it, if any. */
  bankLine: { orgAccountId: string; valueOn: string } | null;
  /** The clearing account it paid out of. */
  clearingAccountId: string | null;
  id: string;
  items: SettlementItemFacts[];
  /**
   * The bank account its standing posting paid into, if posted: kept when
   * no bank line is matched, so adding a bank account later doesn't move
   * or hold up payouts already in the books.
   */
  postedBankAccountId: string | null;
  provider: string;
  settledOn: string;
  settlementFeePaise: number | null;
  settlementTaxPaise: number | null;
  status: string;
  utr: string | null;
}

/** The day a payout reached the bank: its matched bank line's date, else its settlement date. */
export const settlementBankDay = (
  settlement: Pick<SettlementFacts, "bankLine" | "settledOn">
): string => settlement.bankLine?.valueOn ?? settlement.settledOn;

/** Lines the books can't use: adjustments, transfers and lines linked to no gift or refund. */
export function settlementAttention(items: readonly SettlementItemFacts[]) {
  return items.filter((item) => {
    if (item.type === "payment") {
      return item.gift === null;
    }
    if (item.type === "refund") {
      return !item.refundLinked;
    }
    return true;
  }).length;
}

export function settlementPlan(settlement: SettlementFacts | null): SourcePlan {
  if (!settlement) {
    return none(LEDGER_SKIP_REASONS.deleted);
  }
  if (settlement.status !== "processed") {
    return none(LEDGER_SKIP_REASONS.notProcessed);
  }
  const day = settlementBankDay(settlement);
  if (day < LEDGER_CUTOVER_ON) {
    return none(LEDGER_SKIP_REASONS.beforeCutover);
  }
  const clearing = settlement.clearingAccountId;
  if (!clearing) {
    return {
      economicOn: day,
      kind: "wait",
      reason: LEDGER_WAIT_REASONS.noClearingAccount,
    };
  }
  const bank =
    settlement.bankLine?.orgAccountId ??
    settlement.postedBankAccountId ??
    (settlement.activeBankAccountIds.length === 1
      ? settlement.activeBankAccountIds[0]
      : null);
  if (!bank) {
    return {
      economicOn: day,
      kind: "wait",
      reason: LEDGER_WAIT_REASONS.noBankAccount,
    };
  }

  const provider = settlement.provider === "give_do" ? "give.do" : "Razorpay";
  const entries: EntryInput[] = [];
  const movements: MovementInput[] = [];
  if (settlement.amountPaise > 0) {
    movements.push(
      {
        amountPaise: settlement.amountPaise,
        direction: "out",
        kind: "transfer",
        orgAccountId: clearing,
        paymentReference: settlement.utr,
        transferId: settlement.id,
      },
      {
        amountPaise: settlement.amountPaise,
        direction: "in",
        kind: "transfer",
        orgAccountId: bank,
        paymentReference: settlement.utr,
        transferId: settlement.id,
      }
    );
  }
  // Razorpay's fee on an instant settlement, taken on top of its lines' fees.
  const payoutFeePaise =
    (settlement.settlementFeePaise ?? 0) + (settlement.settlementTaxPaise ?? 0);
  if (payoutFeePaise > 0) {
    entries.push({
      accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.gatewayCharges,
      amountPaise: payoutFeePaise,
      effect: "increase",
      fundId: GENERAL_FUND_ID,
      memo: `${provider} instant settlement fee and GST`,
    });
    movements.push({
      amountPaise: payoutFeePaise,
      direction: "out",
      kind: "fee",
      memo: `${provider} instant settlement fee and GST`,
      orgAccountId: clearing,
      paymentReference: settlement.utr,
    });
  }
  // give.do reports its charges per gift in the payout file only, so they
  // post here. Razorpay's post at the gift, except for a gift recorded with
  // no fee (one recorded by hand and linked to its payment later): its
  // charges post here from the payout's line, so clearing still nets to zero.
  for (const item of settlement.items) {
    const chargesPaise = item.feePaise + item.taxPaise;
    if (item.type !== "payment" || !item.gift || chargesPaise <= 0) {
      continue;
    }
    if (settlement.provider !== "give_do" && item.giftChargesPaise > 0) {
      continue;
    }
    const memo = `${provider} charges`;
    entries.push({
      ...chargeDimensionsOf(item.gift),
      accountHeadId: LEDGER_ACCOUNT_HEAD_IDS.gatewayCharges,
      amountPaise: chargesPaise,
      effect: "increase",
      memo,
    });
    movements.push({
      amountPaise: chargesPaise,
      direction: "out",
      kind: "fee",
      memo,
      orgAccountId: clearing,
      paymentReference: settlement.utr,
    });
  }
  return post(
    day,
    [
      {
        action: POSTING_ACTIONS.recognise,
        economicOn: day,
        entries,
        movements: [],
      },
      { action: POSTING_ACTIONS.cash, economicOn: day, entries: [], movements },
    ],
    settlementAttention(settlement.items)
  );
}

// ── Transfers between own accounts ──────────────────────────────────────────

export interface StatementTransferFacts {
  amountPaise: number;
  direction: "credit" | "debit";
  id: string;
  /** Still matched as a transfer. */
  isTransfer: boolean;
  /**
   * The other bank account's own line for the same transfer, paired with
   * this one when the second side was marked (one-to-one), and whether this
   * line was marked first: only the first-marked side posts.
   */
  counterpart: { thisMarkedFirst: boolean } | null;
  orgAccountId: string;
  /** The other account and its kind, once picked. */
  other: { id: string; kind: string } | null;
  reference: string | null;
  valueOn: string;
}

/**
 * Both legs of a transfer between the trust's own accounts, from the bank
 * line marked as one, once the other account is picked. Between two bank
 * accounts, each with its own statement, both lines may be marked: only
 * the one marked first posts (either side), so the pair posts once; a line
 * whose counterpart isn't marked posts on its own.
 */
export function statementTransferPlan(
  line: StatementTransferFacts | null
): SourcePlan {
  if (!line) {
    return none(LEDGER_SKIP_REASONS.deleted);
  }
  if (!line.isTransfer) {
    return none(LEDGER_SKIP_REASONS.unmatched);
  }
  if (line.valueOn < LEDGER_CUTOVER_ON) {
    return none(LEDGER_SKIP_REASONS.beforeCutover);
  }
  if (!line.other) {
    return {
      economicOn: line.valueOn,
      kind: "wait",
      reason: LEDGER_WAIT_REASONS.noOtherAccount,
    };
  }
  if (line.counterpart && !line.counterpart.thisMarkedFirst) {
    return none(LEDGER_SKIP_REASONS.otherSidePosts);
  }
  const out = line.direction === "debit" ? line.orgAccountId : line.other.id;
  const into = line.direction === "debit" ? line.other.id : line.orgAccountId;
  const day = line.valueOn;
  const leg = {
    amountPaise: line.amountPaise,
    kind: "transfer" as const,
    paymentReference: line.reference,
    transferId: line.id,
  };
  return post(day, [
    {
      action: POSTING_ACTIONS.cash,
      economicOn: day,
      entries: [],
      movements: [
        { ...leg, direction: "out", orgAccountId: out },
        { ...leg, direction: "in", orgAccountId: into },
      ],
    },
  ]);
}
