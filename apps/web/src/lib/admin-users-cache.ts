import type { AdminUser } from "@/functions/user-admin-reads";

interface AdminUsersRequest {
  roleOptionsGeneration: number;
  sessionKey: string;
  usersGeneration: number;
}

interface AdminUsersCacheEntry {
  roleOptions?: AdminUserRoleOption[];
  sessionKey: string;
  users?: AdminUser[];
}

export interface AdminUserRoleOption {
  label: string;
  value: string;
}

let cacheEntry: AdminUsersCacheEntry | undefined;
let roleOptionsGeneration = 0;
let usersGeneration = 0;

function getCacheEntry(sessionKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (!cacheEntry) {
    return;
  }

  if (cacheEntry.sessionKey !== sessionKey) {
    invalidateAdminUsersCache();
    return;
  }

  return cacheEntry;
}

export function getCachedAdminUsers(sessionKey: string) {
  return getCacheEntry(sessionKey)?.users;
}

export function getCachedAdminUserRoleOptions(sessionKey: string) {
  return getCacheEntry(sessionKey)?.roleOptions;
}

export function startAdminUsersRequest(sessionKey: string): AdminUsersRequest {
  return {
    roleOptionsGeneration,
    sessionKey,
    usersGeneration,
  };
}

export function commitAdminUsersRequest(
  request: AdminUsersRequest,
  users: AdminUser[]
) {
  if (
    typeof window === "undefined" ||
    request.usersGeneration !== usersGeneration
  ) {
    return false;
  }

  cacheEntry = {
    roleOptions:
      cacheEntry?.sessionKey === request.sessionKey
        ? cacheEntry.roleOptions
        : undefined,
    sessionKey: request.sessionKey,
    users,
  };
  return true;
}

export function commitAdminUserRoleOptionsRequest(
  request: AdminUsersRequest,
  options: AdminUserRoleOption[]
) {
  if (
    typeof window === "undefined" ||
    request.roleOptionsGeneration !== roleOptionsGeneration
  ) {
    return false;
  }

  cacheEntry = {
    roleOptions: options,
    sessionKey: request.sessionKey,
    users:
      cacheEntry?.sessionKey === request.sessionKey
        ? cacheEntry.users
        : undefined,
  };
  return true;
}

export function invalidateAdminUsersCache() {
  cacheEntry = undefined;
  roleOptionsGeneration += 1;
  usersGeneration += 1;
}

export function invalidateAdminUsersListCache() {
  if (cacheEntry) {
    cacheEntry = { ...cacheEntry, users: undefined };
  }
  usersGeneration += 1;
}
