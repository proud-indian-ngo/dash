import { beforeEach, describe, expect, it, vi } from "vitest";

const notifyKalakritiGuardianAccess = vi.hoisted(() =>
  vi.fn(async () => undefined)
);

vi.mock("@pi-dash/notifications/send/user", () => ({
  notifyKalakritiGuardianAccess,
}));
vi.mock("@pi-dash/notifications/send-message", () => ({
  captureSends: async (callback: () => Promise<unknown>) => ({
    result: await callback(),
    sends: [],
  }),
}));

import { handleNotifyKalakritiGuardianAccess } from "./notify-user-admin";

describe("Kalakriti Guardian access job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards the complete queue payload to the sender", async () => {
    const payload = {
      editionName: "Kalakriti 2028",
      membershipId: "membership-1",
      reusedIdentity: true,
      userId: "user-1",
      year: 2028,
    };

    await handleNotifyKalakritiGuardianAccess([
      { data: payload, id: "job-1" } as never,
    ]);

    expect(notifyKalakritiGuardianAccess).toHaveBeenCalledWith(payload);
  });
});
