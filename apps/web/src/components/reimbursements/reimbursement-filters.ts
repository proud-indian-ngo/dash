import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";

import {
  dateField,
  numberField,
  optionsFromRows,
  selectField,
} from "@/components/data-table/filter-fields";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";
import { cityOptions } from "@/lib/form-schemas";
import {
  isReimbursement,
  REQUEST_TYPE_LABELS,
  type RequestRow,
} from "@/lib/reimbursement-types";

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
  { param: "city", path: "city" },
] as const;

function computeTotal(lineItems: RequestRow["lineItems"]): number {
  return lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
}

export function getReimbursementFilterValue(
  row: RequestRow,
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "city":
      return row.city;
    case "createdBy":
      return row.userId;
    case "event":
      return isReimbursement(row) ? (row.eventId ?? null) : null;
    case "expenseDate":
      return isReimbursement(row) ? row.expenseDate : null;
    case "status":
      return row.status;
    case "submittedAt":
      return row.submittedAt;
    case "total":
      return computeTotal(row.lineItems);
    case "type":
      return row.type;
    default:
      return;
  }
}

export function createReimbursementFilterFields(
  rows: readonly RequestRow[]
): FilterField[] {
  return [
    selectField("status", "Status", STATUS_OPTIONS),
    selectField("type", "Type", TYPE_OPTIONS),
    selectField("city", "City", cityOptions),
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
      "createdBy",
      "Created by",
      optionsFromRows(
        rows,
        (row) => row.userId,
        (row) => row.user?.name ?? row.userId
      )
    ),
    numberField("total", "Total"),
    dateField("expenseDate", "Expense date"),
    dateField("submittedAt", "Submitted"),
  ];
}

export function useMigrateLegacyReimbursementFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_REIMBURSEMENT_FILTER_PARAMS);
}
