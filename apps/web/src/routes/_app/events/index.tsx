import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type {
  EventInterest,
  TeamEvent,
  TeamEventMember,
} from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ShowInterestDialog } from "@/components/teams/events/show-interest-dialog";

type PublicEventRow = TeamEvent & {
  members: readonly TeamEventMember[];
  team: { id: string; name: string } | undefined;
};

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
  myInterests,
  members,
  onShowInterest,
  userId,
}: {
  eventId: string;
  myInterests: readonly EventInterest[];
  members: readonly TeamEventMember[];
  onShowInterest: (eventId: string) => void;
  userId: string;
}) {
  const zero = useZero();

  if (members.some((m) => m.userId === userId)) {
    return <Badge variant="default">Joined</Badge>;
  }

  const interest = myInterests.find((i) => i.eventId === eventId);
  if (interest) {
    if (interest.status === "pending") {
      return (
        <Button
          onClick={async (e) => {
            e.stopPropagation();
            const res = await zero.mutate(
              mutators.eventInterest.cancel({ id: interest.id })
            ).server;
            if (res.type === "error") {
              toast.error("Failed to cancel interest");
            }
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

export const Route = createFileRoute("/_app/events/")({
  loader: ({ context }) => {
    context.zero?.run(queries.teamEvent.public());
    context.zero?.run(queries.eventInterest.byCurrentUser());
  },
  component: PublicEventsRouteComponent,
});

function PublicEventsRouteComponent() {
  const navigate = useNavigate();
  const { session } = Route.useRouteContext();
  const [data, result] = useQuery(queries.teamEvent.public());
  const [myInterests] = useQuery(queries.eventInterest.byCurrentUser());
  const isLoading = result.type === "unknown";

  const [interestEventId, setInterestEventId] = useState<string | null>(null);

  const handleShowInterest = useCallback((eventId: string) => {
    setInterestEventId(eventId);
  }, []);

  const columns = useMemo<ColumnDef<PublicEventRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Event" visibility />
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
            visibility
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
          <DataGridColumnHeader column={column} title="Location" visibility />
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
          <DataGridColumnHeader column={column} title="Team" visibility />
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
          <DataGridColumnHeader column={column} title="Volunteers" visibility />
        ),
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.members.length}</Badge>
        ),
        meta: { headerTitle: "Volunteers", skeleton: SKELETON_COUNT },
        size: 90,
      },
      {
        id: "interest",
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Interest" visibility />
        ),
        cell: ({ row }) => (
          <InterestCell
            eventId={row.original.id}
            members={row.original.members}
            myInterests={myInterests}
            onShowInterest={handleShowInterest}
            userId={session.user.id}
          />
        ),
        meta: { headerTitle: "Interest", skeleton: SKELETON_INTEREST },
        size: 150,
      },
    ],
    [navigate, session.user.id, myInterests, handleShowInterest]
  );

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Events</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Public events across all teams.
      </p>
      <div className="mt-6 grid gap-6">
        <DataTableWrapper<PublicEventRow>
          columns={columns}
          data={(data as PublicEventRow[]) ?? []}
          emptyMessage="No public events found."
          getRowId={(row) => row.id}
          isLoading={isLoading}
          searchFn={searchEvent}
          searchPlaceholder="Search events..."
          storageKey="public_events_table_v1"
          tableLayout={{
            columnsResizable: true,
            columnsVisibility: true,
          }}
        />
      </div>

      <ShowInterestDialog
        eventId={interestEventId ?? ""}
        onOpenChange={(open) => {
          if (!open) {
            setInterestEventId(null);
          }
        }}
        open={interestEventId !== null}
      />
    </div>
  );
}
