import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { deriveMessageStatus } from "@pi-dash/shared/scheduled-message";
import type { ScheduledMessageRecipient } from "@pi-dash/zero/schema";
import {
  dateField,
  numberField,
  optionsFromRows,
  selectField,
} from "@/components/data-table/filter-fields";
import { useMigrateLegacyFilterParams } from "@/components/data-table/use-migrate-legacy-filter-params";

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Sent", value: "sent" },
  { label: "Failed", value: "failed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Partial", value: "partial" },
];

const LEGACY_SCHEDULED_MESSAGE_FILTER_PARAMS = [
  { param: "status", path: "status" },
] as const;

export function getScheduledMessageFilterValue(
  row: {
    createdBy: string;
    creator?: { name: string } | null;
    recipients: ScheduledMessageRecipient[];
    scheduledAt: number;
  },
  path: string[]
): unknown {
  const [key] = path;
  switch (key) {
    case "creator":
      return row.createdBy;
    case "recipients":
      return row.recipients.length;
    case "scheduledAt":
      return row.scheduledAt;
    case "status":
      return deriveMessageStatus(row.recipients);
    default:
      return;
  }
}

export function createScheduledMessageFilterFields(
  rows: readonly {
    createdBy: string;
    creator?: { name: string } | null;
  }[]
): FilterField[] {
  return [
    selectField("status", "Status", STATUS_OPTIONS),
    dateField("scheduledAt", "Scheduled At"),
    numberField("recipients", "Recipients"),
    selectField(
      "creator",
      "Created By",
      optionsFromRows(
        rows,
        (row) => row.createdBy,
        (row) => row.creator?.name ?? row.createdBy
      )
    ),
  ];
}

export function useMigrateLegacyScheduledMessageFilterParams() {
  useMigrateLegacyFilterParams(LEGACY_SCHEDULED_MESSAGE_FILTER_PARAMS);
}
