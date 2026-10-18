import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@pi-dash/design-system/components/reui/alert";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FormModal } from "@/components/form/form-modal";
import { PageHeader } from "@/components/shared/page-header";
import { TipStrip } from "@/components/shared/tip-strip";
import { StatsCards } from "@/components/stats/stats-cards";
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
import { type AdminUser, getAdminUsers } from "@/functions/user-admin-reads";
import { getErrorMessage } from "@/lib/errors";
import { assertPermission } from "@/lib/route-guards";

const USERS_REFRESH_INTERVAL_MS = 30_000;

export const Route = createFileRoute("/_app/users")({
  beforeLoad: ({ context }) => assertPermission(context, "users.manage"),
  component: UsersRouteComponent,
  head: () => ({
    meta: [{ title: `Users | ${env.VITE_APP_NAME}` }],
  }),
});

function UsersRouteComponent() {
  const createUser = useServerFn(createUserAdmin);
  const updateUser = useServerFn(updateUserAdmin);
  const setUserBan = useServerFn(setUserBanAdmin);
  const setPassword = useServerFn(setUserPasswordAdmin);
  const deleteUser = useServerFn(deleteUserAdmin);
  const loadUsers = useServerFn(getAdminUsers);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [hasLoadedUsers, setHasLoadedUsers] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingUsers, setIsRefreshingUsers] = useState(false);
  const [usersLoadError, setUsersLoadError] = useState(false);
  const usersRequestSequence = useRef(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = selectedUserId
    ? (allUsers.find((u) => u.id === selectedUserId) ?? null)
    : null;
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [roleSelectOptions, setRoleSelectOptions] = useState<
    { label: string; value: string }[]
  >([]);

  const refreshUsers = useEventCallback(async () => {
    const requestSequence = usersRequestSequence.current + 1;
    usersRequestSequence.current = requestSequence;
    setIsRefreshingUsers(true);
    if (!hasLoadedUsers) {
      setIsLoading(true);
    }
    try {
      const users = await loadUsers();
      if (requestSequence === usersRequestSequence.current) {
        setAllUsers(users);
        setHasLoadedUsers(true);
        setIsLoading(false);
        setIsRefreshingUsers(false);
        setUsersLoadError(false);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      if (requestSequence === usersRequestSequence.current) {
        if (errorMessage === "Unauthorized" || errorMessage === "Forbidden") {
          setAllUsers([]);
          setHasLoadedUsers(false);
        }
        setIsLoading(false);
        setIsRefreshingUsers(false);
        setUsersLoadError(true);
      }
      log.error({
        action: "getAdminUsers",
        component: "UsersRoute",
        error: errorMessage,
      });
    }
  });

  useEffect(() => {
    void refreshUsers();
    const refreshVisibleUsers = () => {
      if (document.visibilityState === "visible") {
        void refreshUsers();
      }
    };
    const refreshInterval = window.setInterval(
      refreshVisibleUsers,
      USERS_REFRESH_INTERVAL_MS
    );
    window.addEventListener("focus", refreshVisibleUsers);
    return () => {
      usersRequestSequence.current = usersRequestSequence.current + 1;
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshVisibleUsers);
    };
  }, [refreshUsers]);

  const retryUsers = useEventCallback(() => {
    void refreshUsers();
  });

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

  const handleCreateUser = useEventCallback(
    async (value: CreateUserFormValues) => {
      try {
        await createUser({ data: value });
        await refreshUsers();
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
        await refreshUsers();
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
        await refreshUsers();
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
      await refreshUsers();
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
        await refreshUsers();
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
      await refreshUsers();
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
      <PageHeader
        actions={
          <Button onClick={stableOnClick1} type="button">
            <HugeiconsIcon
              className="size-4"
              icon={PlusSignIcon}
              strokeWidth={2}
            />
            Add user
          </Button>
        }
        description="Everyone who can sign in, with their role and account status."
        title="Users"
      />
      <TipStrip className="mt-4" id="users-detail-sheet">
        Click anyone to see their details, edit them, or reset a password
        without leaving the list.
      </TipStrip>

      <div className="mt-4 grid gap-6 *:min-w-0">
        {usersLoadError ? (
          <Alert variant="destructive">
            <AlertTitle>
              {hasLoadedUsers
                ? "Users couldn't be refreshed"
                : "Users couldn't be loaded"}
            </AlertTitle>
            <AlertDescription>
              Check your connection and try again.
            </AlertDescription>
            <AlertAction>
              <Button
                disabled={isRefreshingUsers}
                onClick={retryUsers}
                size="sm"
                variant="outline"
              >
                {isRefreshingUsers ? "Retrying..." : "Retry"}
              </Button>
            </AlertAction>
          </Alert>
        ) : null}
        {hasLoadedUsers || !usersLoadError ? (
          <>
            <StatsCards
              isLoading={isLoading}
              items={computeUserStats(allUsers)}
            />
            <UsersTable
              detailUser={selectedUser}
              isLoading={isLoading}
              onBanUser={handleBanUser}
              onDelete={handleDeleteUser}
              onDetailOpenChange={stableOnOpenChange2}
              onRowClick={stableOnRowClick0}
              onSetPassword={handleResetPassword}
              onUnbanUser={handleUnbanUser}
              onUpdateUser={handleUpdateUser}
              roleOptions={roleSelectOptions}
              users={allUsers}
            />
          </>
        ) : null}
      </div>

      <FormModal
        description="Create a new user account with an initial password."
        onOpenChange={setCreateModalOpen}
        open={createModalOpen}
        title="Create user"
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
