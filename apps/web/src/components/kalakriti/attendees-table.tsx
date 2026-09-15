import {
  Cancel01Icon,
  MoreVerticalIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import type { ReactNode } from "react";
import { useMemo } from "react";

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { selectField } from "@/components/data-table/filter-fields";

export interface AttendeeRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  humanId: string;
  kind: "guest" | "judge";
  operations: readonly {
    type: string;
    supersededByOperationId: string | null;
  }[];
  judgeAssignments: readonly {
    competitionId: string;
    competition?: { name: string } | null;
  }[];
}
export function attendeeStatus(row: AttendeeRow, type: string) {
  return row.operations.some(
    (operation) => operation.type === type && !operation.supersededByOperationId
  );
}
export function AttendeeStatus({
  row,
  type,
  ready,
}: {
  row: AttendeeRow;
  type: string;
  ready: boolean;
}) {
  if (!ready) return <Skeleton className="h-5 w-12" />;
  const yes = attendeeStatus(row, type);
  const label =
    type === "attendee_check_in"
      ? yes
        ? "Checked in"
        : "Not checked in"
      : yes
        ? "Served"
        : "Not served";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={
        yes
          ? "inline-flex text-green-600 dark:text-green-400"
          : "inline-flex text-red-600 dark:text-red-400"
      }
    >
      <HugeiconsIcon
        aria-hidden="true"
        icon={yes ? Tick02Icon : Cancel01Icon}
        className="size-5"
        strokeWidth={2}
      />
    </span>
  );
}
const filterFields: FilterField[] = [
  ...(
    [
      ["name", "Name"],
      ["humanId", "Yearly ID"],
      ["phone", "Phone"],
      ["email", "Email"],
    ] as const
  ).map(([id, label]): FilterField => ({ id, label, type: "text" })),
  ...(
    [
      ["attendee_check_in", "Checked in"],
      ["breakfast", "Breakfast"],
      ["lunch", "Lunch"],
    ] as const
  ).map(([id, label]) =>
    selectField(id, label, [
      { label: "Yes", value: "yes" },
      { label: "No", value: "no" },
    ])
  ),
];
function getFilterValue(row: AttendeeRow, path: string) {
  if (path === "competitions")
    return (
      row.judgeAssignments
        .map((a) => a.competition?.name)
        .filter(Boolean)
        .join(", ") || "Unassigned"
    );
  if (["attendee_check_in", "breakfast", "lunch"].includes(path))
    return attendeeStatus(row, path) ? "yes" : "no";
  if (
    path === "name" ||
    path === "humanId" ||
    path === "phone" ||
    path === "email"
  )
    return row[path] ?? "";
  return undefined;
}
function search(row: AttendeeRow, query: string) {
  return [
    row.name,
    row.phone,
    row.email,
    row.humanId,
    ...row.judgeAssignments.map((a) => a.competition?.name),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query.toLowerCase());
}
export function AttendeesTable({
  data,
  kind,
  canManage,
  canEdit,
  isLoading,
  statusReady,
  onView,
  onEdit,
  onArchive,
  onAssign,
  toolbarActions,
}: {
  data: AttendeeRow[];
  kind: "guest" | "judge";
  canManage: boolean;
  canEdit: boolean;
  isLoading: boolean;
  statusReady: boolean;
  onView: (row: AttendeeRow) => void;
  onEdit: (row: AttendeeRow) => void;
  onArchive: (row: AttendeeRow) => void;
  onAssign: (row: AttendeeRow) => void;
  toolbarActions: ReactNode;
}) {
  const columns = useMemo<DataGridColumnDef<AttendeeRow>[]>(() => {
    const text = (
      id: string,
      title: string,
      get: (row: AttendeeRow) => string,
      size = 200
    ): DataGridColumnDef<AttendeeRow> => ({
      id,
      accessorFn: get,
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title={title} visibility={true} />
      ),
      cell: ({ row }) => (
        <span
          className={
            id === "name"
              ? "block truncate text-sm font-medium"
              : "block truncate text-sm"
          }
          title={get(row.original)}
          data-testid={id === "name" ? "row-title" : undefined}
        >
          {get(row.original)}
        </span>
      ),
      size,
      meta: { headerTitle: title, skeleton: <Skeleton className="h-5 w-28" /> },
    });
    return [
      text("name", "Name", (r) => r.name),
      text("humanId", "Yearly ID", (r) => r.humanId || "—", 190),
      text("phone", "Phone", (r) => r.phone, 160),
      text("email", "Email", (r) => r.email || "—", 240),
      ...(kind === "judge"
        ? [
            text(
              "competitions",
              "Competitions",
              (r) =>
                r.judgeAssignments
                  .map((a) => a.competition?.name)
                  .filter(Boolean)
                  .join(", ") || "Unassigned",
              280
            ),
          ]
        : []),
      ...(
        [
          ["attendee_check_in", "Checked in"],
          ["breakfast", "Breakfast"],
          ["lunch", "Lunch"],
        ] as const
      ).map(([type, title]): DataGridColumnDef<AttendeeRow> => ({
        id: type,
        size: 130,
        enableSorting: statusReady,
        accessorFn: (r) => (statusReady ? attendeeStatus(r, type) : undefined),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title={title}
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <AttendeeStatus row={row.original} type={type} ready={statusReady} />
        ),
        meta: {
          headerTitle: title,
          skeleton: <Skeleton className="h-5 w-12" />,
        },
      })),
      {
        id: "actions",
        size: 52,
        enableHiding: false,
        enableSorting: false,
        enableResizing: false,
        meta: {
          enableColumnOrdering: false,
          cellClassName: "text-center",
          headerTitle: "",
          skeleton: <Skeleton className="size-7" />,
          stopRowClick: true,
        },
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={`Actions for ${row.original.name}`}
                  onKeyDown={(event) => event.stopPropagation()}
                  data-testid="row-actions"
                  className="size-7"
                  size="icon"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    icon={MoreVerticalIcon}
                    className="size-4"
                    strokeWidth={2}
                  />
                </Button>
              }
            />
            <DropdownMenuContent
              align="end"
              onKeyDown={(event) => event.stopPropagation()}
            >
              <DropdownMenuItem onClick={() => onView(row.original)}>
                View details
              </DropdownMenuItem>
              {canEdit ? (
                <>
                  <DropdownMenuItem onClick={() => onEdit(row.original)}>
                    Edit
                  </DropdownMenuItem>
                  {kind === "judge" ? (
                    <DropdownMenuItem onClick={() => onAssign(row.original)}>
                      Assign competitions
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
              {canManage ? (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onArchive(row.original)}
                >
                  Archive
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ];
  }, [
    kind,
    canManage,
    canEdit,
    onView,
    onEdit,
    onArchive,
    onAssign,
    statusReady,
  ]);
  return (
    <DataTableWrapper
      filter={{
        fields:
          kind === "judge"
            ? [
                ...filterFields,
                { id: "competitions", label: "Competitions", type: "text" },
              ]
            : filterFields,
        getValue: (row, path) =>
          !statusReady &&
          ["attendee_check_in", "breakfast", "lunch"].includes(path.join("."))
            ? undefined
            : getFilterValue(row, path.join(".")),
      }}
      getRowId={(row) => row.id}
      columns={columns}
      data={data}
      onRowClick={onView}
      isLoading={isLoading}
      searchFn={search}
      emptyMessage={`No ${kind === "guest" ? "guests" : "judges"} found.`}
      storageKey={`kalakriti_${kind}_table_state_v1`}
      searchPlaceholder={`Search ${kind === "guest" ? "Guests" : "Judges"}...`}
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
      toolbarActions={toolbarActions}
    />
  );
}
