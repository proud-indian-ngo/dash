import {
  countsAsReceived,
  type FinancialYearRange,
  isInFinancialYear,
} from "@pi-dash/shared/income";
import { sumPaise } from "@pi-dash/shared/money";

interface StatInput {
  amountPaise: number;
  partyId: string;
  receivedOn: number;
  status: string | null;
}

export interface ContributionYearStats {
  count: number;
  donorCount: number;
  receivedPaise: number;
}

/** This financial year's money in: refunded and reversed gifts do not count. */
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
    receivedPaise: sumPaise(inYear.map((row) => row.amountPaise)),
  };
}

export interface DonorGivingSummary {
  lastGiftOn: number | null;
  lifetimePaise: number;
  yearPaise: number;
}

/** Lifetime and this-year totals for one donor's contributions. */
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
    lifetimePaise: sumPaise(counted.map((row) => row.amountPaise)),
    yearPaise: sumPaise(
      counted
        .filter((row) => isInFinancialYear(row.receivedOn, fy))
        .map((row) => row.amountPaise)
    ),
  };
}
