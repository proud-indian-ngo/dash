import { Edit02Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";

import { COLUMN_ICONS } from "@/components/data-table/column-icons";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { RowActionsButton } from "@/components/shared/row-actions-button";

import { DONOR_FILTER_FIELDS, getDonorFilterValue } from "./donor-filters";
import { activeRoleLabels, type PartyRow } from "./party-row";

const SKELETON_NAME = <Skeleton className="h-5 w-40" />;
const SKELETON_KIND = <Skeleton className="h-5 w-20" />;
const SKELETON_ROLES = <Skeleton className="h-5 w-32" />;

function RowActions({
  canManage,
  onEdit,
  onView,
  party,
}: {
  canManage: boolean;
  onEdit: (party: PartyRow) => void;
  onView: (party: PartyRow) => void;
  party: PartyRow;
}) {
  const stop = useEventCallback((e: { stopPropagation: () => void }) =>
    e.stopPropagation()
  );
  const handleView = useEventCallback(() => onView(party));
  const handleEdit = useEventCallback(() => onEdit(party));
  return (
    <ResponsiveActionMenu
      actions={[
        { icon: ViewIcon, id: "view", label: "View", onSelect: handleView },
        canManage && {
          icon: Edit02Icon,
          id: "edit",
          label: "Edit",
          onSelect: handleEdit,
        },
      ]}
      title={`${party.displayName} actions`}
      trigger={<RowActionsButton onClick={stop} />}
    />
  );
}

function searchParty(row: PartyRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.displayName, row.legalName ?? "", ...activeRoleLabels(row)]
    .join(" ")
    .toLowerCase()
    .includes(q);
}

export function DonorsTable({
  canManage,
  data,
  isLoading,
  onEdit,
  onView,
}: {
  canManage: boolean;
  data: PartyRow[];
  isLoading?: boolean;
  onEdit: (party: PartyRow) => void;
  onView: (party: PartyRow) => void;
}) {
  const columns: DataGridColumnDef<PartyRow>[] = [
    {
      accessorFn: (row) => row.displayName,
      cell: ({ row }) => (
        <span className="truncate text-sm font-medium">
          {row.original.displayName}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      id: "displayName",
      meta: {
        compact: "primary",
        headerTitle: "Name",
        kind: "text",
        skeleton: SKELETON_NAME,
      },
      size: 240,
    },
    {
      accessorFn: (row) => row.kind,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.kind === "organisation" ? "Organisation" : "Person"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Kind" visibility={true} />
      ),
      id: "kind",
      meta: {
        headerTitle: "Kind",
        icon: COLUMN_ICONS.kind,
        kind: "text",
        skeleton: SKELETON_KIND,
      },
      size: 120,
    },
    {
      accessorFn: (row) => activeRoleLabels(row).join(", "),
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-1">
          {activeRoleLabels(row.original).map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Roles" visibility={true} />
      ),
      id: "roles",
      meta: {
        compact: "primary",
        headerTitle: "Roles",
        icon: COLUMN_ICONS.role,
        kind: "text",
        skeleton: SKELETON_ROLES,
      },
      size: 220,
    },
    {
      cell: ({ row }) => (
        <RowActions
          canManage={canManage}
          onEdit={onEdit}
          onView={onView}
          party={row.original}
        />
      ),
      id: "actions",
      meta: {
        enableColumnOrdering: false,
        headerTitle: "",
        skeleton: <Skeleton className="size-7" />,
      },
      size: 48,
    },
  ];

  return (
    <DataTableWrapper
      columns={columns}
      compactOnMobile
      data={data}
      emptyMessage="No donors yet."
      filter={{ fields: DONOR_FILTER_FIELDS, getValue: getDonorFilterValue }}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      onRowClick={onView}
      searchFn={searchParty}
      searchPlaceholder="Search donors..."
      storageKey="donors_table_state_v1"
      tableLayout={{
        columnsDraggable: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsVisibility: true,
      }}
    />
  );
}
