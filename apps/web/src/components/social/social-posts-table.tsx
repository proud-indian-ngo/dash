import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { SocialPost } from "@pi-dash/zero/schema";
import { Link } from "@tanstack/react-router";
import type { MouseEvent } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { selectField } from "@/components/data-table/filter-fields";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import {
  StatusBadge,
  type StatusTone,
  Tag,
} from "@/components/shared/status-badge";

import {
  formatCalendarDate,
  formatIndiaDateTime,
  isEventRowId,
} from "./social-format";

export type SocialPostRow = SocialPost & {
  /** Resolved from `getSocialPeople`; absent while loading. */
  droppedByName?: string | null;
};

const STATUS: Record<
  SocialPost["status"],
  { label: string; tone: StatusTone }
> = {
  approved: { label: "Approved", tone: "info" },
  dropped: { label: "Dropped", tone: "neutral" },
  published: { label: "Published", tone: "success" },
  queued: { label: "Queued", tone: "warning" },
};

const KIND_LABEL: Record<SocialPost["kind"], string> = {
  impact: "Impact",
  recap: "Recap",
  schedule: "Schedule",
  story: "Story",
  "volunteer-call": "Volunteer call",
};

const CHANNEL_LABEL: Record<SocialPost["channel"], string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
};

export function canDropSocialPost(post: Pick<SocialPost, "status">): boolean {
  return post.status === "queued" || post.status === "approved";
}

const FILTER_FIELDS: FilterField[] = [
  selectField(
    "status",
    "Status",
    Object.entries(STATUS).map(([value, { label }]) => ({ label, value }))
  ),
  selectField(
    "kind",
    "Kind",
    Object.entries(KIND_LABEL).map(([value, label]) => ({ label, value }))
  ),
  selectField(
    "channel",
    "Channel",
    Object.entries(CHANNEL_LABEL).map(([value, label]) => ({ label, value }))
  ),
];

function getFilterValue(row: SocialPostRow, path: string[]): unknown {
  switch (path[0]) {
    case "status":
      return row.status;
    case "kind":
      return row.kind;
    case "channel":
      return row.channel;
    default:
      return;
  }
}

function searchPost(row: SocialPostRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.eventName, row.eventId, row.bufferPostId, row.kind, row.status]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

function EventCell({ post }: { post: SocialPostRow }) {
  const name = post.eventName || post.eventId;
  const date = post.occurrenceDate
    ? formatCalendarDate(post.occurrenceDate)
    : null;
  return (
    <div className="flex min-w-0 flex-col">
      {isEventRowId(post.eventId) ? (
        <Link
          className="text-primary truncate font-medium underline-offset-2 hover:underline"
          onClick={(event) => event.stopPropagation()}
          params={{ id: post.eventId }}
          to="/events/$id"
        >
          {name}
        </Link>
      ) : (
        <span className="truncate">{name}</span>
      )}
      {date ? (
        <span className="text-muted-foreground font-mono text-xs">{date}</span>
      ) : null}
    </div>
  );
}

function StatusCell({ post }: { post: SocialPostRow }) {
  const badge = STATUS[post.status];
  // Held: still a Buffer draft waiting for the approver (null: not reported).
  const awaitingApproval = post.held === true && canDropSocialPost(post);
  const status = (
    <div className="flex flex-wrap items-center gap-1">
      <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      {awaitingApproval ? <Tag>Held</Tag> : null}
    </div>
  );
  if (post.status !== "dropped" || !post.droppedAt) {
    return status;
  }
  const who = post.droppedByName;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {status}
      <span className="text-muted-foreground truncate text-xs">
        {who ? `${who} · ` : ""}
        {formatIndiaDateTime(post.droppedAt)}
      </span>
    </div>
  );
}

function PostActions({
  onDrop,
  post,
}: {
  onDrop: (post: SocialPostRow) => void;
  post: SocialPostRow;
}) {
  const stopPropagation = useEventCallback((event: MouseEvent) => {
    event.stopPropagation();
  });
  const handleDrop = useEventCallback(() => onDrop(post));
  if (!canDropSocialPost(post)) {
    return null;
  }
  return (
    <ResponsiveActionMenu
      actions={[
        {
          destructive: true,
          icon: Cancel01Icon,
          id: "drop",
          label: "Drop post",
          onSelect: handleDrop,
        },
      ]}
      title="Post actions"
      trigger={<RowActionsButton onClick={stopPropagation} />}
    />
  );
}

const SKELETON_DATE = <Skeleton className="h-4 w-36" />;
const SKELETON_TAG = <Skeleton className="h-5 w-16" />;
const SKELETON_TEXT = <Skeleton className="h-4 w-40" />;
const SKELETON_ACTIONS = <Skeleton className="size-8" />;

function createColumns(
  onDrop: (post: SocialPostRow) => void
): DataGridColumnDef<SocialPostRow>[] {
  return [
    {
      accessorFn: (row) => row.scheduledFor,
      cell: ({ row }) => (
        <span>{formatIndiaDateTime(row.original.scheduledFor)}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Scheduled for"
          visibility={true}
        />
      ),
      id: "scheduledFor",
      meta: {
        headerTitle: "Scheduled for",
        kind: "date",
        skeleton: SKELETON_DATE,
      },
      size: 190,
    },
    {
      accessorFn: (row) => row.kind,
      cell: ({ row }) => <Tag>{KIND_LABEL[row.original.kind]}</Tag>,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Kind" visibility={true} />
      ),
      id: "kind",
      meta: { headerTitle: "Kind", kind: "tag", skeleton: SKELETON_TAG },
      size: 130,
    },
    {
      accessorFn: (row) => row.channel,
      cell: ({ row }) => <Tag>{CHANNEL_LABEL[row.original.channel]}</Tag>,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Channel"
          visibility={true}
        />
      ),
      id: "channel",
      meta: { headerTitle: "Channel", kind: "tag", skeleton: SKELETON_TAG },
      size: 120,
    },
    {
      accessorFn: (row) => row.eventName ?? row.eventId,
      cell: ({ row }) => <EventCell post={row.original} />,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Event" visibility={true} />
      ),
      id: "event",
      meta: {
        compact: "primary",
        headerTitle: "Event",
        kind: "text",
        skeleton: SKELETON_TEXT,
        stopRowClick: true,
      },
      size: 260,
    },
    {
      accessorFn: (row) => row.status,
      cell: ({ row }) => <StatusCell post={row.original} />,
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
        kind: "status",
        skeleton: SKELETON_TAG,
      },
      size: 200,
    },
    {
      accessorFn: (row) => row.bufferPostId,
      cell: ({ row }) => (
        <span className="truncate">{row.original.bufferPostId}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Buffer id"
          visibility={true}
        />
      ),
      id: "bufferPostId",
      meta: { headerTitle: "Buffer id", kind: "id", skeleton: SKELETON_TEXT },
      size: 200,
    },
    {
      cell: ({ row }) => <PostActions onDrop={onDrop} post={row.original} />,
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: {
        cellClassName: "text-center",
        enableColumnOrdering: false,
        skeleton: SKELETON_ACTIONS,
        stopRowClick: true,
      },
      minSize: 52,
      size: 52,
    },
  ];
}

/** Social page → Posts: the posted log, newest first, with Drop. */
export function SocialPostsTable({
  isLoading,
  onDrop,
  posts,
}: {
  isLoading: boolean;
  onDrop: (post: SocialPostRow) => void;
  posts: SocialPostRow[];
}) {
  const columns = createColumns(onDrop);
  const getRowId = useEventCallback((row: SocialPostRow) => row.id);
  return (
    <DataTableWrapper<SocialPostRow>
      columns={columns}
      compactOnMobile
      data={posts}
      emptyMessage="No posts yet. The pipeline records every post it queues in Buffer here."
      filter={{
        fields: FILTER_FIELDS,
        getValue: getFilterValue,
        queryKey: "postFilters",
        viewField: "status",
      }}
      getRowId={getRowId}
      isLoading={isLoading}
      searchFn={searchPost}
      searchPlaceholder="Search posts..."
      searchQueryKey="postSearch"
      storageKey="social_posts_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
    />
  );
}
