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

import { type ContributionRow, donorName } from "./income-types";

/** Filter value for donors flagged by the "Missing donor details" stat. */
export const MISSING_DETAILS_VALUE = "missing";

const options = <T extends string>(
  values: readonly T[],
  labels: Record<T, string>
) => values.map((value) => ({ label: labels[value], value }));

/** `/income?donor=<partyId>` (the donor sheet's link) opens filtered to that donor. */
const LEGACY_CONTRIBUTION_FILTER_PARAMS = [
  { param: "donor", path: "donor" },
] as const;

/**
 * Whether a row is one the "Missing donor details" stat counts: received this
 * financial year from a donor who lacks an ID or address.
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
  fy: FinancialYearRange = currentFinancialYear()
) {
  return (row: ContributionRow, path: string[]): unknown => {
    const [key] = path;
    switch (key) {
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
  rows: readonly ContributionRow[]
): FilterField[] {
  return [
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
    selectField("details", "Donor details", [
      {
        label: "Missing ID or address (received this year)",
        value: MISSING_DETAILS_VALUE,
      },
    ]),
  ];
}

export function useMigrateLegacyContributionFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_CONTRIBUTION_FILTER_PARAMS);
}
