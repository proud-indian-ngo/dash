import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import {
  KALAKRITI_GENDER_ELIGIBILITY_LABELS,
  type KalakritiGenderEligibility,
} from "@/lib/kalakriti-competition-labels";

export interface EntrySessionRow {
  ageCategoryName: string;
  categoryName: string;
  competitionName: string;
  endAt: number;
  entryCount: number;
  genderEligibility: KalakritiGenderEligibility;
  id: string;
  startAt: number;
  venueName: string;
}

function searchSessions(session: EntrySessionRow, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return (
    normalizedQuery.length === 0 ||
    [
      session.competitionName,
      session.categoryName,
      session.ageCategoryName,
      KALAKRITI_GENDER_ELIGIBILITY_LABELS[session.genderEligibility],
      session.venueName,
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  );
}

function getSessionRowId(session: EntrySessionRow): string {
  return session.id;
}

export function EntrySessionsTable({
  centerId,
  data,
  isLoading,
  year,
}: {
  centerId: string;
  data: EntrySessionRow[];
  isLoading: boolean;
  year: number;
}) {
  const columns: DataGridColumnDef<EntrySessionRow>[] = [
    {
      accessorKey: "competitionName",
      cell: ({ row }) => (
        <Link
          className="font-medium text-sm hover:underline"
          params={{ id: row.original.id, year: String(year) }}
          search={{ center: centerId }}
          to="/kalakriti/$year/entries/$id"
        >
          {row.original.competitionName}
        </Link>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Event" visibility={true} />
      ),
      id: "competitionName",
      meta: {
        headerTitle: "Event",
        skeleton: <Skeleton className="h-5 w-40" />,
      },
      size: 230,
    },
    {
      accessorKey: "categoryName",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Category"
          visibility={true}
        />
      ),
      id: "categoryName",
      meta: {
        headerTitle: "Category",
        skeleton: <Skeleton className="h-5 w-32" />,
      },
      size: 180,
    },
    {
      accessorKey: "ageCategoryName",
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Age Category"
          visibility={true}
        />
      ),
      id: "ageCategoryName",
      meta: {
        headerTitle: "Age Category",
        skeleton: <Skeleton className="h-5 w-24" />,
      },
      size: 150,
    },
    {
      accessorKey: "genderEligibility",
      cell: ({ row }) => (
        <span className="text-sm">
          {KALAKRITI_GENDER_ELIGIBILITY_LABELS[row.original.genderEligibility]}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Gender"
          visibility={true}
        />
      ),
      id: "genderEligibility",
      meta: {
        headerTitle: "Gender",
        skeleton: <Skeleton className="h-5 w-24" />,
      },
      size: 145,
    },
    {
      accessorKey: "startAt",
      cell: ({ row }) => (
        <span className="text-sm">
          {format(new Date(row.original.startAt), "dd MMM, h:mm a")}–
          {format(new Date(row.original.endAt), "h:mm a")}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Session"
          visibility={true}
        />
      ),
      id: "startAt",
      meta: {
        headerTitle: "Session",
        skeleton: <Skeleton className="h-5 w-28" />,
      },
      size: 220,
    },
    {
      accessorKey: "venueName",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Venue" visibility={true} />
      ),
      id: "venueName",
      meta: {
        headerTitle: "Venue",
        skeleton: <Skeleton className="h-5 w-28" />,
      },
      size: 170,
    },
    {
      accessorKey: "entryCount",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.entryCount}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Center Entries"
          visibility={true}
        />
      ),
      id: "entryCount",
      meta: {
        headerTitle: "Center Entries",
        skeleton: <Skeleton className="h-5 w-16" />,
      },
      size: 105,
    },
    {
      cell: ({ row }) => (
        <Button
          aria-label={`View entries for ${row.original.competitionName}, ${row.original.ageCategoryName}`}
          className="mx-auto size-7"
          render={
            <Link
              params={{
                id: row.original.id,
                year: String(year),
              }}
              search={{ center: centerId }}
              to="/kalakriti/$year/entries/$id"
            />
          }
          size="icon"
          variant="ghost"
        >
          <HugeiconsIcon
            className="size-4"
            icon={ArrowRight01Icon}
            strokeWidth={2}
          />
        </Button>
      ),
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: () => null,
      id: "actions",
      meta: {
        cellClassName: "text-center",
        enableColumnOrdering: false,
        headerTitle: "",
        skeleton: <Skeleton className="mx-auto size-7" />,
        stopRowClick: true,
      },
      size: 52,
    },
  ];

  return (
    <DataTableWrapper
      columns={columns}
      data={data}
      emptyMessage="No active individual Sessions are available."
      getRowId={getSessionRowId}
      isLoading={isLoading}
      searchFn={searchSessions}
      searchPlaceholder="Search Sessions..."
      storageKey="kalakriti_entry_sessions_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
    />
  );
}
