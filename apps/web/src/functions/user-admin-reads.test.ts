import { describe, expect, it, mock } from "bun:test";

import { type AdminUser, getAdminUsersWithDeps } from "./user-admin-reads";

const session = { user: { role: "admin" } };
const users: AdminUser[] = [];

describe("getAdminUsersWithDeps", () => {
  it("requires a session before resolving permissions or reading users", async () => {
    const resolve = mock(async () => ["users.manage"]);
    const listUsers = mock(async () => users);

    await expect(
      getAdminUsersWithDeps(
        { session: null },
        { listUsers, resolvePermissions: resolve }
      )
    ).rejects.toThrow("Unauthorized");
    expect(resolve).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("requires users.manage before reading private user fields", async () => {
    const listUsers = mock(async () => users);

    await expect(
      getAdminUsersWithDeps(
        { session },
        {
          listUsers,
          resolvePermissions: async () => ["users.view"],
        }
      )
    ).rejects.toThrow("Forbidden");
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("rechecks current permissions on every read", async () => {
    let permissions: string[] = ["users.manage"];
    const listUsers = mock(async () => users);
    const deps = {
      listUsers,
      resolvePermissions: async () => permissions,
    };

    expect(await getAdminUsersWithDeps({ session }, deps)).toEqual(users);
    permissions = [];
    await expect(getAdminUsersWithDeps({ session }, deps)).rejects.toThrow(
      "Forbidden"
    );
    expect(listUsers).toHaveBeenCalledTimes(1);
  });
});
