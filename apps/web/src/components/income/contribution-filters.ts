import {
  flattenFilterRules,
  isFilterGroup,
  isFilterRule,
  isFilterRuleComplete,
} from "@pi-dash/design-system/components/reui/filters/filters-query";
import type {
  FilterField,
  FilterNode,
  FilterQuery,
} from "@pi-dash/design-system/components/reui/filters/filters-types";
import {
  contributionChannelValues,
  contributionSourceValues,
  donationTypeValues,
} from "@pi-dash/shared/constants";
import {
  CONTRIBUTION_CHANNEL_LABELS,
  CONTRIBUTION_SOURCE_LABELS,
  CONTRIBUTION_STATUS_LABELS,
  contributionDisplayStatus,
  contributionDisplayStatusValues,
  countsAsReceived,
  currentFinancialYear,
  DONATION_TYPE_LABELS,
  type FinancialYearRange,
  isInFinancialYear,
} from "@pi-dash/shared/income";
import {
  RECEIPT_COLUMN_FILTER_LABELS,
  receiptColumnValues,
} from "@pi-dash/shared/receipts";

import {
  compileFilterQuery,
  removeFilterPath,
} from "@/components/data-table/compile-filter-query";
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
import {
  contributionReceiptValue,
  type ReceiptReadinessSets,
} from "./receipts/receipt-column";

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
  fy: FinancialYearRange = currentFinancialYear(),
  receiptReadiness: ReceiptReadinessSets | null = null
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
      case "receipt":
        return contributionReceiptValue(row, receiptReadiness);
      case "receivedOn":
        return row.receivedOn;
      case "source":
        return row.source;
      case "status":
        // Receipted shows (and filters) as Received; see the Receipt column.
        return contributionDisplayStatus(row.status);
      default:
        return;
    }
  };
}

export function hasReachedBankFilter(query: FilterQuery): boolean {
  return flattenFilterRules(query).some(
    (rule) =>
      rule.path[0] === "reachedBank" &&
      isFilterRuleComplete(rule) &&
      (rule.operator === "empty" ||
        rule.operator === "not_empty" ||
        (Array.isArray(rule.value)
          ? rule.value.length > 0
          : rule.value !== null &&
            rule.value !== undefined &&
            rule.value !== ""))
  );
}

function containsReachedBank(node: FilterNode): boolean {
  if (isFilterRule(node)) {
    return node.path[0] === "reachedBank";
  }
  return isFilterGroup(node) && node.rules.some(containsReachedBank);
}

function hasReachedBankInsideOr(node: FilterQuery): boolean {
  if (node.combinator === "or" && node.rules.some(containsReachedBank)) {
    return true;
  }
  return node.rules.some(
    (child) => isFilterGroup(child) && hasReachedBankInsideOr(child)
  );
}

export function searchContribution(
  row: ContributionRow,
  query: string
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return [donorName(row), row.reference ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

/** IDs that can match the current query before Reached bank is evaluated. */
export function contributionBankScope(
  rows: readonly ContributionRow[],
  query: FilterQuery,
  missingPartyIds: ReadonlySet<string>,
  searchQuery = "",
  fy: FinancialYearRange = currentFinancialYear()
): string[] {
  if (!hasReachedBankFilter(query)) {
    return [];
  }
  const matches = hasReachedBankInsideOr(query)
    ? () => true
    : compileFilterQuery(
        // The Receipt value needs the server's readiness, which this scope
        // doesn't wait for; leaving it out only widens the scope.
        removeFilterPath(removeFilterPath(query, "reachedBank"), "receipt"),
        getContributionFilterValue(missingPartyIds, EMPTY_BANK_EVIDENCE, fy)
      );
  return rows
    .filter(matches)
    .filter((row) => searchContribution(row, searchQuery))
    .map((row) => row.id);
}

export function createContributionFilterFields(
  rows: readonly ContributionRow[],
  includeReachedBank = false,
  includeReceipt = false
): FilterField[] {
  const fields: FilterField[] = [
    selectField(
      "status",
      "Status",
      options(contributionDisplayStatusValues, CONTRIBUTION_STATUS_LABELS)
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
  if (includeReceipt) {
    fields.splice(
      1,
      0,
      selectField(
        "receipt",
        "Receipt",
        options(receiptColumnValues, RECEIPT_COLUMN_FILTER_LABELS)
      )
    );
  }
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
