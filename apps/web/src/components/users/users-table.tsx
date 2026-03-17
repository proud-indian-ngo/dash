import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/reui/badge";
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
import type { User } from "@pi-dash/zero/schema";
import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import { format } from "date-fns";
import capitalize from "lodash/capitalize";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { FormModal } from "@/components/form/form-modal";
import { UserAvatar } from "@/components/shared/user-avatar";
import { BanUserForm } from "@/components/users/ban-user-form";
import { DeleteUserDialog } from "@/components/users/delete-user-dialog";
import { PasswordForm } from "@/components/users/password-form";
import {
  type EditUserFormValues,
  toEditUserFormValues,
  UserForm,
} from "@/components/users/user-form";
import { authClient } from "@/lib/auth-client";

type RowFormKind = "ban" | "delete" | "edit" | "password";
type RowFormAction = {
  kind: RowFormKind;
  userId: string;
} | null;

interface UsersTableProps {
  isLoading?: boolean;
  onBanUser: (
    userId: string,
    banReason: string,
    banExpires?: string
  ) => Promise<void>;
  onDelete: (userId: string) => Promise<void>;
  onSetPassword: (userId: string, newPassword: string) => Promise<void>;
  onUnbanUser: (userId: string) => Promise<void>;
  onUpdateUser: (value: EditUserFormValues) => Promise<void>;
  toolbarActions?: ReactNode;
  toolbarFilters?: ReactNode;
  users: User[];
}

interface UserActionsMenuProps {
  isBanning: boolean;
  isDeleting: boolean;
  onOpenForm: (kind: RowFormKind) => void;
  onUnbanUser: () => Promise<void>;
  user: User;
}

interface UserRowActionDialogsProps {
  activeRowForm: RowFormAction;
  isDeleting: boolean;
  onBanUser: (
    userId: string,
    banReason: string,
    banExpires?: string
  ) => Promise<void>;
  onCloseForm: (kind: RowFormKind) => void;
  onDelete: () => Promise<void>;
  onSetPassword: (userId: string, newPassword: string) => Promise<void>;
  onUpdateUser: (value: EditUserFormValues) => Promise<void>;
  user: User;
}

interface UserRowActionsProps
  extends Omit<UsersTableProps, "users" | "toolbarActions"> {
  activeRowForm: RowFormAction;
  onCloseForm: (kind: RowFormKind) => void;
  onOpenForm: (kind: RowFormKind) => void;
  user: User;
}

const SKELETON_NAME = (
  <div className="flex h-10.25 items-center gap-3">
    <Skeleton className="size-8 rounded-full" />
    <div className="space-y-1">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-3 w-20" />
    </div>
  </div>
);
const SKELETON_ROLE = <Skeleton className="h-6 w-16" />;
const SKELETON_GENDER = <Skeleton className="h-5 w-14" />;
const SKELETON_DOB = <Skeleton className="h-5 w-20" />;
const SKELETON_ACTIVE = <Skeleton className="h-6 w-14" />;
const SKELETON_ORIENTATION = <Skeleton className="h-6 w-20" />;
const SKELETON_BANNED = (
  <div className="flex items-center gap-1.5">
    <Skeleton className="size-2 rounded-full" />
    <Skeleton className="h-4 w-10" />
  </div>
);
const SKELETON_CREATED_AT = <Skeleton className="h-5 w-32" />;
const SKELETON_WHATSAPP = <Skeleton className="h-6 w-14" />;

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  dob: false,
  gender: false,
  isOnWhatsapp: false,
};

function UserActionsMenu({
  isBanning,
  isDeleting,
  onOpenForm,
  onUnbanUser,
  user,
}: UserActionsMenuProps) {
  const { data: session } = authClient.useSession();
  const isSelf = user.id === (session?.user?.id ?? "");
  const isBanned = Boolean(user.banned);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Row actions"
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
        <DropdownMenuItem
          onClick={() => {
            onOpenForm("edit");
          }}
        >
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onOpenForm("password");
          }}
        >
          Reset password
        </DropdownMenuItem>
        {isBanned ? (
          <DropdownMenuItem
            disabled={isSelf || isBanning}
            onClick={async () => {
              await onUnbanUser();
            }}
          >
            {isBanning ? "Unbanning..." : "Unban user"}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={isSelf || isBanning}
            onClick={() => {
              onOpenForm("ban");
            }}
          >
            Ban user
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isSelf || isDeleting}
          onClick={() => {
            onOpenForm("delete");
          }}
          variant="destructive"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserRowActions({
  activeRowForm,
  onBanUser,
  onCloseForm,
  onDelete,
  onOpenForm,
  onSetPassword,
  onUnbanUser,
  onUpdateUser,
  user,
}: UserRowActionsProps) {
  const [isBanning, setIsBanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete(user.id);
      onCloseForm("delete");
      onCloseForm("edit");
      onCloseForm("password");
      onCloseForm("ban");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleUnban = async () => {
    try {
      setIsBanning(true);
      await onUnbanUser(user.id);
    } finally {
      setIsBanning(false);
    }
  };

  const handleBan = async (
    userId: string,
    banReason: string,
    banExpires?: string
  ) => {
    try {
      setIsBanning(true);
      await onBanUser(userId, banReason, banExpires);
    } finally {
      setIsBanning(false);
    }
  };

  return (
    <>
      <UserActionsMenu
        isBanning={isBanning}
        isDeleting={isDeleting}
        onOpenForm={onOpenForm}
        onUnbanUser={handleUnban}
        user={user}
      />
      <UserRowActionDialogs
        activeRowForm={activeRowForm}
        isDeleting={isDeleting}
        onBanUser={handleBan}
        onCloseForm={onCloseForm}
        onDelete={handleDelete}
        onSetPassword={onSetPassword}
        onUpdateUser={onUpdateUser}
        user={user}
      />
    </>
  );
}

function UserRowActionDialogs({
  activeRowForm,
  isDeleting,
  onBanUser,
  onCloseForm,
  onDelete,
  onSetPassword,
  onUpdateUser,
  user,
}: UserRowActionDialogsProps) {
  const { data: session } = authClient.useSession();
  const isSelf = user.id === (session?.user?.id ?? "");
  const isDeleteOpen =
    activeRowForm?.userId === user.id && activeRowForm.kind === "delete";
  const isEditOpen =
    activeRowForm?.userId === user.id && activeRowForm.kind === "edit";
  const isPasswordOpen =
    activeRowForm?.userId === user.id && activeRowForm.kind === "password";
  const isBanOpen =
    activeRowForm?.userId === user.id && activeRowForm.kind === "ban";

  return (
    <>
      <FormModal
        description="Update user profile details, status flags, and role."
        onOpenChange={(open) => {
          if (!open) {
            onCloseForm("edit");
          }
        }}
        open={isEditOpen}
        title={`Edit ${user.name}`}
      >
        {isEditOpen ? (
          <UserForm
            initialValues={toEditUserFormValues(user)}
            key={`edit-${user.id}`}
            mode="edit"
            onCancel={() => onCloseForm("edit")}
            onSubmit={async (value) => {
              await onUpdateUser(value);
              onCloseForm("edit");
            }}
          />
        ) : null}
      </FormModal>

      <FormModal
        description="Set a new password without changing profile details."
        onOpenChange={(open) => {
          if (!open) {
            onCloseForm("password");
          }
        }}
        open={isPasswordOpen}
        title={`Reset Password: ${user.name}`}
      >
        {isPasswordOpen ? (
          <PasswordForm
            key={`password-${user.id}`}
            onCancel={() => onCloseForm("password")}
            onSubmit={async (value) => {
              await onSetPassword(value.userId, value.newPassword);
              onCloseForm("password");
            }}
            user={user}
          />
        ) : null}
      </FormModal>

      <FormModal
        description="Ban this user as a separate admin action."
        onOpenChange={(open) => {
          if (!open) {
            onCloseForm("ban");
          }
        }}
        open={isBanOpen}
        title={`Ban ${user.name}`}
      >
        {isBanOpen ? (
          <BanUserForm
            key={`ban-${user.id}`}
            onCancel={() => onCloseForm("ban")}
            onSubmit={async (value) => {
              await onBanUser(
                value.userId,
                value.banReason ?? "",
                value.banExpires
              );
              onCloseForm("ban");
            }}
            user={user}
          />
        ) : null}
      </FormModal>

      <DeleteUserDialog
        disabled={isSelf}
        isDeleting={isDeleting}
        onConfirm={onDelete}
        onOpenChange={(open) => {
          if (!open) {
            onCloseForm("delete");
          }
        }}
        open={isDeleteOpen}
        userId={user.id}
        userName={user.name}
      />
    </>
  );
}

const searchUser = (user: User, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }

  const dobText = user.dob == null ? "" : format(user.dob, "dd/MM/yyyy");

  return [
    user.name,
    user.email,
    user.phone ?? "",
    user.gender ?? "",
    dobText,
    user.banReason ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(q);
};

export function UsersTable({
  isLoading,
  onBanUser,
  onDelete,
  onSetPassword,
  onUnbanUser,
  onUpdateUser,
  toolbarActions,
  toolbarFilters,
  users,
}: UsersTableProps) {
  const [activeRowForm, setActiveRowForm] = useState<RowFormAction>(null);

  const handleFilteredDataChange = useCallback(
    (filtered: User[]) => {
      if (
        activeRowForm &&
        !filtered.some((u) => u.id === activeRowForm.userId)
      ) {
        setActiveRowForm(null);
      }
    },
    [activeRowForm]
  );

  const columns = useMemo<ColumnDef<User>[]>(
    () => [
      {
        id: "name",
        accessorFn: (row) => row.name,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="User"
            visibility={true}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <UserAvatar className="size-8" user={row.original} />
            <div className="space-y-px">
              <div className="font-medium text-foreground">
                {row.original.name}
              </div>
              <div className="truncate text-muted-foreground text-xs">
                {row.original.email}
              </div>
            </div>
          </div>
        ),
        meta: {
          headerTitle: "User",
          skeleton: SKELETON_NAME,
        },
        size: 240,
      },
      {
        id: "role",
        accessorFn: (row) => (row.role === "admin" ? "admin" : "volunteer"),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Role"
            visibility={true}
          />
        ),
        cell: ({ row }) =>
          row.original.role === "admin" ? (
            <Badge variant="info-outline">Admin</Badge>
          ) : (
            <Badge variant="secondary">Volunteer</Badge>
          ),
        meta: {
          headerTitle: "Role",
          skeleton: SKELETON_ROLE,
        },
        size: 120,
      },
      {
        id: "gender",
        accessorFn: (row) => (row.gender ? capitalize(row.gender) : "—"),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Gender"
            visibility={true}
          />
        ),
        meta: {
          headerTitle: "Gender",
          skeleton: SKELETON_GENDER,
        },
        size: 110,
      },
      {
        id: "dob",
        accessorFn: (row) => {
          if (row.dob == null) {
            return "—";
          }
          return format(row.dob, "dd/MM/yyyy");
        },
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="DOB" visibility={true} />
        ),
        meta: {
          headerTitle: "DOB",
          skeleton: SKELETON_DOB,
        },
        size: 120,
      },
      {
        id: "active",
        accessorFn: (row) => (row.isActive ? "yes" : "no"),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Active"
            visibility={true}
          />
        ),
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="success-outline">Active</Badge>
          ) : (
            <Badge variant="destructive-outline">Inactive</Badge>
          ),
        meta: {
          headerTitle: "Active",
          skeleton: SKELETON_ACTIVE,
        },
        size: 110,
      },
      {
        id: "attendedOrientation",
        accessorFn: (row) => (row.attendedOrientation ? "yes" : "no"),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Orientation"
            visibility={true}
          />
        ),
        cell: ({ row }) =>
          row.original.attendedOrientation ? (
            <Badge variant="success-outline">Attended</Badge>
          ) : (
            <Badge variant="warning-outline">Pending</Badge>
          ),
        meta: {
          headerTitle: "Orientation",
          skeleton: SKELETON_ORIENTATION,
        },
        size: 140,
      },
      {
        id: "isOnWhatsapp",
        accessorFn: (row) => (row.isOnWhatsapp ? "yes" : "no"),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="WhatsApp"
            visibility={true}
          />
        ),
        cell: ({ row }) =>
          row.original.isOnWhatsapp ? (
            <Badge variant="success-outline">Yes</Badge>
          ) : (
            <Badge variant="secondary">No</Badge>
          ),
        meta: {
          headerTitle: "WhatsApp",
          skeleton: SKELETON_WHATSAPP,
        },
        size: 110,
      },
      {
        id: "banned",
        accessorFn: (row) => (row.banned ? "yes" : "no"),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Banned"
            visibility={true}
          />
        ),
        cell: ({ row }) => {
          const isBanned = Boolean(row.original.banned);
          return (
            <div className="flex items-center gap-1.5">
              <div
                className={`size-2 rounded-full ${isBanned ? "bg-destructive" : "bg-green-500"}`}
              />
              <span className="text-muted-foreground text-sm">
                {isBanned ? "Banned" : "Active"}
              </span>
            </div>
          );
        },
        meta: {
          headerTitle: "Banned",
          skeleton: SKELETON_BANNED,
        },
        size: 110,
      },
      {
        id: "createdAt",
        accessorFn: (row) => {
          if (row.createdAt == null) {
            return "—";
          }
          return format(row.createdAt, "dd/MM/yyyy, HH:mm:ss");
        },
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Created"
            visibility={true}
          />
        ),
        meta: {
          headerTitle: "Created",
          skeleton: SKELETON_CREATED_AT,
        },
        size: 180,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <UserRowActions
            activeRowForm={activeRowForm}
            onBanUser={onBanUser}
            onCloseForm={(kind) => {
              setActiveRowForm((current) =>
                current?.kind === kind && current.userId === row.original.id
                  ? null
                  : current
              );
            }}
            onDelete={onDelete}
            onOpenForm={(kind) => {
              setActiveRowForm({
                kind,
                userId: row.original.id,
              });
            }}
            onSetPassword={onSetPassword}
            onUnbanUser={onUnbanUser}
            onUpdateUser={onUpdateUser}
            user={row.original}
          />
        ),
        enableHiding: false,
        enableResizing: false,
        enableSorting: false,
        enableColumnOrdering: false,
        meta: {
          cellClassName: "text-center",
        },
        size: 52,
        minSize: 52,
      },
    ],
    [
      activeRowForm,
      onBanUser,
      onDelete,
      onSetPassword,
      onUnbanUser,
      onUpdateUser,
    ]
  );

  return (
    <DataTableWrapper<User>
      columns={columns}
      data={users}
      defaultColumnVisibility={DEFAULT_COLUMN_VISIBILITY}
      emptyMessage="No users found."
      getRowId={(user) => user.id}
      isLoading={isLoading}
      onFilteredDataChange={handleFilteredDataChange}
      paginationSizes={[10, 20, 50]}
      searchFn={searchUser}
      searchPlaceholder="Search users..."
      storageKey="users_table_state_v1"
      tableLayout={{
        columnsMovable: true,
        columnsResizable: true,
        columnsDraggable: true,
        columnsVisibility: true,
        columnsPinnable: true,
      }}
      toolbarActions={toolbarActions}
      toolbarFilters={toolbarFilters}
    />
  );
}
