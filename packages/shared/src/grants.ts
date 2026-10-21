import type { GrantStatus } from "./constants";
import { sumPaise as sum } from "./money";

/**
 * Grants (finance-grants.md): an agreement that funds one project, tracked
 * over existing income and expense and never posted. Pure: the grant comes
 * from Zero, received and spent money from the server
 * (`loadGrantUtilisation`), and these lay it out.
 */

export const GRANT_STATUS_LABELS: Record<GrantStatus, string> = {
  active: "Active",
  closed: "Closed",
};

/**
 * Statuses of a linked contribution whose money arrived: refunds of a
 * refunded one count separately, on their own dates.
 */
export const GRANT_RECEIPT_STATUSES = [
  "received",
  "receipted",
  "refunded",
] as const;

/** The facts of a contribution that decide whether it can count towards a grant. */
export interface GrantLinkContribution {
  channel: string;
  partyId: string;
  programmeId: string | null;
  projectId: string | null;
  status: string | null;
}

export interface GrantLinkTarget {
  partyId: string;
  programmeId: string;
  projectId: string;
}

/**
 * Why a contribution can't be linked to a grant, or null when it can: it
 * must come from the grantor, sit on the grant's programme and project,
 * be money (grants count cash, never in-kind gifts) and not be reversed.
 */
export function grantLinkIssue(
  gift: GrantLinkContribution,
  grant: GrantLinkTarget
): string | null {
  if (gift.status === "reversed") {
    return "A reversed contribution can't count towards a grant";
  }
  if (gift.channel === "in_kind") {
    return "An in-kind gift can't count towards a grant";
  }
  if (gift.partyId !== grant.partyId) {
    return "Only the grantor's contributions can count towards this grant";
  }
  if (
    gift.projectId !== grant.projectId ||
    gift.programmeId !== grant.programmeId
  ) {
    return "The contribution must be on the grant's programme and project";
  }
  return null;
}

/** A contribution linked to a grant, gross (`GrantReceipt`). */
export interface GrantReceiptInput {
  contributionId: string;
  paise: number;
  receivedOn: string;
  reference: string | null;
  trancheId: string | null;
}

/** A refund of a linked contribution, on its own date (`GrantRefund`). */
export interface GrantRefundInput {
  contributionId: string;
  paise: number;
  reference: string | null;
  refundedOn: string;
}

/** Spend on one head, before the range or within it (`GrantSpend`). */
export interface GrantSpendInput {
  accountHeadId: string;
  paise: number;
  period: "before" | "within";
}

export interface GrantHeadLine {
  accountHeadId: string;
  /** Null: no budget for this head. */
  budgetPaise: number | null;
  /** Spent within the range. */
  periodPaise: number;
  /** Spent from the grant's start to the end of the range. */
  toDatePaise: number;
}

export interface GrantUtilisation {
  /** Received less refunded less spent, before the range. */
  broughtForwardPaise: number;
  /** Brought forward plus received less refunded less spent in the range. */
  closingPaise: number;
  /** One line per budgeted or spent head, budgeted heads first. */
  heads: GrantHeadLine[];
  /** Received within the range, oldest first. */
  received: GrantReceiptInput[];
  receivedPaise: number;
  /** Refunded within the range, oldest first. */
  refunds: GrantRefundInput[];
  refundedPaise: number;
  spentPaise: number;
  /** The position at the end of the range, from the grant's start. */
  toDate: {
    receivedPaise: number;
    refundedPaise: number;
    spentPaise: number;
    unspentPaise: number;
  };
}

/**
 * A grant's utilisation for a range, GFR 12-A style: unspent brought
 * forward, received in the range (each contribution), refunded in the
 * range, spent in the range by head, closing unspent. Every figure is
 * dated, so one range's closing is the next range's brought forward and a
 * later refund never changes an earlier range. `from` null means from the
 * start, so nothing is brought forward. The inputs must already end at the
 * range's end, as `loadGrantUtilisation` returns them.
 */
export function grantUtilisation(input: {
  budgetLines: readonly { accountHeadId: string; amountPaise: number }[];
  from: string | null;
  receipts: readonly GrantReceiptInput[];
  refunds: readonly GrantRefundInput[];
  spend: readonly GrantSpendInput[];
}): GrantUtilisation {
  const { from } = input;
  const inRange = (day: string) => !from || day >= from;
  const received = input.receipts
    .filter((r) => inRange(r.receivedOn))
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));
  const refunds = input.refunds
    .filter((r) => inRange(r.refundedOn))
    .sort((a, b) => a.refundedOn.localeCompare(b.refundedOn));

  const byHead = new Map<string, GrantHeadLine>();
  for (const line of input.budgetLines) {
    byHead.set(line.accountHeadId, {
      accountHeadId: line.accountHeadId,
      budgetPaise: line.amountPaise,
      periodPaise: 0,
      toDatePaise: 0,
    });
  }
  for (const s of input.spend) {
    const head = byHead.get(s.accountHeadId) ?? {
      accountHeadId: s.accountHeadId,
      budgetPaise: null,
      periodPaise: 0,
      toDatePaise: 0,
    };
    head.toDatePaise += s.paise;
    if (s.period === "within") {
      head.periodPaise += s.paise;
    }
    byHead.set(s.accountHeadId, head);
  }
  const heads = [...byHead.values()].sort(
    (a, b) =>
      Number(a.budgetPaise === null) - Number(b.budgetPaise === null) ||
      b.toDatePaise - a.toDatePaise ||
      (b.budgetPaise ?? 0) - (a.budgetPaise ?? 0)
  );

  const totalReceived = sum(input.receipts.map((r) => r.paise));
  const totalRefunded = sum(input.refunds.map((r) => r.paise));
  const receivedPaise = sum(received.map((r) => r.paise));
  const refundedPaise = sum(refunds.map((r) => r.paise));
  const spentPaise = sum(heads.map((h) => h.periodPaise));
  const totalSpent = sum(heads.map((h) => h.toDatePaise));
  const broughtForwardPaise =
    totalReceived -
    receivedPaise -
    (totalRefunded - refundedPaise) -
    (totalSpent - spentPaise);
  return {
    broughtForwardPaise,
    closingPaise:
      broughtForwardPaise + receivedPaise - refundedPaise - spentPaise,
    heads,
    received,
    receivedPaise,
    refundedPaise,
    refunds,
    spentPaise,
    toDate: {
      receivedPaise: totalReceived,
      refundedPaise: totalRefunded,
      spentPaise: totalSpent,
      unspentPaise: totalReceived - totalRefunded - totalSpent,
    },
  };
}

export interface GrantTrancheInput {
  amountPaise: number;
  expectedOn: string;
  id: string;
  note: string | null;
}

export interface GrantTrancheLine extends GrantTrancheInput {
  receivedPaise: number;
}

/**
 * Expected tranches against the money linked to each, in date order, and
 * what arrived without a tranche.
 */
export function grantTranches(
  tranches: readonly GrantTrancheInput[],
  receipts: readonly Pick<GrantReceiptInput, "paise" | "trancheId">[]
): { tranches: GrantTrancheLine[]; unscheduledPaise: number } {
  const ids = new Set(tranches.map((t) => t.id));
  return {
    tranches: [...tranches]
      .sort((a, b) => a.expectedOn.localeCompare(b.expectedOn))
      .map((t) => ({
        ...t,
        receivedPaise: sum(
          receipts.filter((r) => r.trancheId === t.id).map((r) => r.paise)
        ),
      })),
    unscheduledPaise: sum(
      receipts
        .filter((r) => r.trancheId === null || !ids.has(r.trancheId))
        .map((r) => r.paise)
    ),
  };
}
