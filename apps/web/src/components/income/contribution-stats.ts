import {
  countsAsReceived,
  type FinancialYearRange,
  isInFinancialYear,
  netReceivedPaise,
} from "@pi-dash/shared/income";
import { sumPaise } from "@pi-dash/shared/money";

import type { ContributionRow } from "./income-types";
import { fromIntermediary } from "./receipts/receipt-types";

interface StatInput {
  amountPaise: number;
  partyId: string;
  receivedOn: number;
  /** Refunds recorded against it; partial refunds come off the totals. */
  refunds?: readonly { amountPaise: number }[] | null;
  status: string | null;
}

export interface ContributionYearStats {
  count: number;
  donorCount: number;
  receivedPaise: number;
}

/**
 * This financial year's money in: pending, refunded and reversed gifts do
 * not count, and partial refunds come off (`netReceivedPaise`).
 */
export function computeContributionYearStats(
  rows: readonly StatInput[],
  fy: FinancialYearRange
): ContributionYearStats {
  const inYear = rows.filter(
    (row) =>
      isInFinancialYear(row.receivedOn, fy) &&
      countsAsReceived(row.status ?? "received")
  );
  return {
    count: inYear.length,
    donorCount: new Set(inYear.map((row) => row.partyId)).size,
    receivedPaise: sumPaise(inYear.map((row) => netReceivedPaise(row))),
  };
}

export interface DonorGivingSummary {
  lastGiftOn: number | null;
  lifetimePaise: number;
  yearPaise: number;
}

/** Lifetime and this-year totals for one donor's contributions, net of refunds. */
export function computeDonorGiving(
  rows: readonly StatInput[],
  fy: FinancialYearRange
): DonorGivingSummary {
  const counted = rows.filter((row) =>
    countsAsReceived(row.status ?? "received")
  );
  return {
    lastGiftOn: counted.reduce<number | null>(
      (latest, row) =>
        latest === null || row.receivedOn > latest ? row.receivedOn : latest,
      null
    ),
    lifetimePaise: sumPaise(counted.map((row) => netReceivedPaise(row))),
    yearPaise: sumPaise(
      counted
        .filter((row) => isInFinancialYear(row.receivedOn, fy))
        .map((row) => netReceivedPaise(row))
    ),
  };
}

interface SignatureInput {
  id: string;
  /** Its intermediary role changes the Receipt column. */
  party?: ContributionRow["party"];
  partyId: string;
  receivedOn: number;
  refunds?: readonly { amountPaise: number }[] | null;
  status: string | null;
  updatedAt: number | null;
}

/**
 * A short hash of the fields the missing-details count depends on, so the
 * Income page refetches it when a gift is added, edited, moved or deleted,
 * and not on every render.
 */
export function contributionsSignature(
  rows: readonly SignatureInput[]
): string {
  // FNV-1a over each row's fields; collisions only delay a refresh.
  let hash = 0x81_1c_9d_c5;
  const mix = (value: string) => {
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01_00_01_93);
    }
  };
  for (const row of rows) {
    mix(
      `${row.id}|${row.partyId}|${row.receivedOn}|${row.status ?? ""}|${row.updatedAt ?? ""}|${row.refunds?.length ?? 0}|${fromIntermediary(row)};`
    );
  }
  return `${rows.length}:${(hash >>> 0).toString(36)}`;
}
