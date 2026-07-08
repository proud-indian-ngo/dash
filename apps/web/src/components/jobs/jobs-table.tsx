import {
  Cancel01Icon,
  MoreVerticalIcon,
  RepeatIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { ColumnDef } from "@tanstack/react-table";
import type { MouseEvent, ReactNode } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { getStateBadge } from "@/components/jobs/job-detail-sheet";
import type { JobRow } from "@/components/jobs/job-stats";
import { formatTimestamp } from "@/lib/date-formats";

const SKELETON_QUEUE = <Skeleton className="h-4 w-24" />;
const SKELETON_STATE = <Skeleton className="h-5 w-16" />;
const SKELETON_DATE = <Skeleton className="h-4 w-28" />;
const SKELETON_ACTIONS = <Skeleton className="size-8" />;

function searchJob(row: JobRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.id, row.name, row.state].join(" ").toLowerCase().includes(q);
}

function createJobColumns(
  onView: (job: JobRow) => void,
  onCancel: (job: JobRow) => void,
  onRetry: (job: JobRow) => void
): ColumnDef<JobRow>[] {
  return [
    {
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <span className="truncate font-medium">{row.original.name}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Queue" visibility={true} />
      ),
      id: "name",
      meta: {
        headerTitle: "Queue",
        skeleton: SKELETON_QUEUE,
      },
      size: 200,
    },
    {
      accessorFn: (row) => row.state,
      cell: ({ row }) => {
        const badge = getStateBadge(row.original.state);
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="State" visibility={true} />
      ),
      id: "state",
      meta: {
        headerTitle: "State",
        skeleton: SKELETON_STATE,
      },
      size: 120,
    },
    {
      accessorFn: (row) => formatTimestamp(row.createdOn),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Created"
          visibility={true}
        />
      ),
      id: "createdOn",
      meta: {
        headerTitle: "Created",
        skeleton: SKELETON_DATE,
      },
      size: 180,
    },
    {
      accessorFn: (row) => formatTimestamp(row.startAfter),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Scheduled For"
          visibility={true}
        />
      ),
      id: "startAfter",
      meta: {
        headerTitle: "Scheduled For",
        skeleton: SKELETON_DATE,
      },
      size: 180,
    },
    {
      accessorFn: (row) => formatTimestamp(row.completedOn),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Completed At"
          visibility={true}
        />
      ),
      id: "completedOn",
      meta: {
        headerTitle: "Completed At",
        skeleton: SKELETON_DATE,
      },
      size: 180,
    },
    {
      cell: ({ row }) => {
        const job = row.original;
        const canCancel = job.state === "created" || job.state === "retry";
        const canRetry = job.state === "failed";

        return (
          <JobActions
            canCancel={canCancel}
            canRetry={canRetry}
            job={job}
            onCancel={onCancel}
            onRetry={onRetry}
            onView={onView}
          />
        );
      },
      enableColumnOrdering: false,
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: {
        cellClassName: "text-center",
        skeleton: SKELETON_ACTIONS,
        stopRowClick: true,
      },
      minSize: 52,
      size: 52,
    },
  ];
}

function JobActions({
  canCancel,
  canRetry,
  job,
  onCancel,
  onRetry,
  onView,
}: {
  canCancel: boolean;
  canRetry: boolean;
  job: JobRow;
  onCancel: (job: JobRow) => void;
  onRetry: (job: JobRow) => void;
  onView: (job: JobRow) => void;
}) {
  const stopPropagation = useEventCallback((e: MouseEvent) => {
    e.stopPropagation();
  });
  const handleView = useEventCallback(() => onView(job));
  const handleCancel = useEventCallback(() => onCancel(job));
  const handleRetry = useEventCallback(() => onRetry(job));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Row actions"
            className="size-8"
            data-testid="row-actions"
            onClick={stopPropagation}
            size="icon"
            type="button"
            variant="ghost"
          >
            <HugeiconsIcon
              className="size-4"
              icon={MoreVerticalIcon}
              strokeWidth={2}
            />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={handleView}>
          <HugeiconsIcon className="mr-2 size-4" icon={ViewIcon} strokeWidth={2} />
          View details
        </DropdownMenuItem>
        {Boolean(canCancel) && (
          <DropdownMenuItem onClick={handleCancel} variant="destructive">
            <HugeiconsIcon
              className="mr-2 size-4"
              icon={Cancel01Icon}
              strokeWidth={2}
            />
            Cancel
          </DropdownMenuItem>
        )}
        {Boolean(canRetry) && (
          <DropdownMenuItem onClick={handleRetry}>
            <HugeiconsIcon
              className="mr-2 size-4"
              icon={RepeatIcon}
              strokeWidth={2}
            />
            Retry
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface JobsTableProps {
  hasActiveFilters?: boolean;
  isLoading?: boolean;
  jobs: JobRow[];
  manualPagination?: boolean;
  onCancel: (job: JobRow) => void;
  onClearFilters?: () => void;
  onRetry: (job: JobRow) => void;
  onView: (job: JobRow) => void;
  rowCount?: number;
  toolbarActions?: ReactNode;
  toolbarFilters?: ReactNode;
}

export function JobsTable({
  isLoading,
  jobs,
  manualPagination,
  onCancel,
  onRetry,
  onView,
  rowCount,
  toolbarActions,
  toolbarFilters,
  hasActiveFilters,
  onClearFilters,
}: JobsTableProps) {
  const columns = createJobColumns(onView, onCancel, onRetry);
  const stableGetRowId0 = useEventCallback((row: { id: string }) => row.id);

  return (
    <DataTableWrapper<JobRow>
      columns={columns}
      data={jobs}
      emptyMessage="No jobs found."
      getRowId={stableGetRowId0}
      hasActiveFilters={hasActiveFilters}
      isLoading={isLoading}
      manualPagination={manualPagination}
      onClearFilters={onClearFilters}
      onRowClick={onView}
      rowCount={rowCount}
      searchFn={searchJob}
      searchPlaceholder="Search jobs..."
      storageKey="jobs_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsMovable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
      toolbarActions={toolbarActions}
      toolbarFilters={toolbarFilters}
    />
  );
}
