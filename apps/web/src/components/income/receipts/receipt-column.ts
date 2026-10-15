import type { ContributionChannel } from "@pi-dash/shared/constants";
import { epochDayToIso, refundedPaise } from "@pi-dash/shared/income";
import {
  type ReceiptBlock,
  type ReceiptColumnValue,
  receiptColumnSortKey,
  receiptColumnValueWithoutDonor,
} from "@pi-dash/shared/receipts";

import type { ContributionRow } from "../income-types";
import { liveReceipt } from "./receipt-types";

/** The server's split of open direct gifts, as sets for lookups. */
export interface ReceiptReadinessSets {
  /** Blocked by the gift itself, with the block codes for the tooltip. */
  cantIssue: ReadonlyMap<string, readonly ReceiptBlock[]>;
  needsDetails: ReadonlySet<string>;
  ready: ReadonlySet<string>;
}

/** The server's response as lookups. */
export function toReadinessSets(response: {
  cantIssue: { blocks: ReceiptBlock[]; id: string }[];
  needsDetails: string[];
  ready: string[];
}): ReceiptReadinessSets {
  return {
    cantIssue: new Map(
      response.cantIssue.map((entry) => [entry.id, entry.blocks])
    ),
    needsDetails: new Set(response.needsDetails),
    ready: new Set(response.ready),
  };
}

/**
 * A row's Receipt value. Everything but the ready/needs-details split comes
 * from synced data; that split comes from the server (`readiness`), and is
 * null until it has loaded or while the server hasn't classified the gift.
 */
export function contributionReceiptValue(
  row: ContributionRow,
  readiness: ReceiptReadinessSets | null
): ReceiptColumnValue | null {
  const local = receiptColumnValueWithoutDonor({
    amountPaise: row.amountPaise,
    channel: row.channel as ContributionChannel,
    currency: row.currency ?? "INR",
    deductionEligible: row.deductionEligible ?? "unknown",
    hasActiveReceipt: liveReceipt(row.receipts) !== null,
    partyId: row.partyId,
    receivedOn: epochDayToIso(row.receivedOn),
    refundedPaise: refundedPaise(row.refunds),
    reportingMode: row.reportingMode,
    status: row.status ?? "received",
  });
  if (local !== null || readiness === null) {
    return local;
  }
  if (readiness.ready.has(row.id)) {
    return "ready";
  }
  if (readiness.needsDetails.has(row.id)) {
    return "needs_details";
  }
  return readiness.cantIssue.has(row.id) ? "cant_issue" : null;
}

/** Whether any row waits on a split the server's last answer didn't give. */
export function hasUnclassifiedRows(
  rows: readonly ContributionRow[],
  readiness: ReceiptReadinessSets | null
): boolean {
  return (
    readiness !== null &&
    rows.some((row) => contributionReceiptValue(row, readiness) === null)
  );
}

/** The Receipt column's sort key (see `receiptColumnSortKey`). */
export function contributionReceiptSortKey(
  row: ContributionRow,
  readiness: ReceiptReadinessSets | null
): string {
  return receiptColumnSortKey(
    contributionReceiptValue(row, readiness),
    liveReceipt(row.receipts)?.number
  );
}
