import { describe, expect, it } from "vitest";
import { getUserAdminWhatsappSyncPlan } from "./user-admin-whatsapp";

describe("getUserAdminWhatsappSyncPlan", () => {
  it("restores the default group when an inactive user becomes active", () => {
    expect(
      getUserAdminWhatsappSyncPlan({
        currentBanned: false,
        currentIsActive: false,
        currentRole: "volunteer",
        nextIsActive: true,
      })
    ).toMatchObject({
      becameActive: true,
      effectiveRole: "volunteer",
      isOriented: true,
      shouldRestoreDefaultGroup: true,
    });
  });

  it("does not restore the default group for an inactive user on role change alone", () => {
    expect(
      getUserAdminWhatsappSyncPlan({
        currentBanned: false,
        currentIsActive: false,
        currentRole: "unoriented_volunteer",
        nextRole: "volunteer",
      })
    ).toMatchObject({
      becameActive: false,
      effectiveRole: "volunteer",
      isOriented: true,
      shouldRestoreDefaultGroup: false,
    });
  });

  it("restores the default group for an active user crossing the orientation role boundary", () => {
    expect(
      getUserAdminWhatsappSyncPlan({
        currentBanned: false,
        currentIsActive: true,
        currentRole: "unoriented_volunteer",
        nextRole: "volunteer",
      })
    ).toMatchObject({
      becameActive: false,
      effectiveRole: "volunteer",
      isOriented: true,
      shouldRestoreDefaultGroup: true,
    });
  });

  it("does not restore the default group for banned users", () => {
    expect(
      getUserAdminWhatsappSyncPlan({
        currentBanned: true,
        currentIsActive: false,
        currentRole: "volunteer",
        nextIsActive: true,
      })
    ).toMatchObject({
      becameActive: true,
      effectiveRole: "volunteer",
      isOriented: true,
      shouldRestoreDefaultGroup: false,
    });
  });
});
