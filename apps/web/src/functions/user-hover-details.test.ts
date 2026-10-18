import { describe, expect, it, mock } from "bun:test";

import {
  loadUserHoverDetails,
  type UserHoverDetailsDeps,
} from "./user-hover-details";

const details = {
  createdAt: 1_700_000_000_000,
  email: "member@example.com",
  phone: "+919876543210",
  role: "volunteer",
};

const deps = (
  permissions: string[]
): UserHoverDetailsDeps & {
  findUser: ReturnType<typeof mock>;
  resolvePermissions: ReturnType<typeof mock>;
} => ({
  findUser: mock(async () => details),
  resolvePermissions: mock(async () => permissions),
});

describe("loadUserHoverDetails", () => {
  it("returns private details for the user themselves", async () => {
    const dependencies = deps([]);

    await expect(
      loadUserHoverDetails(
        "user-1",
        { user: { id: "user-1", role: "volunteer" } },
        dependencies
      )
    ).resolves.toEqual({
      createdAt: details.createdAt,
      email: details.email,
      phone: details.phone,
    });
    expect(dependencies.resolvePermissions).not.toHaveBeenCalled();
  });

  it("reauthorizes users.view on every request", async () => {
    const dependencies = deps(["users.view"]);
    const session = { user: { id: "admin-1", role: "admin" } };

    await loadUserHoverDetails("user-1", session, dependencies);
    await loadUserHoverDetails("user-1", session, dependencies);

    expect(dependencies.resolvePermissions).toHaveBeenCalledTimes(2);
    expect(dependencies.findUser).toHaveBeenCalledTimes(2);
  });

  it("returns no details after permission is denied", async () => {
    const dependencies = deps([]);

    await expect(
      loadUserHoverDetails(
        "user-1",
        { user: { id: "viewer-1", role: "volunteer" } },
        dependencies
      )
    ).resolves.toBeNull();
    expect(dependencies.findUser).not.toHaveBeenCalled();
  });

  it("denies external users to a users.view holder", async () => {
    const dependencies = deps(["users.view"]);
    dependencies.findUser.mockResolvedValue({
      ...details,
      role: "external_user",
    });

    await expect(
      loadUserHoverDetails(
        "external-1",
        { user: { id: "admin-1", role: "admin" } },
        dependencies
      )
    ).resolves.toBeNull();
  });

  it("allows an external user to read their own three detail fields", async () => {
    const dependencies = deps([]);
    dependencies.findUser.mockResolvedValue({
      ...details,
      role: "external_user",
    });

    const result = await loadUserHoverDetails(
      "external-1",
      { user: { id: "external-1", role: "external_user" } },
      dependencies
    );

    expect(result).toEqual({
      createdAt: details.createdAt,
      email: details.email,
      phone: details.phone,
    });
    expect(Object.keys(result ?? {}).sort()).toEqual([
      "createdAt",
      "email",
      "phone",
    ]);
  });
});
