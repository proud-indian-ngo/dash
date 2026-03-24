import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { mutators } from "@pi-dash/zero/mutators";
import type {
  EventInterest,
  TeamEvent,
  TeamEventMember,
} from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { useMemo } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { handleMutationResult } from "@/lib/mutation-result";

export type PublicEventRow = TeamEvent & {
  members: readonly TeamEventMember[];
  team: { id: string; name: string } | undefined;
};

interface PublicEventsTableProps {
  data: PublicEventRow[];
  isAdmin: boolean;
  isLoading?: boolean;
  myInterests: readonly EventInterest[];
  myTeamIds: ReadonlySet<string>;
  onShowInterest: (eventId: string) => void;
  userId: string;
}

function searchEvent(row: PublicEventRow, query: string): boolean {
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
  member: { label: "Joined", variant: "default" as const },
  approved: { label: "Interest Approved", variant: "default" as const },
  rejected: { label: "Interest Declined", variant: "secondary" as const },
};

function InterestCell({
  eventId,
  isAdmin,
  myInterests,
  myTeamIds,
  members,
  onShowInterest,
  startTime,
  teamId,
  userId,
}: {
  eventId: string;
  isAdmin: boolean;
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

  if (hasStarted || isAdmin || (teamId && myTeamIds.has(teamId))) {
    return null;
  }

  return (
    <Button
      onClick={(e) => {
        e.stopPropagation();
        onShowInterest(eventId);
      }}
      size="sm"
      variant="outline"
    >
      Show Interest
    </Button>
  );
}

export function PublicEventsTable({
  data,
  isAdmin,
  isLoading,
  myInterests,
  myTeamIds,
  onShowInterest,
  userId,
}: PublicEventsTableProps) {
  const navigate = useNavigate();

  const columns = useMemo<ColumnDef<PublicEventRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Event"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <Link
            className="font-medium text-sm hover:underline"
            params={{ id: row.original.id }}
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
          <DataGridColumnHeader
            column={column}
            title="Date & Time"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-sm">
            {format(row.original.startTime, "MMM d, yyyy h:mm a")}
          </span>
        ),
        meta: { headerTitle: "Date & Time", skeleton: SKELETON_DATE },
        size: 180,
      },
      {
        id: "location",
        accessorFn: (row) => row.location,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Location"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
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
          <DataGridColumnHeader
            column={column}
            title="Team"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <button
            className="text-left text-sm hover:underline"
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
          <DataGridColumnHeader
            column={column}
            title="Volunteers"
            visibility={true}
          />
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
            eventId={row.original.id}
            isAdmin={isAdmin}
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
    ],
    [navigate, userId, isAdmin, myTeamIds, myInterests, onShowInterest]
  );

  return (
    <DataTableWrapper<PublicEventRow>
      columns={columns}
      data={data}
      defaultColumnPinning={{ right: ["actions"] }}
      emptyMessage="No public events found."
      getRowId={(row) => row.id}
      isLoading={isLoading}
      searchFn={searchEvent}
      searchPlaceholder="Search events..."
      storageKey="public_events_table_state_v1"
      tableLayout={{
        columnsResizable: true,
        columnsDraggable: true,
        columnsVisibility: true,
        columnsPinnable: true,
      }}
    />
  );
}
