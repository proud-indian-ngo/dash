import { Badge } from "@pi-dash/design-system/components/reui/badge";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { queries } from "@pi-dash/zero/queries";
import type { TeamEvent, TeamEventMember } from "@pi-dash/zero/schema";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { useMemo } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";

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

export const Route = createFileRoute("/_app/events/")({
  loader: ({ context }) => {
    context.zero?.run(queries.teamEvent.public());
  },
  component: PublicEventsRouteComponent,
});

function PublicEventsRouteComponent() {
  const navigate = useNavigate();
  const [data, result] = useQuery(queries.teamEvent.public());
  const isLoading = result.type === "unknown";

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
        meta: { headerTitle: "Event" },
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
        meta: { headerTitle: "Date & Time" },
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
        meta: { headerTitle: "Location" },
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
        meta: { headerTitle: "Team" },
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
        meta: { headerTitle: "Volunteers" },
        size: 90,
      },
    ],
    [navigate]
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
    </div>
  );
}
