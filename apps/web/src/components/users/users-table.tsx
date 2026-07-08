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
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { User } from "@pi-dash/zero/schema";
import type { VisibilityState } from "@tanstack/react-table";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useState } from "react";
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
  hasActiveFilters?: boolean;
  isLoading?: boolean;
  onBanUser: (
    userId: string,
    banReason: string,
    banExpires?: string
  ) => Promise<void>;
  onClearFilters?: () => void;
  onDelete: (userId: string) => Promise<void>;
  onRowClick?: (user: User) => void;
  onSetPassword: (userId: string, newPassword: string) => Promise<void>;
  onUnbanUser: (userId: string) => Promise<void>;
  onUpdateUser: (value: EditUserFormValues) => Promise<void>;
  roleOptions?: { label: string; value: string }[];
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
  roleOptions?: { label: string; value: string }[];
  user: User;
}

interface UserRowActionsProps {
  isBanning: boolean;
  isDeleting: boolean;
  onOpenForm: (userId: string, kind: RowFormKind) => void;
  onSetBanningUserId: Dispatch<SetStateAction<string | null>>;
  onUnbanUser: (userId: string) => Promise<void>;
  user: User;
}

interface UserActionsCellProps {
  isBanning: boolean;
  isDeleting: boolean;
  onOpenForm: (userId: string, kind: RowFormKind) => void;
  onSetBanningUserId: Dispatch<SetStateAction<string | null>>;
  onUnbanUser: (userId: string) => Promise<void>;
  user: User;
}

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = {
  banExpires: false,
  banReason: false,
  dob: false,
  emailVerified: false,
  gender: false,
  isOnWhatsapp: false,
  phone: false,
  updatedAt: false,
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
  const stableOnClick0 = useEventCallback(
    (e: { stopPropagation: () => void }) => e.stopPropagation()
  );
  const stableOnClick1 = useEventCallback(() => {
    onOpenForm("edit");
  });
  const stableOnClick2 = useEventCallback(() => {
    onOpenForm("password");
  });
  const stableOnClick3 = useEventCallback(() => {
    onOpenForm("notifications");
  });
  const stableOnClick4 = useEventCallback(async () => {
    await onUnbanUser();
  });
  const stableOnClick5 = useEventCallback(() => {
    onOpenForm("ban");
  });
  const stableOnClick6 = useEventCallback(() => {
    onOpenForm("delete");
  });

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
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={stableOnClick1}>Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={stableOnClick2}>
          Reset password
        </DropdownMenuItem>
        <DropdownMenuItem onClick={stableOnClick3}>
          Notifications
        </DropdownMenuItem>
        {isBanned ? (
          <DropdownMenuItem
            disabled={isSelf || isBanning}
            onClick={stableOnClick4}
          >
            {isBanning ? "Unbanning..." : "Unban user"}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled={isSelf || isBanning}
            onClick={stableOnClick5}
          >
            Ban user
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={isSelf || isDeleting}
          onClick={stableOnClick6}
          variant="destructive"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserRowActions({
  isBanning,
  isDeleting,
  onOpenForm,
  onSetBanningUserId,
  onUnbanUser,
  user,
}: UserRowActionsProps) {
  const handleUnban = useEventCallback(async () => {
    try {
      onSetBanningUserId(user.id);
      await onUnbanUser(user.id);
    } finally {
      onSetBanningUserId(null);
    }
  });

  const handleOpenForm = useEventCallback((kind: RowFormKind) => {
    onOpenForm(user.id, kind);
  });

  return (
    <UserActionsMenu
      isBanning={isBanning}
      isDeleting={isDeleting}
      onOpenForm={handleOpenForm}
      onUnbanUser={handleUnban}
      user={user}
    />
  );
}

function UserActionsCell({
  isBanning,
  isDeleting,
  onOpenForm,
  onSetBanningUserId,
  onUnbanUser,
  user,
}: UserActionsCellProps) {
  return (
    <UserRowActions
      isBanning={isBanning}
      isDeleting={isDeleting}
      onOpenForm={onOpenForm}
      onSetBanningUserId={onSetBanningUserId}
      onUnbanUser={onUnbanUser}
      user={user}
    />
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
  roleOptions,
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
  const stableOnOpenChange7 = useEventCallback((open: boolean) => {
    if (!open) {
      onCloseForm("edit");
    }
  });
  const stableOnCancel8 = useEventCallback(() => onCloseForm("edit"));
  const stableOnSubmit9 = useEventCallback(
    async (value: EditUserFormValues) => {
      await onUpdateUser(value);
      onCloseForm("edit");
    }
  );
  const stableOnOpenChange10 = useEventCallback((open: boolean) => {
    if (!open) {
      onCloseForm("password");
    }
  });
  const stableOnCancel11 = useEventCallback(() => onCloseForm("password"));
  const stableOnSubmit12 = useEventCallback(
    async (value: { newPassword: string; userId: string }) => {
      await onSetPassword(value.userId, value.newPassword);
      onCloseForm("password");
    }
  );
  const stableOnOpenChange13 = useEventCallback((open: boolean) => {
    if (!open) {
      onCloseForm("ban");
    }
  });
  const stableOnCancel14 = useEventCallback(() => onCloseForm("ban"));
  const stableOnSubmit15 = useEventCallback(
    async (value: {
      banExpires?: string;
      banReason?: string;
      userId: string;
    }) => {
      await onBanUser(value.userId, value.banReason ?? "", value.banExpires);
      onCloseForm("ban");
    }
  );
  const stableOnOpenChange16 = useEventCallback((open: boolean) => {
    if (!open) {
      onCloseForm("notifications");
    }
  });
  const stableOnOpenChange17 = useEventCallback((open: boolean) => {
    if (!open) {
      onCloseForm("delete");
    }
  });

  return (
    <>
      <FormModal
        description="Update user profile details, status flags, and role."
        onOpenChange={stableOnOpenChange7}
        open={isEditOpen}
        title={`Edit ${user.name}`}
      >
        {isEditOpen ? (
          <UserForm
            initialValues={toEditUserFormValues(user)}
            key={`edit-${user.id}`}
            mode="edit"
            onCancel={stableOnCancel8}
            onSubmit={stableOnSubmit9}
            roleOptions={roleOptions}
          />
        ) : null}
      </FormModal>

      <FormModal
        description="Set a new password without changing profile details."
        onOpenChange={stableOnOpenChange10}
        open={isPasswordOpen}
        title={`Reset Password: ${user.name}`}
      >
        {isPasswordOpen ? (
          <PasswordForm
            key={`password-${user.id}`}
            onCancel={stableOnCancel11}
            onSubmit={stableOnSubmit12}
            user={user}
          />
        ) : null}
      </FormModal>

      <FormModal
        description="Ban this user as a separate admin action."
        onOpenChange={stableOnOpenChange13}
        open={isBanOpen}
        title={`Ban ${user.name}`}
      >
        {isBanOpen ? (
          <BanUserForm
            key={`ban-${user.id}`}
            onCancel={stableOnCancel14}
            onSubmit={stableOnSubmit15}
            user={user}
          />
        ) : null}
      </FormModal>

      <FormModal
        description="View and update notification preferences for this user."
        onOpenChange={stableOnOpenChange16}
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
        onOpenChange={stableOnOpenChange17}
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
  onRowClick,
  onSetPassword,
  onUnbanUser,
  onUpdateUser,
  roleOptions,
  toolbarActions,
  toolbarFilters,
  hasActiveFilters,
  onClearFilters,
  users,
}: UsersTableProps) {
  const [activeRowForm, setActiveRowForm] = useState<RowFormAction>(null);
  const [banningUserId, setBanningUserId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const activeUser =
    activeRowForm === null
      ? null
      : (users.find((user) => user.id === activeRowForm.userId) ?? null);

  const closeForm = useEventCallback((kind: RowFormKind) => {
    setActiveRowForm((current) => (current?.kind === kind ? null : current));
  });

  const openForm = useEventCallback((userId: string, kind: RowFormKind) => {
    setActiveRowForm({ kind, userId });
  });

  const handleDialogDelete = useEventCallback(async () => {
    if (activeRowForm === null) {
      return;
    }
    try {
      setIsDeleting(true);
      await onDelete(activeRowForm.userId);
      setActiveRowForm(null);
    } finally {
      setIsDeleting(false);
    }
  });

  const handleDialogBan = useEventCallback(
    async (userId: string, banReason: string, banExpires?: string) => {
      try {
        setBanningUserId(userId);
        await onBanUser(userId, banReason, banExpires);
        setActiveRowForm(null);
      } finally {
        setBanningUserId(null);
      }
    }
  );

  const handleDialogUpdateUser = useEventCallback(
    async (value: EditUserFormValues) => {
      await onUpdateUser(value);
      setActiveRowForm(null);
    }
  );

  const handleDialogSetPassword = useEventCallback(
    async (userId: string, newPassword: string) => {
      await onSetPassword(userId, newPassword);
      setActiveRowForm(null);
    }
  );

  const handleFilteredDataChange = useEventCallback((filtered: User[]) => {
    if (activeRowForm && !filtered.some((u) => u.id === activeRowForm.userId)) {
      setActiveRowForm(null);
    }
  });

  const renderActions = useEventCallback((user: User) => (
    <UserActionsCell
      isBanning={banningUserId === user.id}
      isDeleting={isDeleting}
      onOpenForm={openForm}
      onSetBanningUserId={setBanningUserId}
      onUnbanUser={onUnbanUser}
      user={user}
    />
  ));

  const columns = createUserColumns(renderActions);
  const stableGetRowId18 = useEventCallback((user: { id: string }) => user.id);

  return (
    <>
      <DataTableWrapper<User>
        columns={columns}
        data={users}
        defaultColumnVisibility={DEFAULT_COLUMN_VISIBILITY}
        emptyMessage="No users found."
        getRowId={stableGetRowId18}
        hasActiveFilters={hasActiveFilters}
        isLoading={isLoading}
        onClearFilters={onClearFilters}
        onFilteredDataChange={handleFilteredDataChange}
        onRowClick={onRowClick}
        paginationSizes={[10, 20, 50]}
        searchFn={searchUser}
        searchPlaceholder="Search users..."
        storageKey="users_table_state_v1"
        tableLayout={{
          columnsDraggable: true,
          columnsMovable: true,
          columnsPinnable: true,
          columnsResizable: true,
          columnsVisibility: true,
        }}
        toolbarActions={toolbarActions}
        toolbarFilters={toolbarFilters}
      />
      {activeUser ? (
        <UserRowActionDialogs
          activeRowForm={activeRowForm}
          isDeleting={isDeleting}
          onBanUser={handleDialogBan}
          onCloseForm={closeForm}
          onDelete={handleDialogDelete}
          onSetPassword={handleDialogSetPassword}
          onUpdateUser={handleDialogUpdateUser}
          roleOptions={roleOptions}
          user={activeUser}
        />
      ) : null}
    </>
  );
}
