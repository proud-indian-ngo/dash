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

interface UserRowActionsProps
  extends Omit<UsersTableProps, "users" | "toolbarActions"> {
  activeRowForm: RowFormAction;
  onCloseForm: (kind: RowFormKind) => void;
  onOpenForm: (kind: RowFormKind) => void;
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
  const stableOnClick0 = (e: any) => e.stopPropagation();
  const stableOnClick1 = () => {
    onOpenForm("edit");
  };
  const stableOnClick2 = () => {
    onOpenForm("password");
  };
  const stableOnClick3 = () => {
    onOpenForm("notifications");
  };
  const stableOnClick4 = async () => {
    await onUnbanUser();
  };
  const stableOnClick5 = () => {
    onOpenForm("ban");
  };
  const stableOnClick6 = () => {
    onOpenForm("delete");
  };

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
  activeRowForm,
  onBanUser,
  onCloseForm,
  onDelete,
  onOpenForm,
  onSetPassword,
  onUnbanUser,
  onUpdateUser,
  roleOptions,
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
        roleOptions={roleOptions}
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
  const stableOnOpenChange7 = (open: any) => {
    if (!open) {
      onCloseForm("edit");
    }
  };
  const stableOnCancel8 = () => onCloseForm("edit");
  const stableOnSubmit9 = async (value: any) => {
    await onUpdateUser(value);
    onCloseForm("edit");
  };
  const stableOnOpenChange10 = (open: any) => {
    if (!open) {
      onCloseForm("password");
    }
  };
  const stableOnCancel11 = () => onCloseForm("password");
  const stableOnSubmit12 = async (value: any) => {
    await onSetPassword(value.userId, value.newPassword);
    onCloseForm("password");
  };
  const stableOnOpenChange13 = (open: any) => {
    if (!open) {
      onCloseForm("ban");
    }
  };
  const stableOnCancel14 = () => onCloseForm("ban");
  const stableOnSubmit15 = async (value: any) => {
    await onBanUser(value.userId, value.banReason ?? "", value.banExpires);
    onCloseForm("ban");
  };
  const stableOnOpenChange16 = (open: any) => {
    if (!open) {
      onCloseForm("notifications");
    }
  };
  const stableOnOpenChange17 = (open: boolean) => {
    if (!open) {
      onCloseForm("delete");
    }
  };

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

  const handleFilteredDataChange = (filtered: User[]) => {
    if (
      activeRowForm &&
      !filtered.some((u: any) => u.id === activeRowForm.userId)
    ) {
      setActiveRowForm(null);
    }
  };

  const columns = createUserColumns((user: any) => (
    <UserRowActions
      activeRowForm={activeRowForm}
      onBanUser={onBanUser}
      onCloseForm={(kind: any) => {
        setActiveRowForm((current: any) =>
          current?.kind === kind && current.userId === user.id ? null : current
        );
      }}
      onDelete={onDelete}
      onOpenForm={(kind: any) => {
        setActiveRowForm({
          kind,
          userId: user.id,
        });
      }}
      onSetPassword={onSetPassword}
      onUnbanUser={onUnbanUser}
      onUpdateUser={onUpdateUser}
      roleOptions={roleOptions}
      user={user}
    />
  ));
  const stableGetRowId18 = (user: any) => user.id;
  const stableOnFilteredDataChange8 = handleFilteredDataChange;

  return (
    <DataTableWrapper<User>
      columns={columns}
      data={users}
      defaultColumnVisibility={DEFAULT_COLUMN_VISIBILITY}
      emptyMessage="No users found."
      getRowId={stableGetRowId18}
      hasActiveFilters={hasActiveFilters}
      isLoading={isLoading}
      onClearFilters={onClearFilters}
      onFilteredDataChange={stableOnFilteredDataChange8}
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
  );
}
