import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { requestCostCentreId } from "@pi-dash/shared/cost-centre";

import {
  dateField,
  numberField,
  optionsFromRows,
  selectField,
} from "@/components/data-table/filter-fields";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";
import {
  cityFilterOptions,
  LEGACY_CITY_FILTER_PARAM,
} from "@/lib/cost-centre-filter";
import { APPROVAL_FILTER, requestApprovalValue } from "@/lib/lead-approval";
import {
  MISSING_PROOF_FILTER,
  requestPaymentProofValue,
} from "@/lib/payment-proof";
import {
  isReimbursement,
  REQUEST_TYPE_LABELS,
  type RequestRow,
} from "@/lib/reimbursement-types";
import {
  requestProgrammeId,
  requestProgrammeName,
  requestProgrammeOptionId,
  requestToClearValue,
  TO_CLEAR_FILTER,
} from "@/lib/request-programme";
import { sumAmounts } from "@/lib/stats";

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

const TYPE_OPTIONS = [
  { label: REQUEST_TYPE_LABELS.reimbursement, value: "reimbursement" },
  { label: REQUEST_TYPE_LABELS.advance_payment, value: "advance_payment" },
];

const LEGACY_REIMBURSEMENT_FILTER_PARAMS = [
  { param: "status", path: "status" },
  { param: "type", path: "type" },
  LEGACY_CITY_FILTER_PARAM,
] as const;

/** Total in rupees, because the number filter compares what people type in rupees. */
function computeTotalRupees(lineItems: RequestRow["lineItems"]): number {
  return sumAmounts(lineItems) / 100;
}

export function getReimbursementFilterValue(
  row: RequestRow,
  path: string[],
  /** Whose "Waiting for you" the Approval filter means. */
  currentUserId?: string
): unknown {
  const [key] = path;
  switch (key) {
    case APPROVAL_FILTER.path:
      return requestApprovalValue(row, currentUserId);
    case "city":
      // The event's cost centre for a claim on an event, else its own.
      return requestCostCentreId(row);
    case "createdBy":
      return row.userId;
    case "event":
      return isReimbursement(row) ? (row.eventId ?? null) : null;
    case "expenseDate":
      return isReimbursement(row) ? row.expenseDate : null;
    case "programme":
      // Advances are charged to nothing, so they sit outside every bucket.
      return isReimbursement(row) ? requestProgrammeId(row) : null;
    case TO_CLEAR_FILTER.path:
      return isReimbursement(row) ? requestToClearValue(row) : null;
    case MISSING_PROOF_FILTER.path:
      return requestPaymentProofValue(row);
    case "status":
      return row.status;
    case "submittedAt":
      return row.submittedAt;
    case "total":
      return computeTotalRupees(row.lineItems);
    case "type":
      return row.type;
    default:
      return;
  }
}

/**
 * `canViewAll` adds the reviewer filters (To clear, Payment proof, Created
 * by), which mean nothing to someone who sees only their own requests.
 */
export function createReimbursementFilterFields(
  rows: readonly RequestRow[],
  activeCostCentres: readonly { id: string; name: string }[],
  canViewAll: boolean
): FilterField[] {
  return [
    selectField("status", "Status", STATUS_OPTIONS),
    selectField(APPROVAL_FILTER.path, APPROVAL_FILTER.label, [
      ...APPROVAL_FILTER.options,
    ]),
    selectField("type", "Type", TYPE_OPTIONS),
    selectField("city", "City", cityFilterOptions(activeCostCentres)),
    selectField(
      "event",
      "Event",
      optionsFromRows(
        rows,
        (row) => (isReimbursement(row) ? row.eventId : null),
        (row) =>
          isReimbursement(row) ? (row.event?.name ?? row.eventId ?? "") : ""
      )
    ),
    selectField(
      "programme",
      "Programme",
      optionsFromRows(
        rows,
        (row) =>
          isReimbursement(row) ? requestProgrammeOptionId(row) : undefined,
        (row) => (isReimbursement(row) ? requestProgrammeName(row) : "")
      )
    ),
    ...(canViewAll
      ? [
          selectField(TO_CLEAR_FILTER.path, TO_CLEAR_FILTER.label, [
            {
              label: TO_CLEAR_FILTER.optionLabel,
              value: TO_CLEAR_FILTER.value,
            },
          ]),
          selectField(MISSING_PROOF_FILTER.path, MISSING_PROOF_FILTER.label, [
            {
              label: MISSING_PROOF_FILTER.optionLabel,
              value: MISSING_PROOF_FILTER.value,
            },
          ]),
          selectField(
            "createdBy",
            "Created by",
            optionsFromRows(
              rows,
              (row) => row.userId,
              (row) => row.user?.name ?? row.userId
            )
          ),
        ]
      : []),
    numberField("total", "Total"),
    dateField("expenseDate", "Expense date"),
    dateField("submittedAt", "Submitted"),
  ];
}

export function useMigrateLegacyReimbursementFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_REIMBURSEMENT_FILTER_PARAMS);
}
