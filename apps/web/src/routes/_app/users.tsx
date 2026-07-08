import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import type { User } from "@pi-dash/zero/schema";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TableFilterSelect } from "@/components/data-table/table-filter-select";
import { FormModal } from "@/components/form/form-modal";
import { StatsCards } from "@/components/stats/stats-cards";
import { UserDetailSheet } from "@/components/users/user-detail-sheet";
import {
  type CreateUserFormValues,
  defaultCreateUserFormValues,
  type EditUserFormValues,
  UserForm,
} from "@/components/users/user-form";
import { computeUserStats } from "@/components/users/user-stats";
import { UsersTable } from "@/components/users/users-table";
import { getRoleOptions } from "@/functions/role-admin";
import {
  createUserAdmin,
  deleteUserAdmin,
  setUserBanAdmin,
  setUserPasswordAdmin,
  updateUserAdmin,
} from "@/functions/user-admin";
import { getErrorMessage } from "@/lib/errors";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/users")({
  beforeLoad: ({ context }) => assertPermission(context, "users.manage"),
  component: UsersRouteComponent,
  head: () => ({
    meta: [{ title: `Users | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context }) => {
    context.zero?.preload(queries.user.all());
  },
});

const ACTIVE_OPTIONS = [
  { label: "Active", value: "yes" },
  { label: "Inactive", value: "no" },
];
const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];
const BANNED_OPTIONS = [
  { label: "Banned", value: "yes" },
  { label: "Not Banned", value: "no" },
];

function UsersRouteComponent() {
  const createUser = useServerFn(createUserAdmin);
  const updateUser = useServerFn(updateUserAdmin);
  const setUserBan = useServerFn(setUserBanAdmin);
  const setPassword = useServerFn(setUserPasswordAdmin);
  const deleteUser = useServerFn(deleteUserAdmin);
  const [usersData, queryResult] = useQuery(queries.user.all());
  const isLoading = usersData.length === 0 && queryResult.type !== "complete";

  const allUsers = (usersData ?? []) as User[];
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = selectedUserId
    ? (allUsers.find((u) => u.id === selectedUserId) ?? null)
    : null;
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [roleSelectOptions, setRoleSelectOptions] = useState<
    { label: string; value: string }[]
  >([]);

  useEffect(() => {
    getRoleOptions()
      .then((roles) => {
        if (!roles) {
          return;
        }
        setRoleSelectOptions(
          roles.map((r) => ({ label: r.name, value: r.id }))
        );
      })
      .catch((error: unknown) => {
        log.error({
          action: "getRoleOptions",
          component: "UsersRoute",
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, []);

  const [roleFilter, setRoleFilter] = useQueryState(
    "role",
    parseAsString.withDefault("")
  );
  const [activeFilter, setActiveFilter] = useQueryState(
    "active",
    parseAsString.withDefault("")
  );
  const [genderFilter, setGenderFilter] = useQueryState(
    "gender",
    parseAsString.withDefault("")
  );
  const [bannedFilter, setBannedFilter] = useQueryState(
    "banned",
    parseAsString.withDefault("")
  );

  const users = (() => {
    let filtered = allUsers;
    if (roleFilter) {
      filtered = filtered.filter((u) => u.role === roleFilter);
    }
    if (activeFilter) {
      filtered = filtered.filter((u) =>
        activeFilter === "yes" ? u.isActive : !u.isActive
      );
    }
    if (genderFilter) {
      filtered = filtered.filter((u) => u.gender === genderFilter);
    }
    if (bannedFilter) {
      filtered = filtered.filter((u) =>
        bannedFilter === "yes" ? u.banned : !u.banned
      );
    }
    return filtered;
  })();

  const hasActiveFilters = !!(
    roleFilter ||
    activeFilter ||
    genderFilter ||
    bannedFilter
  );

  const clearFilters = useEventCallback(() => {
    setRoleFilter("");
    setActiveFilter("");
    setGenderFilter("");
    setBannedFilter("");
  });

  const handleCreateUser = useEventCallback(
    async (value: CreateUserFormValues) => {
      try {
        await createUser({ data: value });
        toast.success("User created!");
        setCreateModalOpen(false);
      } catch (error) {
        log.error({
          action: "createUser",
          component: "UsersRoute",
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error(getErrorMessage(error));
        throw error;
      }
    }
  );

  const handleUpdateUser = useEventCallback(
    async (value: EditUserFormValues) => {
      try {
        await updateUser({ data: value });
        toast.success("Changes saved");
      } catch (error) {
        log.error({
          action: "updateUser",
          component: "UsersRoute",
          error: error instanceof Error ? error.message : String(error),
          userId: value.userId,
        });
        toast.error(getErrorMessage(error));
        throw error;
      }
    }
  );

  const handleResetPassword = useEventCallback(
    async (userId: string, newPassword: string) => {
      try {
        await setPassword({
          data: {
            newPassword,
            userId,
          },
        });
        toast.success("Password updated!");
      } catch (error) {
        log.error({
          action: "resetPassword",
          component: "UsersRoute",
          error: error instanceof Error ? error.message : String(error),
          userId,
        });
        toast.error(getErrorMessage(error));
        throw error;
      }
    }
  );

  const handleDeleteUser = useEventCallback(async (userId: string) => {
    try {
      await deleteUser({
        data: {
          userId,
        },
      });
      toast.success("User removed");
    } catch (error) {
      log.error({
        action: "deleteUser",
        component: "UsersRoute",
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      toast.error(getErrorMessage(error));
      throw error;
    }
  });

  const handleBanUser = useEventCallback(
    async (userId: string, banReason: string, banExpires?: string) => {
      try {
        await setUserBan({
          data: {
            banExpires,
            banned: true,
            banReason,
            userId,
          },
        });
        toast.success("User has been banned");
      } catch (error) {
        log.error({
          action: "banUser",
          component: "UsersRoute",
          error: error instanceof Error ? error.message : String(error),
          userId,
        });
        toast.error(getErrorMessage(error));
        throw error;
      }
    }
  );

  const handleUnbanUser = useEventCallback(async (userId: string) => {
    try {
      await setUserBan({
        data: {
          banned: false,
          userId,
        },
      });
      toast.success("User has been unbanned");
    } catch (error) {
      log.error({
        action: "unbanUser",
        component: "UsersRoute",
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      toast.error(getErrorMessage(error));
      throw error;
    }
  });
  const stableOnRowClick0 = useEventCallback((user: { id: string }) =>
    setSelectedUserId(user.id)
  );
  const stableOnClick1 = useEventCallback(() => {
    setCreateModalOpen(true);
  });
  const stableOnOpenChange2 = useEventCallback((open: boolean) => {
    if (!open) {
      setSelectedUserId(null);
    }
  });
  const stableOnCancel3 = useEventCallback(() => setCreateModalOpen(false));

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        Users
      </h1>

      <div className="mt-4 grid gap-6 *:min-w-0">
        <StatsCards isLoading={isLoading} items={computeUserStats(allUsers)} />
        <UsersTable
          hasActiveFilters={hasActiveFilters}
          isLoading={isLoading}
          onBanUser={handleBanUser}
          onClearFilters={clearFilters}
          onDelete={handleDeleteUser}
          onRowClick={stableOnRowClick0}
          onSetPassword={handleResetPassword}
          onUnbanUser={handleUnbanUser}
          onUpdateUser={handleUpdateUser}
          roleOptions={roleSelectOptions}
          toolbarActions={
            <Button onClick={stableOnClick1} size="sm" type="button">
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
                options={roleSelectOptions}
                value={roleFilter}
              />
              <TableFilterSelect
                label="Active"
                onChange={setActiveFilter}
                options={ACTIVE_OPTIONS}
                value={activeFilter}
              />
              <TableFilterSelect
                label="Gender"
                onChange={setGenderFilter}
                options={GENDER_OPTIONS}
                value={genderFilter}
              />
              <TableFilterSelect
                label="Banned"
                onChange={setBannedFilter}
                options={BANNED_OPTIONS}
                value={bannedFilter}
              />
            </>
          }
          users={users}
        />
        <UserDetailSheet
          onOpenChange={stableOnOpenChange2}
          open={!!selectedUser}
          user={selectedUser}
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
            onCancel={stableOnCancel3}
            onSubmit={handleCreateUser}
            roleOptions={roleSelectOptions}
          />
        ) : null}
      </FormModal>
    </div>
  );
}
