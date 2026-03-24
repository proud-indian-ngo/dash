import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu";
import type { User } from "@pi-dash/zero/schema";
import type { VisibilityState } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { FormModal } from "@/components/form/form-modal";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { BanUserForm } from "@/components/users/ban-user-form";
import { PasswordForm } from "@/components/users/password-form";
import {
  type EditUserFormValues,
  toEditUserFormValues,
  UserForm,
} from "@/components/users/user-form";
import { UserNotificationsForm } from "@/components/users/user-notifications-form";
import { searchUser } from "@/components/users/user-search";
import { createUserColumns } from "@/components/users/user-table-columns";
import { authClient } from "@/lib/auth-client";

type RowFormKind = "ban" | "delete" | "edit" | "notifications" | "password";
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
        <DropdownMenuItem
          onClick={() => {
            onOpenForm("notifications");
          }}
        >
          Notifications
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
      onCloseForm("notifications");
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
  const isNotificationsOpen =
    activeRowForm?.userId === user.id && activeRowForm.kind === "notifications";

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

      <FormModal
        description="View and update notification preferences for this user."
        onOpenChange={(open) => {
          if (!open) {
            onCloseForm("notifications");
          }
        }}
        open={isNotificationsOpen}
        title={`Notifications: ${user.name}`}
      >
        {isNotificationsOpen ? (
          <UserNotificationsForm
            key={`notifications-${user.id}`}
            userId={user.id}
          />
        ) : null}
      </FormModal>

      <ConfirmDialog
        confirmLabel="Delete user"
        description={`Are you sure you want to delete ${user.name}? This action cannot be undone.`}
        loading={isDeleting}
        loadingLabel="Deleting..."
        onConfirm={onDelete}
        onOpenChange={(open: boolean) => {
          if (!open) {
            onCloseForm("delete");
          }
        }}
        open={isDeleteOpen && !isSelf}
        title="Delete user"
      />
    </>
  );
}

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

  const columns = useMemo(
    () =>
      createUserColumns((user) => (
        <UserRowActions
          activeRowForm={activeRowForm}
          onBanUser={onBanUser}
          onCloseForm={(kind) => {
            setActiveRowForm((current) =>
              current?.kind === kind && current.userId === user.id
                ? null
                : current
            );
          }}
          onDelete={onDelete}
          onOpenForm={(kind) => {
            setActiveRowForm({
              kind,
              userId: user.id,
            });
          }}
          onSetPassword={onSetPassword}
          onUnbanUser={onUnbanUser}
          onUpdateUser={onUpdateUser}
          user={user}
        />
      )),
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
