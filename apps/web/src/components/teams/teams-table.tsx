import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type {
  Team,
  TeamMember,
  User,
  WhatsappGroup,
} from "@pi-dash/zero/schema";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";

export type TeamRow = Team & {
  members: ReadonlyArray<TeamMember & { user: User | undefined }>;
  whatsappGroup: WhatsappGroup | undefined;
};

const SKELETON_NAME = <Skeleton className="h-5 w-40" />;
const SKELETON_DESC = <Skeleton className="h-5 w-48" />;
const SKELETON_COUNT = <Skeleton className="h-5 w-12" />;
const SKELETON_WA = <Skeleton className="h-5 w-32" />;

function RowActions({
  canDelete,
  id,
  onNavigate,
  onRequestDelete,
}: {
  canDelete: boolean;
  id: string;
  onNavigate: (id: string) => void;
  onRequestDelete: (id: string) => void;
}) {
  const stableOnClick0 = useEventCallback(
    (e: { stopPropagation: () => void }) => e.stopPropagation()
  );
  const stableOnClick1 = useEventCallback(() => onNavigate(id));
  const handleDelete = useEventCallback(() => onRequestDelete(id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Row actions"
            className="size-8"
            data-testid="row-actions"
            onClick={stableOnClick0}
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
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem onClick={stableOnClick1}>View</DropdownMenuItem>
        {canDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDelete} variant="destructive">
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TeamNameButton({
  id,
  name,
  onNavigate,
}: {
  id: string;
  name: string;
  onNavigate: (id: string) => void;
}) {
  const handleClick = useEventCallback(() => onNavigate(id));

  return (
    <button
      className="truncate text-left font-medium text-sm hover:underline"
      data-testid="row-title"
      onClick={handleClick}
      type="button"
    >
      {name}
    </button>
  );
}

function searchTeam(row: TeamRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [row.name, row.description ?? ""].join(" ").toLowerCase().includes(q);
}

interface TeamsTableProps {
  data: TeamRow[];
  isLoading?: boolean;
  onDelete: (id: string) => Promise<void>;
  onNavigate: (id: string) => void;
  toolbarActions?: ReactNode;
}

export function TeamsTable({
  data,
  isLoading,
  onDelete,
  onNavigate,
  toolbarActions,
}: TeamsTableProps) {
  const { hasPermission } = useApp();
  const canDeleteTeam = hasPermission("teams.delete");

  const deleteAction = useConfirmAction<string>({
    onConfirm: async (id) => {
      await onDelete(id);
      return { type: "ok" };
    },
    onError: () => toast.error("Couldn't delete team"),
  });
  const handleDeleteRequest = useEventCallback((id: string) =>
    deleteAction.trigger(id)
  );

  const columns: ColumnDef<TeamRow>[] = [
    {
      accessorFn: (row) => row.name,
      cell: ({ row }) => (
        <TeamNameButton
          id={row.original.id}
          name={row.original.name}
          onNavigate={onNavigate}
        />
      ),
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Name" visibility={true} />
      ),
      id: "name",
      meta: { headerTitle: "Name", skeleton: SKELETON_NAME },
      size: 200,
    },
    {
      accessorFn: (row) => row.description,
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.description || "—"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Description"
          visibility={true}
        />
      ),
      id: "description",
      meta: { headerTitle: "Description", skeleton: SKELETON_DESC },
      size: 280,
    },
    {
      accessorFn: (row) => row.members.length,
      cell: ({ row }) => (
        <span className="text-sm">{row.original.members.length}</span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Members"
          visibility={true}
        />
      ),
      id: "members",
      meta: { headerTitle: "Members", skeleton: SKELETON_COUNT },
      size: 100,
    },
    {
      accessorFn: (row) => row.whatsappGroup?.name,
      cell: ({ row }) => (
        <span className="truncate text-muted-foreground text-sm">
          {row.original.whatsappGroup?.name || "—"}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="WhatsApp Group"
          visibility={true}
        />
      ),
      id: "whatsappGroup",
      meta: { headerTitle: "WhatsApp Group", skeleton: SKELETON_WA },
      size: 180,
    },
    {
      cell: ({ row }) => (
        <RowActions
          canDelete={canDeleteTeam}
          id={row.original.id}
          onNavigate={onNavigate}
          onRequestDelete={handleDeleteRequest}
        />
      ),
      enableColumnOrdering: false,
      enableHiding: false,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "actions",
      meta: { cellClassName: "text-center", stopRowClick: true },
      minSize: 52,
      size: 52,
    },
  ];
  const stableGetRowId2 = useEventCallback((row: { id: string }) => row.id);
  const stableOnRowClick3 = useEventCallback((row: { id: string }) =>
    onNavigate(row.id)
  );
  const stableOnOpenChange4 = useEventCallback((open: boolean) => {
    if (!open) {
      deleteAction.cancel();
    }
  });

  return (
    <>
      <DataTableWrapper<TeamRow>
        columns={columns}
        data={data}
        emptyMessage="No teams found."
        getRowId={stableGetRowId2}
        isLoading={isLoading}
        onRowClick={stableOnRowClick3}
        searchFn={searchTeam}
        searchPlaceholder="Search teams..."
        storageKey="teams_table_state_v1"
        tableLayout={{
          columnsDraggable: true,
          columnsPinnable: true,
          columnsResizable: true,
          columnsVisibility: true,
        }}
        toolbarActions={toolbarActions}
      />
      <ConfirmDialog
        confirmLabel="Delete"
        description="This will permanently delete this team and remove all members. This action cannot be undone."
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={stableOnOpenChange4}
        open={deleteAction.isOpen}
        title="Delete team"
      />
    </>
  );
}
