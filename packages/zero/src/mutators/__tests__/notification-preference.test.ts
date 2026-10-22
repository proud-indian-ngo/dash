import { describe, expect, it, mock } from "bun:test";

import { TOPICS } from "@pi-dash/notifications/topics";

import { notificationPreferenceMutators } from "../notification-preference";

describe("notificationPreference channel support", () => {
  it("rejects channels a catalog topic does not support", async () => {
    const tx = {
      mutate: { notificationTopicPreference: {} },
      run: mock(),
    };

    await expect(
      notificationPreferenceMutators.upsert.fn({
        args: {
          channel: "email",
          enabled: true,
          topicId: TOPICS.KALAKRITI_REGISTRATION,
        },
        ctx: { userId: "guardian-1" },
        tx,
      } as unknown as Parameters<
        typeof notificationPreferenceMutators.upsert.fn
      >[0])
    ).rejects.toThrow("does not support email");
    expect(tx.run).not.toHaveBeenCalled();
  });

  it("rejects unsupported channels from the admin mutator", async () => {
    const tx = {
      mutate: { notificationTopicPreference: {} },
      run: mock(),
    };

    await expect(
      notificationPreferenceMutators.adminUpsert.fn({
        args: {
          channel: "email",
          enabled: true,
          topicId: TOPICS.KALAKRITI_SCHEDULE,
          userId: "guardian-1",
        },
        ctx: {
          permissions: ["users.edit"],
          role: "admin",
          userId: "admin-1",
        },
        tx,
      } as unknown as Parameters<
        typeof notificationPreferenceMutators.adminUpsert.fn
      >[0])
    ).rejects.toThrow("does not support email");
    expect(tx.run).not.toHaveBeenCalled();
  });
});
