import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuth } = vi.hoisted(() => ({ getAuth: vi.fn() }));

vi.mock("@/functions/get-auth", () => ({ getAuth }));

import { getCachedAuth, invalidateAuthCache } from "./auth-cache";

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
});
