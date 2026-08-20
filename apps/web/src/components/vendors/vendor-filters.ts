import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import {
  numberField,
  selectField,
} from "@/components/data-table/filter-fields";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";
import type { VendorRow } from "@/lib/vendor-types";

const VENDOR_STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
];

const LEGACY_VENDOR_FILTER_PARAMS = [
  { param: "status", path: "status" },
] as const;

export function getVendorFilterValue(row: VendorRow, path: string[]): unknown {
  const [key] = path;
  switch (key) {
    case "activeAmount":
      return row.activeAmount;
    case "activeCount":
      return row.activeCount;
    case "completedAmount":
      return row.completedAmount;
    case "completedCount":
      return row.completedCount;
    case "pendingAmount":
      return row.pendingAmount;
    case "pendingCount":
      return row.pendingCount;
    case "rejectedAmount":
      return row.rejectedAmount;
    case "rejectedCount":
      return row.rejectedCount;
    case "status":
      return row.status;
    default:
      return;
  }
}

export function createVendorFilterFields(): FilterField[] {
  return [
    selectField("status", "Status", VENDOR_STATUS_OPTIONS),
    numberField("pendingCount", "Pending Payments"),
    numberField("pendingAmount", "Pending Amount"),
    numberField("activeCount", "Active Payments"),
    numberField("activeAmount", "Active Amount"),
    numberField("completedCount", "Completed"),
    numberField("completedAmount", "Completed Amount"),
    numberField("rejectedCount", "Rejected Payments"),
    numberField("rejectedAmount", "Rejected Amount"),
  ];
}

export function useMigrateLegacyVendorFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_VENDOR_FILTER_PARAMS);
}
