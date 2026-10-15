import type { ContributionChannel } from "@pi-dash/shared/constants";
import { epochDayToIso, refundedPaise } from "@pi-dash/shared/income";
import {
  type ReceiptColumnValue,
  receiptColumnValueWithoutDonor,
} from "@pi-dash/shared/receipts";

import type { ContributionRow } from "../income-types";
import { liveReceipt } from "./receipt-types";

/** The server's split of open direct gifts, as sets for lookups. */
export interface ReceiptReadinessSets {
  blocked: ReadonlySet<string>;
  ready: ReadonlySet<string>;
}

/**
 * A row's Receipt value. Everything but the ready/needs-details split comes
 * from synced data; that split comes from the server (`readiness`), and is
 * null until it has loaded or when the server doesn't list the gift.
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
  return readiness.blocked.has(row.id) ? "needs_details" : null;
}
