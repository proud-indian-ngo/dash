import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type ImportBatchSource,
  type ImportBatchStatus,
  importBatchStatusValues,
} from "@pi-dash/shared/constants";
import type { ImportBatch, OrgAccount, User } from "@pi-dash/zero/schema";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { dateField, selectField } from "@/components/data-table/filter-fields";
import { StatusBadge } from "@/components/shared/status-badge";
import { IMPORT_SOURCE_LABELS } from "@/lib/income-import/fields";
import {
  IMPORT_BATCH_STATUS_LABELS,
  IMPORT_BATCH_STATUS_TONES,
} from "@/lib/income-import/labels";

export type ImportBatchRow = ImportBatch & {
  orgAccount?: OrgAccount | null;
  uploadedByUser?: User | null;
};

const SKELETON_TEXT = <Skeleton className="h-5 w-32" />;
const SKELETON_NUMBER = <Skeleton className="h-5 w-10" />;

const FILTER_FIELDS: FilterField[] = [
  selectField(
    "status",
    "Status",
    importBatchStatusValues.map((value) => ({
      label: IMPORT_BATCH_STATUS_LABELS[value],
      value,
    }))
  ),
  dateField("createdAt", "Uploaded"),
];

function getFilterValue(row: ImportBatchRow, path: string[]) {
  const [key] = path;
  if (key === "status") {
    return row.status;
  }
  if (key === "createdAt") {
    return row.createdAt;
  }
  return;
}

function searchBatch(row: ImportBatchRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    [row.fileName, row.uploadedByUser?.name ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

const formatUploaded = (epoch: number) =>
  new Date(epoch).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

function countColumn(
  id: string,
  title: string,
  get: (row: ImportBatchRow) => number
): DataGridColumnDef<ImportBatchRow> {
  return {
    accessorFn: get,
    cell: ({ row }) => (
      <span className="tabular-nums">{get(row.original)}</span>
    ),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title={title} visibility={true} />
    ),
    id,
    meta: {
      cellClassName: "text-right",
      headerTitle: title,
      skeleton: SKELETON_NUMBER,
    },
    size: 110,
  };
}

/** The Income page's Imports tab: one row per uploaded file, counts only. */
export function ImportBatchesTable({
  data,
  isLoading,
  onOpen,
}: {
  data: ImportBatchRow[];
  isLoading: boolean;
  onOpen: (row: ImportBatchRow) => void;
}) {
  const getRowId = useEventCallback((row: ImportBatchRow) => row.id);
  const columns: DataGridColumnDef<ImportBatchRow>[] = [
    {
      accessorFn: (row) => row.createdAt,
      cell: ({ row }) => formatUploaded(row.original.createdAt),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Uploaded"
          visibility={true}
        />
      ),
      id: "createdAt",
      meta: { headerTitle: "Uploaded", kind: "date", skeleton: SKELETON_TEXT },
      size: 180,
    },
    {
      accessorFn: (row) => row.fileName,
      cell: ({ row }) => (
        <span className="truncate font-medium">{row.original.fileName}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="File" visibility={true} />
      ),
      id: "fileName",
      meta: {
        compact: "primary",
        headerTitle: "File",
        skeleton: SKELETON_TEXT,
      },
      size: 220,
    },
    {
      accessorFn: (row) => row.source,
      cell: ({ row }) =>
        IMPORT_SOURCE_LABELS[row.original.source as ImportBatchSource],
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Source"
          visibility={true}
        />
      ),
      id: "source",
      meta: { headerTitle: "Source", skeleton: SKELETON_TEXT },
      size: 130,
    },
    {
      accessorFn: (row) => row.uploadedByUser?.name ?? "",
      cell: ({ row }) =>
        row.original.uploadedByUser?.name ??
        (row.original.source === "razorpay_api" ? "Automatic" : "—"),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Uploaded by"
          visibility={true}
        />
      ),
      id: "uploadedBy",
      meta: { headerTitle: "Uploaded by", skeleton: SKELETON_TEXT },
      size: 160,
    },
    {
      accessorFn: (row) => row.pendingCount ?? 0,
      cell: ({ row }) => {
        const pending = row.original.pendingCount ?? 0;
        return pending > 0 ? (
          <StatusBadge tone="warning">
            {pending.toLocaleString("en-IN")}
          </StatusBadge>
        ) : (
          <span className="text-muted-foreground tabular-nums">0</span>
        );
      },
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Needs review"
          visibility={true}
        />
      ),
      id: "pending",
      meta: {
        cellClassName: "text-right",
        headerTitle: "Needs review",
        skeleton: SKELETON_NUMBER,
      },
      size: 130,
    },
    countColumn("imported", "Imported", (row) => row.importedCount ?? 0),
    countColumn("linked", "Already in", (row) => row.linkedCount ?? 0),
    countColumn("conflicts", "Conflicts", (row) => row.conflictCount ?? 0),
    countColumn("skipped", "Skipped", (row) => row.skippedCount ?? 0),
    countColumn("errors", "Errors", (row) => row.errorCount ?? 0),
    {
      accessorFn: (row) => row.status,
      cell: ({ row }) => {
        const status = row.original.status as ImportBatchStatus;
        return (
          <StatusBadge tone={IMPORT_BATCH_STATUS_TONES[status]}>
            {IMPORT_BATCH_STATUS_LABELS[status]}
          </StatusBadge>
        );
      },
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      id: "status",
      meta: {
        compact: "primary",
        headerTitle: "Status",
        skeleton: SKELETON_TEXT,
      },
      size: 130,
    },
  ];

  return (
    <DataTableWrapper<ImportBatchRow>
      columns={columns}
      compactOnMobile
      data={data}
      emptyMessage="No imports match."
      filter={{
        fields: FILTER_FIELDS,
        getValue: getFilterValue,
        queryKey: "importFilters",
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      onRowClick={onOpen}
      searchFn={searchBatch}
      searchPlaceholder="Search file or uploader..."
      searchQueryKey="importSearch"
      storageKey="import_batches_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
    />
  );
}
