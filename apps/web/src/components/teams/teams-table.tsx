import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@pi-dash/design-system/components/ui/alert-dialog";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import type {
  Team,
  TeamMember,
  User,
  WhatsappGroup,
} from "@pi-dash/zero/schema";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { authClient } from "@/lib/auth-client";

export type TeamRow = Team & {
  members: ReadonlyArray<TeamMember & { user: User | undefined }>;
  whatsappGroup: WhatsappGroup | undefined;
};

const SKELETON_NAME = <Skeleton className="h-5 w-40" />;
const SKELETON_DESC = <Skeleton className="h-5 w-48" />;
const SKELETON_COUNT = <Skeleton className="h-5 w-12" />;
const SKELETON_WA = <Skeleton className="h-5 w-32" />;

function ActionsMenu({
  isAdmin,
  onNavigate,
  onRequestDelete,
  teamId,
}: {
  isAdmin: boolean;
  onNavigate: (id: string) => void;
  onRequestDelete: (id: string) => void;
  teamId: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
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
      <DropdownMenuContent align="end" className="w-32">
        <DropdownMenuItem onClick={() => onNavigate(teamId)}>
          View
        </DropdownMenuItem>
        {isAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onRequestDelete(teamId)}
              variant="destructive"
            >
              Delete
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const { data: session } = authClient.useSession();
  const isAdmin = session?.user?.role === "admin";

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleRequestDelete = useCallback((id: string) => {
    setDeleteTargetId(id);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTargetId) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(deleteTargetId);
      setDeleteTargetId(null);
    } catch {
      toast.error("Failed to delete team");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTargetId, onDelete]);

  const columns = useMemo<ColumnDef<TeamRow>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Name"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <button
            className="text-left font-medium text-sm hover:underline"
            data-testid="row-title"
            onClick={() => onNavigate(row.original.id)}
            type="button"
          >
            {row.original.name}
          </button>
        ),
        meta: { headerTitle: "Name", skeleton: SKELETON_NAME },
        size: 200,
      },
      {
        id: "description",
        accessorFn: (row) => row.description,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Description"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.description || "—"}
          </span>
        ),
        meta: { headerTitle: "Description", skeleton: SKELETON_DESC },
        size: 280,
      },
      {
        id: "members",
        accessorFn: (row) => row.members.length,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Members"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-sm">{row.original.members.length}</span>
        ),
        meta: { headerTitle: "Members", skeleton: SKELETON_COUNT },
        size: 100,
      },
      {
        id: "whatsappGroup",
        accessorFn: (row) => row.whatsappGroup?.name,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="WhatsApp Group"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {row.original.whatsappGroup?.name || "—"}
          </span>
        ),
        meta: { headerTitle: "WhatsApp Group", skeleton: SKELETON_WA },
        size: 180,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <ActionsMenu
            isAdmin={isAdmin}
            onNavigate={onNavigate}
            onRequestDelete={handleRequestDelete}
            teamId={row.original.id}
          />
        ),
        enableHiding: false,
        enableResizing: false,
        enableSorting: false,
        enableColumnOrdering: false,
        meta: { cellClassName: "text-center" },
        size: 52,
        minSize: 52,
      },
    ],
    [isAdmin, onNavigate, handleRequestDelete]
  );

  return (
    <>
      <DataTableWrapper<TeamRow>
        columns={columns}
        data={data}
        emptyMessage="No teams found."
        getRowId={(row) => row.id}
        isLoading={isLoading}
        searchFn={searchTeam}
        searchPlaceholder="Search teams..."
        storageKey="teams_table_state_v1"
        tableLayout={{
          columnsResizable: true,
          columnsDraggable: true,
          columnsVisibility: true,
          columnsPinnable: true,
        }}
        toolbarActions={toolbarActions}
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
          }
        }}
        open={deleteTargetId !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this team and remove all members.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isDeleting}
              size="default"
              variant="outline"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              variant="destructive"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
