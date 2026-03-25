import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import type { User } from "@pi-dash/zero/schema";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { parseAsString, useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { TableFilterSelect } from "@/components/data-table/table-filter-select";
import { FormModal } from "@/components/form/form-modal";
import { StatsCards } from "@/components/stats/stats-cards";
import {
  type CreateUserFormValues,
  defaultCreateUserFormValues,
  type EditUserFormValues,
  UserForm,
} from "@/components/users/user-form";
import { computeUserStats } from "@/components/users/user-stats";
import { UsersTable } from "@/components/users/users-table";
import {
  createUserAdmin,
  deleteUserAdmin,
  setUserBanAdmin,
  setUserPasswordAdmin,
  updateUserAdmin,
} from "@/functions/user-admin";
import { getErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/_app/users")({
  head: () => ({
    meta: [{ title: `Users | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    if (context.session.user.role !== "admin") {
      throw redirect({
        to: "/",
      });
    }
    context.zero?.run(queries.user.all());
  },
  component: UsersRouteComponent,
});

const ROLE_OPTIONS = [
  { label: "Admin", value: "admin" },
  { label: "Volunteer", value: "volunteer" },
];
const ORIENTATION_OPTIONS = [
  { label: "Attended", value: "yes" },
  { label: "Pending", value: "no" },
];
const ACTIVE_OPTIONS = [
  { label: "Active", value: "yes" },
  { label: "Inactive", value: "no" },
];

function UsersRouteComponent() {
  const createUser = useServerFn(createUserAdmin);
  const updateUser = useServerFn(updateUserAdmin);
  const setUserBan = useServerFn(setUserBanAdmin);
  const setPassword = useServerFn(setUserPasswordAdmin);
  const deleteUser = useServerFn(deleteUserAdmin);
  const [usersData, queryResult] = useQuery(queries.user.all());
  const isLoading = queryResult.type === "unknown";

  const allUsers = (usersData ?? []) as User[];
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [roleFilter, setRoleFilter] = useQueryState(
    "role",
    parseAsString.withDefault("")
  );
  const [orientationFilter, setOrientationFilter] = useQueryState(
    "orientation",
    parseAsString.withDefault("")
  );
  const [activeFilter, setActiveFilter] = useQueryState(
    "active",
    parseAsString.withDefault("")
  );

  const users = (() => {
    let filtered = allUsers;
    if (roleFilter) {
      filtered = filtered.filter((u) => u.role === roleFilter);
    }
    if (orientationFilter) {
      filtered = filtered.filter((u) =>
        orientationFilter === "yes"
          ? u.attendedOrientation
          : !u.attendedOrientation
      );
    }
    if (activeFilter) {
      filtered = filtered.filter((u) =>
        activeFilter === "yes" ? u.isActive : !u.isActive
      );
    }
    return filtered;
  })();

  const handleCreateUser = async (value: CreateUserFormValues) => {
    try {
      await createUser({ data: value });
      toast.success("User created");
      setCreateModalOpen(false);
    } catch (error) {
      log.error({
        component: "UsersRoute",
        action: "createUser",
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  const handleUpdateUser = async (value: EditUserFormValues) => {
    try {
      await updateUser({ data: value });
      toast.success("User updated");
    } catch (error) {
      log.error({
        component: "UsersRoute",
        action: "updateUser",
        userId: value.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  const handleResetPassword = async (userId: string, newPassword: string) => {
    try {
      await setPassword({
        data: {
          newPassword,
          userId,
        },
      });
      toast.success("Password updated");
    } catch (error) {
      log.error({
        component: "UsersRoute",
        action: "resetPassword",
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteUser({
        data: {
          userId,
        },
      });
      toast.success("User deleted");
    } catch (error) {
      log.error({
        component: "UsersRoute",
        action: "deleteUser",
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  const handleBanUser = async (
    userId: string,
    banReason: string,
    banExpires?: string
  ) => {
    try {
      await setUserBan({
        data: {
          banExpires,
          banReason,
          banned: true,
          userId,
        },
      });
      toast.success("User banned");
    } catch (error) {
      log.error({
        component: "UsersRoute",
        action: "banUser",
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  const handleUnbanUser = async (userId: string) => {
    try {
      await setUserBan({
        data: {
          banned: false,
          userId,
        },
      });
      toast.success("User unbanned");
    } catch (error) {
      log.error({
        component: "UsersRoute",
        action: "unbanUser",
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error(getErrorMessage(error));
      throw error;
    }
  };

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <h1 className="font-semibold text-2xl">Users</h1>

      <div className="fade-in-0 mt-4 grid animate-in gap-6 fill-mode-backwards duration-200 *:min-w-0">
        <StatsCards isLoading={isLoading} items={computeUserStats(allUsers)} />
        <UsersTable
          isLoading={isLoading}
          onBanUser={handleBanUser}
          onDelete={handleDeleteUser}
          onSetPassword={handleResetPassword}
          onUnbanUser={handleUnbanUser}
          onUpdateUser={handleUpdateUser}
          toolbarActions={
            <Button
              onClick={() => {
                setCreateModalOpen(true);
              }}
              size="sm"
              type="button"
            >
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add user
            </Button>
          }
          toolbarFilters={
            <>
              <TableFilterSelect
                label="Role"
                onChange={setRoleFilter}
                options={ROLE_OPTIONS}
                value={roleFilter}
              />
              <TableFilterSelect
                label="Orientation"
                onChange={setOrientationFilter}
                options={ORIENTATION_OPTIONS}
                value={orientationFilter}
              />
              <TableFilterSelect
                label="Active"
                onChange={setActiveFilter}
                options={ACTIVE_OPTIONS}
                value={activeFilter}
              />
            </>
          }
          users={users}
        />
      </div>

      <FormModal
        description="Create a new user account with an initial password."
        onOpenChange={setCreateModalOpen}
        open={createModalOpen}
        title="Create User"
      >
        {createModalOpen ? (
          <UserForm
            initialValues={defaultCreateUserFormValues}
            mode="create"
            onCancel={() => setCreateModalOpen(false)}
            onSubmit={handleCreateUser}
          />
        ) : null}
      </FormModal>
    </div>
  );
}
