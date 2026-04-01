import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { mutators } from "@pi-dash/zero/mutators";
import { expandSeries, type RecurrenceRule } from "@pi-dash/zero/rrule-utils";
import type {
  EventInterest,
  TeamEvent,
  TeamEventMember,
} from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { addWeeks, format } from "date-fns";
import { useMemo } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { SHORT_MONTH_DATE_TIME } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";

export type PublicEventRow = TeamEvent & {
  exceptions: readonly (TeamEvent & { members: readonly TeamEventMember[] })[];
  members: readonly TeamEventMember[];
  team: { id: string; name: string } | undefined;
};

interface PublicDisplayRow {
  eventId: string;
  isPublic: boolean | null;
  location: string | null;
  members: readonly TeamEventMember[];
  name: string;
  startTime: number;
  team: { id: string; name: string } | undefined;
  teamId: string;
}

interface PublicEventsTableProps {
  data: PublicEventRow[];
  isLoading?: boolean;
  myInterests: readonly EventInterest[];
  myTeamIds: ReadonlySet<string>;
  onShowInterest: (eventId: string) => void;
  userId: string;
}

function buildPublicDisplayRows(data: PublicEventRow[]): PublicDisplayRow[] {
  const now = Date.now();
  const rangeEnd = addWeeks(new Date(), 8).getTime();
  const rows: PublicDisplayRow[] = [];

  for (const event of data) {
    const rule = event.recurrenceRule as RecurrenceRule | null;
    const base = {
      eventId: event.id,
      isPublic: event.isPublic,
      name: event.name,
      location: event.location,
      members: event.members,
      team: event.team,
      teamId: event.teamId,
    };

    if (!rule) {
      rows.push({ ...base, startTime: event.startTime });
      continue;
    }

    const exceptionDates = new Set<string>();
    for (const exc of event.exceptions) {
      if (exc.originalDate) {
        exceptionDates.add(exc.originalDate);
      }
    }

    const occs = expandSeries(
      rule,
      event.startTime,
      event.endTime,
      now,
      rangeEnd,
      exceptionDates
    );
    for (const occ of occs) {
      rows.push({ ...base, startTime: occ.startTime });
    }

    for (const exc of event.exceptions) {
      if (
        !exc.cancelledAt &&
        exc.startTime >= now &&
        exc.startTime <= rangeEnd
      ) {
        rows.push({ ...base, startTime: exc.startTime, members: exc.members });
      }
    }
  }

  rows.sort((a, b) => a.startTime - b.startTime);
  return rows;
}

function searchDisplayRow(row: PublicDisplayRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.name, row.location ?? "", row.team?.name ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

const SKELETON_NAME = <Skeleton className="h-5 w-40" />;
const SKELETON_DATE = <Skeleton className="h-5 w-36" />;
const SKELETON_LOCATION = <Skeleton className="h-5 w-28" />;
const SKELETON_TEAM = <Skeleton className="h-5 w-28" />;
const SKELETON_COUNT = <Skeleton className="h-5 w-12" />;
const SKELETON_INTEREST = <Skeleton className="h-8 w-24" />;

const statusBadgeMap = {
  member: { label: "Joined", variant: "default" },
  approved: { label: "Interest Approved", variant: "default" },
  rejected: { label: "Interest Declined", variant: "secondary" },
} as const satisfies Record<string, { label: string; variant: string }>;

function InterestCell({
  eventId,
  myInterests,
  myTeamIds,
  members,
  onShowInterest,
  startTime,
  teamId,
  userId,
}: {
  eventId: string;
  myInterests: readonly EventInterest[];
  myTeamIds: ReadonlySet<string>;
  members: readonly TeamEventMember[];
  onShowInterest: (eventId: string) => void;
  startTime: number;
  teamId: string | undefined;
  userId: string;
}) {
  const zero = useZero();
  const hasStarted = startTime <= Date.now();

  if (members.some((m) => m.userId === userId)) {
    return <Badge variant="default">Joined</Badge>;
  }

  const interest = myInterests.find((i) => i.eventId === eventId);
  if (interest) {
    if (interest.status === "pending") {
      if (hasStarted) {
        return <Badge variant="secondary">Interest Pending</Badge>;
      }
      return (
        <Button
          onClick={async (e) => {
            e.stopPropagation();
            const res = await zero.mutate(
              mutators.eventInterest.cancel({ id: interest.id })
            ).server;
            handleMutationResult(res, {
              mutation: "eventInterest.cancel",
              entityId: interest.id,
              errorMsg: "Failed to cancel interest",
            });
          }}
          size="sm"
          variant="outline"
        >
          Cancel Interest
        </Button>
      );
    }
    const mapped =
      statusBadgeMap[interest.status as keyof typeof statusBadgeMap];
    if (mapped) {
      return <Badge variant={mapped.variant}>{mapped.label}</Badge>;
    }
  }

  if (hasStarted || (teamId && myTeamIds.has(teamId))) {
    return null;
  }

  return (
    <Button
      onClick={(e) => {
        e.stopPropagation();
        onShowInterest(eventId);
      }}
      size="sm"
    >
      Show Interest
    </Button>
  );
}

export function PublicEventsTable({
  data,
  isLoading,
  myInterests,
  myTeamIds,
  onShowInterest,
  userId,
}: PublicEventsTableProps) {
  const navigate = useNavigate();
  const displayRows = useMemo(() => buildPublicDisplayRows(data), [data]);

  const columns: ColumnDef<PublicDisplayRow>[] = [
    {
      id: "name",
      accessorFn: (row) => row.name,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Event" visibility />
      ),
      cell: ({ row }) => (
        <Link
          className="truncate font-medium text-sm hover:underline"
          params={{ id: row.original.eventId }}
          to="/events/$id"
        >
          {row.original.name}
        </Link>
      ),
      meta: { headerTitle: "Event", skeleton: SKELETON_NAME },
      size: 220,
    },
    {
      id: "dateTime",
      accessorFn: (row) => row.startTime,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Date & Time" visibility />
      ),
      cell: ({ row }) => (
        <span className="truncate text-sm">
          {format(row.original.startTime, SHORT_MONTH_DATE_TIME)}
        </span>
      ),
      meta: { headerTitle: "Date & Time", skeleton: SKELETON_DATE },
      size: 180,
    },
    {
      id: "location",
      accessorFn: (row) => row.location,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Location" visibility />
      ),
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.location || "\u2014"}
        </span>
      ),
      meta: { headerTitle: "Location", skeleton: SKELETON_LOCATION },
      size: 160,
    },
    {
      id: "team",
      accessorFn: (row) => row.team?.name,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Team" visibility />
      ),
      cell: ({ row }) => (
        <button
          className="truncate text-left text-sm hover:underline"
          onClick={() => {
            const teamId = row.original.teamId;
            if (teamId) {
              navigate({ to: "/teams/$id", params: { id: teamId } });
            }
          }}
          type="button"
        >
          {row.original.team?.name || "\u2014"}
        </button>
      ),
      meta: { headerTitle: "Team", skeleton: SKELETON_TEAM },
      size: 160,
    },
    {
      id: "members",
      accessorFn: (row) => row.members.length,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Volunteers" visibility />
      ),
      cell: ({ row }) => (
        <Badge variant="secondary">{row.original.members.length}</Badge>
      ),
      meta: { headerTitle: "Volunteers", skeleton: SKELETON_COUNT },
      size: 120,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <InterestCell
          eventId={row.original.eventId}
          members={row.original.members}
          myInterests={myInterests}
          myTeamIds={myTeamIds}
          onShowInterest={onShowInterest}
          startTime={row.original.startTime}
          teamId={row.original.team?.id}
          userId={userId}
        />
      ),
      meta: { skeleton: SKELETON_INTEREST },
      size: 150,
      minSize: 150,
      enableHiding: false,
      enableColumnOrdering: false,
      enableResizing: false,
      enableSorting: false,
    },
  ];

  return (
    <DataTableWrapper<PublicDisplayRow>
      columns={columns}
      data={displayRows}
      defaultColumnPinning={{ right: ["actions"] }}
      emptyMessage="No public events found."
      getRowId={(row) => `${row.eventId}-${row.startTime}`}
      isLoading={isLoading}
      searchFn={searchDisplayRow}
      searchPlaceholder="Search events..."
      storageKey="public_events_table_v2"
      tableLayout={{
        columnsResizable: true,
        columnsDraggable: true,
        columnsVisibility: true,
        columnsPinnable: true,
      }}
    />
  );
}
