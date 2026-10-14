import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import {
  contributionChannelValues,
  contributionSourceValues,
  contributionStatusValues,
  donationTypeValues,
} from "@pi-dash/shared/constants";
import {
  CONTRIBUTION_CHANNEL_LABELS,
  CONTRIBUTION_SOURCE_LABELS,
  CONTRIBUTION_STATUS_LABELS,
  countsAsReceived,
  currentFinancialYear,
  DONATION_TYPE_LABELS,
  type FinancialYearRange,
  isInFinancialYear,
} from "@pi-dash/shared/income";

import {
  dateField,
  optionsFromRows,
  selectField,
} from "@/components/data-table/filter-fields";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";

import {
  type ContributionRow,
  donorName,
  importBatchLabel,
} from "./income-types";

/** Filter value for donors flagged by the "Missing donor details" stat. */
export const MISSING_DETAILS_VALUE = "missing";

type ReachedBankValue = "yes" | "not_yet" | "not_applicable";

export interface ContributionBankEvidence {
  matchedContributionIds: ReadonlySet<string>;
  processedContributionIds: ReadonlySet<string>;
}

const EMPTY_BANK_EVIDENCE: ContributionBankEvidence = {
  matchedContributionIds: new Set(),
  processedContributionIds: new Set(),
};

/** Derived from processed payout items and matched statement lines. */
export function reachedBankValue(
  row: Pick<ContributionRow, "channel" | "id" | "orgAccountId">,
  evidence: ContributionBankEvidence
): ReachedBankValue {
  if (
    evidence.processedContributionIds.has(row.id) ||
    evidence.matchedContributionIds.has(row.id)
  ) {
    return "yes";
  }
  if (row.channel === "razorpay" || row.channel === "give_do") {
    return "not_yet";
  }
  if (
    row.channel === "in_kind" ||
    (row.channel === "cash" && !row.orgAccountId)
  ) {
    return "not_applicable";
  }
  return "not_yet";
}

const options = <T extends string>(
  values: readonly T[],
  labels: Record<T, string>
) => values.map((value) => ({ label: labels[value], value }));

/**
 * `/income?donor=<partyId>` (the donor sheet's link) and
 * `/income?batch=<batchId>` (an import's result link) open filtered.
 */
const LEGACY_CONTRIBUTION_FILTER_PARAMS = [
  { param: "donor", path: "donor" },
  { param: "batch", path: "batch" },
] as const;

/**
 * Whether a row is one the "Missing donor details" stat counts: received this
 * financial year from a donor whose details hold up the donations return.
 */
export function isMissingDetailsRow(
  row: { partyId: string; receivedOn: number; status: string | null },
  missingPartyIds: ReadonlySet<string>,
  fy: FinancialYearRange
): boolean {
  return (
    missingPartyIds.has(row.partyId) &&
    isInFinancialYear(row.receivedOn, fy) &&
    countsAsReceived(row.status ?? "received")
  );
}

export function getContributionFilterValue(
  missingPartyIds: ReadonlySet<string>,
  bankEvidence: ContributionBankEvidence = EMPTY_BANK_EVIDENCE,
  fy: FinancialYearRange = currentFinancialYear()
) {
  return (row: ContributionRow, path: string[]): unknown => {
    const [key] = path;
    switch (key) {
      case "batch":
        return row.importBatchId;
      case "channel":
        return row.channel;
      case "details":
        return isMissingDetailsRow(row, missingPartyIds, fy)
          ? MISSING_DETAILS_VALUE
          : null;
      case "donationType":
        return row.donationType;
      case "donor":
        return row.partyId;
      case "programme":
        return row.programmeId;
      case "reachedBank":
        return reachedBankValue(row, bankEvidence);
      case "receivedOn":
        return row.receivedOn;
      case "source":
        return row.source;
      case "status":
        return row.status;
      default:
        return;
    }
  };
}

export function createContributionFilterFields(
  rows: readonly ContributionRow[],
  includeReachedBank = false
): FilterField[] {
  const fields: FilterField[] = [
    selectField(
      "status",
      "Status",
      options(contributionStatusValues, CONTRIBUTION_STATUS_LABELS)
    ),
    selectField(
      "channel",
      "Channel",
      options(contributionChannelValues, CONTRIBUTION_CHANNEL_LABELS)
    ),
    selectField(
      "donationType",
      "Donation type",
      options(donationTypeValues, DONATION_TYPE_LABELS)
    ),
    selectField(
      "programme",
      "Programme",
      optionsFromRows(
        rows,
        (row) => row.programmeId,
        (row) => row.programme?.name ?? ""
      )
    ),
    dateField("receivedOn", "Received on"),
    selectField(
      "donor",
      "Donor",
      optionsFromRows(rows, (row) => row.partyId, donorName)
    ),
    selectField(
      "source",
      "Source",
      options(contributionSourceValues, CONTRIBUTION_SOURCE_LABELS)
    ),
    selectField(
      "batch",
      "Import",
      optionsFromRows(
        rows,
        (row) => row.importBatchId,
        (row) => (row.importBatch ? importBatchLabel(row.importBatch) : "")
      )
    ),
    selectField("details", "Donor details", [
      {
        label: "Missing donor details (received this year)",
        value: MISSING_DETAILS_VALUE,
      },
    ]),
  ];
  if (includeReachedBank) {
    fields.splice(
      1,
      0,
      selectField("reachedBank", "Reached bank", [
        { label: "Yes", value: "yes" },
        { label: "Not yet", value: "not_yet" },
        { label: "Not applicable", value: "not_applicable" },
      ])
    );
  }
  return fields;
}

export function useMigrateLegacyContributionFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_CONTRIBUTION_FILTER_PARAMS);
}
