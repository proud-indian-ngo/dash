import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { format } from "date-fns";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import type { KalakritiEntryRow } from "./entry-form-dialog";

function searchEntries(row: KalakritiEntryRow, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return [
    ...row.members.flatMap((member) => [
      member.student.humanId,
      member.student.name,
    ]),
    row.session.competition.name,
    row.session.competition.category.name,
    row.session.ageCategory.name,
    row.session.venue.name,
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

function EntryRowActions({
  canEdit,
  entry,
  onEdit,
  onRemove,
}: {
  canEdit: boolean;
  entry: KalakritiEntryRow;
  onEdit: (entry: KalakritiEntryRow) => void;
  onRemove: (entry: KalakritiEntryRow) => void;
}) {
  const handleEdit = useEventCallback(() => onEdit(entry));
  const handleRemove = useEventCallback(() => onRemove(entry));
  const actionLabel =
    entry.participationMode === "group"
      ? `${entry.session.competition.name} group`
      : (entry.members[0]?.student.name ?? "Entry");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${actionLabel}`}
            className="size-7"
            data-testid="row-actions"
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
        {canEdit && entry.participationMode === "group" ? (
          <DropdownMenuItem onClick={handleEdit}>Edit Group</DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={handleRemove} variant="destructive">
          Remove Entry
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface EntryTableProps {
  canRegister: boolean;
  canRemove: boolean;
  data: KalakritiEntryRow[];
  isLoading: boolean;
  onEdit: (entry: KalakritiEntryRow) => void;
  onRegister: () => void;
  onRemove: (entry: KalakritiEntryRow) => void;
}

function getEntryRowId(entry: KalakritiEntryRow): string {
  return entry.id;
}

export function EntryTable({
  canRegister,
  canRemove,
  data,
  isLoading,
  onEdit,
  onRegister,
  onRemove,
}: EntryTableProps) {
  const columns: ColumnDef<KalakritiEntryRow>[] = [
    {
      accessorFn: (row) =>
        row.members.map((member) => member.student.humanId).join(" "),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-sm">
          {row.original.members.length > 0
            ? row.original.members.map((member) => (
                <span key={member.student.id}>{member.student.humanId}</span>
              ))
            : "Unknown"}
        </div>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Student IDs"
          visibility={true}
        />
      ),
      id: "studentId",
      meta: {
        headerTitle: "Student IDs",
        skeleton: <Skeleton className="h-5 w-24" />,
      },
      size: 135,
    },
    {
      accessorFn: (row) =>
        row.members.map((member) => member.student.name).join(" "),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-x-2 gap-y-1 font-medium text-sm">
          {row.original.members.length > 0
            ? row.original.members.map((member) => (
                <span key={member.student.id}>{member.student.name}</span>
              ))
            : "Unknown Student"}
        </div>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Participants"
          visibility={true}
        />
      ),
      id: "student",
      meta: {
        headerTitle: "Participants",
        skeleton: <Skeleton className="h-5 w-40" />,
      },
      size: 210,
    },
    {
      accessorFn: (row) => row.session.competition.name,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.session.competition.name}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Competition"
          visibility={true}
        />
      ),
      id: "competition",
      meta: {
        headerTitle: "Competition",
        skeleton: <Skeleton className="h-5 w-32" />,
      },
      size: 190,
    },
    {
      accessorFn: (row) => row.session.ageCategory.name,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.session.ageCategory.name}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Age Category"
          visibility={true}
        />
      ),
      id: "ageCategory",
      meta: {
        headerTitle: "Age Category",
        skeleton: <Skeleton className="h-5 w-24" />,
      },
      size: 145,
    },
    {
      accessorFn: (row) => row.session.startAt,
      cell: ({ row }) => (
        <span className="text-sm">
          {format(new Date(row.original.session.startAt), "dd MMM, h:mm a")}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Session"
          visibility={true}
        />
      ),
      id: "session",
      meta: {
        headerTitle: "Session",
        skeleton: <Skeleton className="h-5 w-28" />,
      },
      size: 175,
    },
    {
      accessorFn: (row) => row.session.venue.name,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.session.venue.name}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Venue" visibility={true} />
      ),
      id: "venue",
      meta: {
        headerTitle: "Venue",
        skeleton: <Skeleton className="h-5 w-24" />,
      },
      size: 160,
    },
    ...(canRemove
      ? [
          {
            cell: ({ row }: { row: { original: KalakritiEntryRow } }) => (
              <EntryRowActions
                canEdit={canRegister}
                entry={row.original}
                onEdit={onEdit}
                onRemove={onRemove}
              />
            ),
            enableHiding: false,
            header: () => null,
            id: "actions",
            meta: {
              headerTitle: "",
              skeleton: <Skeleton className="size-7" />,
            },
            size: 48,
          } satisfies ColumnDef<KalakritiEntryRow>,
        ]
      : []),
  ];

  return (
    <DataTableWrapper
      columns={columns}
      data={data}
      emptyMessage="No Competition Entries have been registered for this Center."
      getRowId={getEntryRowId}
      isLoading={isLoading}
      searchFn={searchEntries}
      searchPlaceholder="Search Entries..."
      storageKey="kalakriti_entries_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
      toolbarActions={
        canRegister ? (
          <Button onClick={onRegister}>Register Entry</Button>
        ) : null
      }
    />
  );
}
