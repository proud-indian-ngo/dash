import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@pi-dash/design-system/components/ui/empty";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { SocialRun } from "@pi-dash/zero/schema";

import { DataTableExpandButton } from "@/components/data-table/data-table-compact";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { StatusBadge, Tag } from "@/components/shared/status-badge";

import { formatIndiaDateTime } from "./social-format";

const SKELETON_EXPAND = <Skeleton className="size-10" />;
const SKELETON_DATE = <Skeleton className="h-4 w-36" />;
const SKELETON_TAG = <Skeleton className="h-5 w-14" />;
const SKELETON_COUNT = <Skeleton className="h-4 w-8" />;

// Columns with a database default are optional in the Zero schema.
const errorsOf = (run: SocialRun): string[] => run.errors ?? [];
const skippedOf = (run: SocialRun): string[] => run.skipped ?? [];

function hasDetails(run: SocialRun): boolean {
  return skippedOf(run).length > 0 || errorsOf(run).length > 0;
}

function ResultBadge({ run }: { run: SocialRun }) {
  const errors = errorsOf(run).length;
  if (errors === 0) {
    return <StatusBadge tone="success">OK</StatusBadge>;
  }
  return (
    <StatusBadge tone="danger">
      {errors === 1 ? "1 error" : `${errors} errors`}
    </StatusBadge>
  );
}

function RunMessages({
  label,
  messages,
}: {
  label: string;
  messages: string[];
}) {
  if (messages.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-1">
      <p className="text-sm font-medium">
        {label} ({messages.length})
      </p>
      <ul className="text-muted-foreground grid list-disc gap-0.5 ps-5 text-sm">
        {messages.map((message, index) => (
          // Messages repeat; their position is their identity.
          <li className="break-words" key={index}>
            {message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RunDetails({ run }: { run: SocialRun }) {
  return (
    <div className="grid gap-3 px-4 py-3" data-testid="social-run-details">
      <RunMessages label="Errors" messages={errorsOf(run)} />
      <RunMessages label="Skipped" messages={skippedOf(run)} />
    </div>
  );
}

const countColumn = (
  id: "dropped" | "eventsSeen" | "planned" | "recorded" | "rendered",
  title: string
): DataGridColumnDef<SocialRun> => ({
  accessorFn: (row) => row[id],
  cell: ({ row }) => <span>{row.original[id]}</span>,
  header: ({ column }) => (
    <DataGridColumnHeader column={column} title={title} visibility={true} />
  ),
  id,
  meta: { headerTitle: title, kind: "count", skeleton: SKELETON_COUNT },
  size: 110,
});

const columns: DataGridColumnDef<SocialRun>[] = [
  {
    cell: ({ row }) =>
      row.getCanExpand() ? (
        <div className="flex size-full items-center justify-center">
          <DataTableExpandButton
            expanded={row.getIsExpanded()}
            onToggle={row.getToggleExpandedHandler()}
          />
        </div>
      ) : null,
    enableHiding: false,
    enableResizing: false,
    enableSorting: false,
    header: "",
    id: "expand",
    maxSize: 40,
    meta: {
      cellClassName: "px-0",
      compact: "always",
      enableColumnOrdering: false,
      expandedContent: (row: SocialRun) => <RunDetails run={row} />,
      headerClassName: "px-0",
      skeleton: SKELETON_EXPAND,
      stopRowClick: true,
    },
    minSize: 40,
    size: 40,
  },
  {
    accessorFn: (row) => row.startedAt,
    cell: ({ row }) => (
      <span>{formatIndiaDateTime(row.original.startedAt)}</span>
    ),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Time" visibility={true} />
    ),
    id: "startedAt",
    meta: {
      compact: "primary",
      headerTitle: "Time",
      kind: "date",
      skeleton: SKELETON_DATE,
    },
    size: 190,
  },
  {
    accessorFn: (row) => row.tick,
    cell: ({ row }) => (
      <Tag>{row.original.tick === "digest" ? "Digest" : "Hourly"}</Tag>
    ),
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Tick" visibility={true} />
    ),
    id: "tick",
    meta: { headerTitle: "Tick", kind: "tag", skeleton: SKELETON_TAG },
    size: 100,
  },
  countColumn("eventsSeen", "Events seen"),
  countColumn("planned", "Planned"),
  countColumn("rendered", "Rendered"),
  countColumn("recorded", "Recorded"),
  countColumn("dropped", "Dropped"),
  {
    accessorFn: (row) => row.digestSent,
    cell: ({ row }) => (row.original.digestSent ? "Yes" : "No"),
    header: ({ column }) => (
      <DataGridColumnHeader
        column={column}
        title="Digest sent"
        visibility={true}
      />
    ),
    id: "digestSent",
    meta: { headerTitle: "Digest sent", skeleton: SKELETON_COUNT },
    size: 110,
  },
  {
    accessorFn: (row) => errorsOf(row).length,
    cell: ({ row }) => <ResultBadge run={row.original} />,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Result" visibility={true} />
    ),
    id: "result",
    meta: {
      compact: "primary",
      headerTitle: "Result",
      kind: "status",
      skeleton: SKELETON_TAG,
    },
    size: 120,
  },
];

function searchRun(row: SocialRun, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.tick, ...skippedOf(row), ...errorsOf(row)]
    .join("\n")
    .toLowerCase()
    .includes(q);
}

/** Social page → Runs: one row per pipeline run, newest first. */
export function SocialRunsTable({
  isLoading,
  runs,
}: {
  isLoading: boolean;
  runs: SocialRun[];
}) {
  const getRowCanExpand = useEventCallback((row: { original: SocialRun }) =>
    hasDetails(row.original)
  );
  const getRowId = useEventCallback((row: SocialRun) => row.id);

  if (!isLoading && runs.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No runs yet</EmptyTitle>
          <EmptyDescription>
            The social pipeline runs every hour, plus a daily digest run, and
            reports here when each run finishes: how many events it saw and how
            many posts it planned, rendered and recorded.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <DataTableWrapper<SocialRun>
      columns={columns}
      compactOnMobile
      data={runs}
      emptyMessage="No runs match."
      getRowCanExpand={getRowCanExpand}
      getRowId={getRowId}
      isLoading={isLoading}
      searchFn={searchRun}
      searchPlaceholder="Search skipped and errors..."
      searchQueryKey="runSearch"
      storageKey="social_runs_table_state_v1"
    />
  );
}
