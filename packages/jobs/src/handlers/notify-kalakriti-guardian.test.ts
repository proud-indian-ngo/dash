import { beforeEach, describe, expect, it, mock } from "bun:test";

import * as userActual from "@pi-dash/notifications/send/user";

const hoisted = <T>(factory: () => T): T => factory();

const notifyKalakritiGuardianAccess = hoisted(() =>
  mock(async () => undefined)
);

mock.module("@pi-dash/notifications/send/user", () => ({
  ...userActual,
  notifyKalakritiGuardianAccess,
}));
mock.module("@pi-dash/notifications/send-message", () => ({
  captureSends: async (callback: () => Promise<unknown>) => ({
    result: await callback(),
    sends: [],
  }),
}));

const { handleNotifyKalakritiGuardianAccess } =
  await import("./notify-user-admin");

describe("Kalakriti Guardian access job", () => {
  beforeEach(() => {
    mock.clearAllMocks();
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
