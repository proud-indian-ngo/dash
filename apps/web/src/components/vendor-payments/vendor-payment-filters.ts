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
  requestProgrammeId,
  requestProgrammeName,
  requestProgrammeOptionId,
  requestToClearValue,
  TO_CLEAR_FILTER,
} from "@/lib/request-programme";
import { sumAmounts } from "@/lib/stats";

import type { VendorPaymentWithRelations } from "./vendor-payment-types";

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Partially Paid", value: "partially_paid" },
  { label: "Paid", value: "paid" },
  { label: "Invoice Pending", value: "invoice_pending" },
  { label: "Completed", value: "completed" },
];

const LEGACY_VENDOR_PAYMENT_FILTER_PARAMS = [
  LEGACY_CITY_FILTER_PARAM,
  { param: "status", path: "status" },
] as const;

/** Total in rupees, because the number filter compares what people type in rupees. */
function computeTotalRupees(
  lineItems: VendorPaymentWithRelations["lineItems"]
): number {
  return sumAmounts(lineItems) / 100;
}

export function getVendorPaymentFilterValue(
  row: VendorPaymentWithRelations,
  path: string[],
  /** Whose "Waiting for you" the Approval filter means. */
  currentUserId?: string
): unknown {
  const [key] = path;
  switch (key) {
    case APPROVAL_FILTER.path:
      return requestApprovalValue(row, currentUserId);
    case "city":
      // The event's cost centre for a payment on an event, else its own.
      return requestCostCentreId(row);
    case "createdBy":
      return row.userId;
    case "event":
      return row.eventId ?? null;
    case "programme":
      return requestProgrammeId(row);
    case TO_CLEAR_FILTER.path:
      return requestToClearValue(row);
    case "status":
      return row.status;
    case "submittedAt":
      return row.submittedAt;
    case "total":
      return computeTotalRupees(row.lineItems);
    case "vendor":
      return row.vendorId;
    default:
      return;
  }
}

export function createVendorPaymentFilterFields(
  rows: readonly VendorPaymentWithRelations[],
  activeCostCentres: readonly { id: string; name: string }[]
): FilterField[] {
  return [
    selectField("city", "City", cityFilterOptions(activeCostCentres)),
    selectField("status", "Status", STATUS_OPTIONS),
    selectField(APPROVAL_FILTER.path, APPROVAL_FILTER.label, [
      ...APPROVAL_FILTER.options,
    ]),
    selectField(
      "vendor",
      "Vendor",
      optionsFromRows(
        rows,
        (row) => row.vendorId,
        (row) => row.vendor?.name ?? row.vendorId
      )
    ),
    selectField(
      "event",
      "Event",
      optionsFromRows(
        rows,
        (row) => row.eventId,
        (row) => row.event?.name ?? row.eventId ?? ""
      )
    ),
    selectField(
      "programme",
      "Programme",
      optionsFromRows(
        rows,
        (row) => requestProgrammeOptionId(row),
        (row) => requestProgrammeName(row)
      )
    ),
    selectField(TO_CLEAR_FILTER.path, TO_CLEAR_FILTER.label, [
      { label: TO_CLEAR_FILTER.optionLabel, value: TO_CLEAR_FILTER.value },
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
    numberField("total", "Total"),
    dateField("submittedAt", "Submitted"),
  ];
}

export function useMigrateLegacyVendorPaymentFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_VENDOR_PAYMENT_FILTER_PARAMS);
}
