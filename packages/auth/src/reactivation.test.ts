import { describe, expect, it, vi } from "vitest";
import {
  getUserIdFromNewSession,
  reactivateUserAfterSignIn,
} from "./reactivation";

describe("getUserIdFromNewSession", () => {
  it("reads userId from the session payload when present", () => {
    expect(
      getUserIdFromNewSession({
        session: { userId: "user-from-session" },
        user: { id: "user-from-user" },
      })
    ).toBe("user-from-session");
  });

  it("falls back to the nested user id", () => {
    expect(getUserIdFromNewSession({ user: { id: "user-from-user" } })).toBe(
      "user-from-user"
    );
  });

  it("returns null for invalid payloads", () => {
    expect(getUserIdFromNewSession(null)).toBeNull();
    expect(getUserIdFromNewSession({})).toBeNull();
  });
});

describe("reactivateUserAfterSignIn", () => {
  it("reactivates an inactive user and restores the default group", async () => {
    const restoreDefaultGroup = vi.fn().mockResolvedValue(undefined);

    await expect(
      reactivateUserAfterSignIn("u-1", {
        fetchUserState: vi.fn().mockResolvedValue({
          banned: false,
          isActive: false,
          role: "volunteer",
        }),
        markUserActive: vi.fn().mockResolvedValue(true),
        restoreDefaultGroup,
      })
    ).resolves.toEqual({ role: "volunteer", status: "reactivated" });

    expect(restoreDefaultGroup).toHaveBeenCalledWith({
      isOriented: true,
      userId: "u-1",
    });
  });

  it("skips already-active users", async () => {
    const markUserActive = vi.fn().mockResolvedValue(true);
    const restoreDefaultGroup = vi.fn().mockResolvedValue(undefined);

    await expect(
      reactivateUserAfterSignIn("u-1", {
        fetchUserState: vi.fn().mockResolvedValue({
          banned: false,
          isActive: true,
          role: "volunteer",
        }),
        markUserActive,
        restoreDefaultGroup,
      })
    ).resolves.toEqual({ status: "already-active" });

    expect(markUserActive).not.toHaveBeenCalled();
    expect(restoreDefaultGroup).not.toHaveBeenCalled();
  });

  it("skips banned users", async () => {
    const markUserActive = vi.fn().mockResolvedValue(true);
    const restoreDefaultGroup = vi.fn().mockResolvedValue(undefined);

    await expect(
      reactivateUserAfterSignIn("u-1", {
        fetchUserState: vi.fn().mockResolvedValue({
          banned: true,
          isActive: false,
          role: "volunteer",
        }),
        markUserActive,
        restoreDefaultGroup,
      })
    ).resolves.toEqual({ status: "skipped-banned" });

    expect(markUserActive).not.toHaveBeenCalled();
    expect(restoreDefaultGroup).not.toHaveBeenCalled();
  });

  it("does not restore the default group when the atomic update is skipped", async () => {
    const restoreDefaultGroup = vi.fn().mockResolvedValue(undefined);

    await expect(
      reactivateUserAfterSignIn("u-1", {
        fetchUserState: vi.fn().mockResolvedValue({
          banned: false,
          isActive: false,
          role: "unoriented_volunteer",
        }),
        markUserActive: vi.fn().mockResolvedValue(false),
        restoreDefaultGroup,
      })
    ).resolves.toEqual({
      role: "unoriented_volunteer",
      status: "update-skipped",
    });

    expect(restoreDefaultGroup).not.toHaveBeenCalled();
  });
});
