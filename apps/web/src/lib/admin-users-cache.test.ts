import { afterAll, beforeEach, describe, expect, it } from "bun:test";

import type { AdminUser } from "@/functions/user-admin-reads";

import {
  commitAdminUserRoleOptionsRequest,
  commitAdminUsersRequest,
  getCachedAdminUserRoleOptions,
  getCachedAdminUsers,
  invalidateAdminUsersCache,
  invalidateAdminUsersListCache,
  startAdminUsersRequest,
} from "./admin-users-cache";

const actualWindow = globalThis.window;
const users = [{ id: "user-1", name: "User One" }] as AdminUser[];
const roleOptions = [{ label: "Custom Lead", value: "custom_lead" }];

Object.assign(globalThis, { window: {} });

beforeEach(() => {
  invalidateAdminUsersCache();
});

afterAll(() => {
  Object.assign(globalThis, { window: actualWindow });
});

describe("admin users cache lifecycle", () => {
  it("reuses the last successful list only within the same auth session", () => {
    const request = startAdminUsersRequest("session-a:user-1");

    expect(commitAdminUsersRequest(request, users)).toBe(true);
    expect(getCachedAdminUsers("session-a:user-1")).toBe(users);
    expect(getCachedAdminUsers("session-b:user-1")).toBeUndefined();
    expect(getCachedAdminUsers("session-a:user-1")).toBeUndefined();
  });

  it("keeps independently loaded role options for the same session", () => {
    const roleRequest = startAdminUsersRequest("session-a:user-1");
    expect(commitAdminUserRoleOptionsRequest(roleRequest, roleOptions)).toBe(
      true
    );
    expect(getCachedAdminUserRoleOptions("session-a:user-1")).toBe(roleOptions);
    expect(getCachedAdminUsers("session-a:user-1")).toBeUndefined();

    const usersRequest = startAdminUsersRequest("session-a:user-1");
    expect(commitAdminUsersRequest(usersRequest, users)).toBe(true);
    expect(getCachedAdminUserRoleOptions("session-a:user-1")).toBe(roleOptions);

    invalidateAdminUsersCache();
    expect(getCachedAdminUserRoleOptions("session-a:user-1")).toBeUndefined();
    expect(commitAdminUserRoleOptionsRequest(roleRequest, roleOptions)).toBe(
      false
    );
  });

  it("preserves role options when a user write invalidates only the list", () => {
    const request = startAdminUsersRequest("session-a:user-1");
    commitAdminUsersRequest(request, users);
    commitAdminUserRoleOptionsRequest(request, roleOptions);

    invalidateAdminUsersListCache();

    expect(getCachedAdminUsers("session-a:user-1")).toBeUndefined();
    expect(getCachedAdminUserRoleOptions("session-a:user-1")).toBe(roleOptions);
    expect(commitAdminUsersRequest(request, users)).toBe(false);
  });

  it("does not let a pending response restore data after auth invalidation", () => {
    const pendingRequest = startAdminUsersRequest("session-a:user-1");

    invalidateAdminUsersCache();

    expect(commitAdminUsersRequest(pendingRequest, users)).toBe(false);
    expect(getCachedAdminUsers("session-a:user-1")).toBeUndefined();
  });

  it("leaves no reusable list when a write invalidates before refresh", () => {
    const initialRequest = startAdminUsersRequest("session-a:user-1");
    commitAdminUsersRequest(initialRequest, users);

    invalidateAdminUsersCache();
    startAdminUsersRequest("session-a:user-1");

    expect(getCachedAdminUsers("session-a:user-1")).toBeUndefined();
  });

  it("does not read or populate private data during server rendering", () => {
    Object.assign(globalThis, { window: undefined });
    try {
      const request = startAdminUsersRequest("session-a:user-1");

      expect(commitAdminUsersRequest(request, users)).toBe(false);
      expect(getCachedAdminUsers("session-a:user-1")).toBeUndefined();
    } finally {
      Object.assign(globalThis, { window: {} });
    }
  });
});
