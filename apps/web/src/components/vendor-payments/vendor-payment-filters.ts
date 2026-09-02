import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";

import {
  dateField,
  numberField,
  optionsFromRows,
  selectField,
} from "@/components/data-table/filter-fields";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";
import { cityOptions } from "@/lib/form-schemas";

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
  { param: "city", path: "city" },
  { param: "status", path: "status" },
] as const;

function computeTotal(
  lineItems: VendorPaymentWithRelations["lineItems"]
): number {
  return lineItems.reduce((sum, item) => sum + Number(item.amount), 0);
}

export function getVendorPaymentFilterValue(
  row: VendorPaymentWithRelations,
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "city":
      return row.city;
    case "createdBy":
      return row.userId;
    case "event":
      return row.eventId ?? null;
    case "status":
      return row.status;
    case "submittedAt":
      return row.submittedAt;
    case "total":
      return computeTotal(row.lineItems);
    case "vendor":
      return row.vendorId;
    default:
      return;
  }
}

export function createVendorPaymentFilterFields(
  rows: readonly VendorPaymentWithRelations[]
): FilterField[] {
  return [
    selectField("city", "City", cityOptions),
    selectField("status", "Status", STATUS_OPTIONS),
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
