import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { AdminUser } from "@/functions/user-admin-reads";

const hoisted = <T>(factory: () => T): T => factory();

const { getAuth } = hoisted(() => ({ getAuth: mock() }));

mock.module("@/functions/get-auth", () => ({ getAuth }));

import {
  commitAdminUsersRequest,
  getCachedAdminUsers,
  startAdminUsersRequest,
} from "./admin-users-cache";
import { getCachedAuth, invalidateAuthCache } from "./auth-cache";

function deferred<T>() {
  return Promise.withResolvers<T>();
}

describe("getCachedAuth", () => {
  beforeEach(() => {
    getAuth.mockReset();
    invalidateAuthCache();
  });

  it("does not share authenticated results between server requests", async () => {
    getAuth
      .mockResolvedValueOnce({
        permissions: ["kalakriti.view"],
        session: { user: { id: "guardian" } },
      })
      .mockResolvedValueOnce({
        permissions: ["kalakriti.admin"],
        session: { user: { id: "admin" } },
      });

    await expect(getCachedAuth()).resolves.toMatchObject({
      permissions: ["kalakriti.view"],
      session: { user: { id: "guardian" } },
    });
    await expect(getCachedAuth()).resolves.toMatchObject({
      permissions: ["kalakriti.admin"],
      session: { user: { id: "admin" } },
    });
    expect(getAuth).toHaveBeenCalledTimes(2);
  });

  it("clears the private user list when auth is invalidated", () => {
    const actualWindow = globalThis.window;
    Object.assign(globalThis, { window: {} });
    try {
      const users = [{ id: "user-1" }] as AdminUser[];
      const request = startAdminUsersRequest("session-a:user-1");
      commitAdminUsersRequest(request, users);

      invalidateAuthCache();

      expect(getCachedAdminUsers("session-a:user-1")).toBeUndefined();
    } finally {
      Object.assign(globalThis, { window: actualWindow });
    }
  });

  it("clears the private user list when an auth refresh finds no session", async () => {
    const actualNow = Date.now;
    const actualWindow = globalThis.window;
    let now = 1;
    Date.now = () => now;
    Object.assign(globalThis, { window: {} });
    try {
      getAuth
        .mockResolvedValueOnce({
          permissions: ["users.manage"],
          session: { session: { id: "session-a" }, user: { id: "user-1" } },
        })
        .mockResolvedValueOnce(null);
      await getCachedAuth();
      const users = [{ id: "user-1" }] as AdminUser[];
      commitAdminUsersRequest(
        startAdminUsersRequest("session-a:user-1"),
        users
      );

      now += 5 * 60 * 1000;
      await expect(getCachedAuth()).resolves.toMatchObject({ session: null });

      expect(getCachedAdminUsers("session-a:user-1")).toBeUndefined();
    } finally {
      Date.now = actualNow;
      Object.assign(globalThis, { window: actualWindow });
      invalidateAuthCache();
    }
  });

  it("does not let a stale null auth response clear a newer session's users", async () => {
    const actualWindow = globalThis.window;
    Object.assign(globalThis, { window: {} });
    try {
      const oldAuth = deferred<null>();
      const newAuth = deferred<{
        permissions: string[];
        session: { session: { id: string }; user: { id: string } };
      }>();
      getAuth
        .mockReturnValueOnce(oldAuth.promise)
        .mockReturnValueOnce(newAuth.promise);
      const staleRequest = getCachedAuth();

      invalidateAuthCache();
      const currentRequest = getCachedAuth();
      const users = [{ id: "user-2" }] as AdminUser[];
      commitAdminUsersRequest(
        startAdminUsersRequest("session-b:user-2"),
        users
      );
      oldAuth.resolve(null);
      await staleRequest;
      const deduplicatedRequest = getCachedAuth();
      expect(getAuth).toHaveBeenCalledTimes(2);
      newAuth.resolve({
        permissions: ["users.manage"],
        session: { session: { id: "session-b" }, user: { id: "user-2" } },
      });
      await Promise.all([currentRequest, deduplicatedRequest]);

      expect(getCachedAdminUsers("session-b:user-2")).toBe(users);
    } finally {
      Object.assign(globalThis, { window: actualWindow });
      invalidateAuthCache();
    }
  });
});
