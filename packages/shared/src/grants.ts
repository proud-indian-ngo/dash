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

/** The facts of a contribution that decide whether it can count towards a grant. */
export interface GrantLinkContribution {
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
 * and not be reversed.
 */
export function grantLinkIssue(
  gift: GrantLinkContribution,
  grant: GrantLinkTarget
): string | null {
  if (gift.status === "reversed") {
    return "A reversed contribution can't count towards a grant";
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

/** A contribution linked to a grant, net of its refunds (`GrantReceipt`). */
export interface GrantReceiptInput {
  contributionId: string;
  paise: number;
  receivedOn: string;
  reference: string | null;
  trancheId: string | null;
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
  /** Received before the range less spent before it. */
  broughtForwardPaise: number;
  /** Brought forward plus received less spent in the range. */
  closingPaise: number;
  /** One line per budgeted or spent head, budgeted heads first. */
  heads: GrantHeadLine[];
  /** Received within the range, oldest first. */
  received: GrantReceiptInput[];
  receivedPaise: number;
  spentPaise: number;
  /** The position at the end of the range, from the grant's start. */
  toDate: { receivedPaise: number; spentPaise: number; unspentPaise: number };
}

/**
 * A grant's utilisation for a range, GFR 12-A style: unspent brought
 * forward, received in the range (each contribution), spent in the range
 * by head, closing unspent. `from` null means from the start, so nothing
 * is brought forward. Receipts and spend must already end at the range's
 * end, as `loadGrantUtilisation` returns them.
 */
export function grantUtilisation(input: {
  budgetLines: readonly { accountHeadId: string; amountPaise: number }[];
  from: string | null;
  receipts: readonly GrantReceiptInput[];
  spend: readonly GrantSpendInput[];
}): GrantUtilisation {
  const { from } = input;
  const before = input.receipts.filter((r) => from && r.receivedOn < from);
  const received = input.receipts
    .filter((r) => !from || r.receivedOn >= from)
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));

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

  const receivedBefore = sum(before.map((r) => r.paise));
  const spentBefore = sum(
    input.spend.filter((s) => s.period === "before").map((s) => s.paise)
  );
  const receivedPaise = sum(received.map((r) => r.paise));
  const spentPaise = sum(heads.map((h) => h.periodPaise));
  const broughtForwardPaise = receivedBefore - spentBefore;
  const toDateReceived = receivedBefore + receivedPaise;
  const toDateSpent = spentBefore + spentPaise;
  return {
    broughtForwardPaise,
    closingPaise: broughtForwardPaise + receivedPaise - spentPaise,
    heads,
    received,
    receivedPaise,
    spentPaise,
    toDate: {
      receivedPaise: toDateReceived,
      spentPaise: toDateSpent,
      unspentPaise: toDateReceived - toDateSpent,
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
