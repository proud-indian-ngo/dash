import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const enqueue = hoisted(() => mock(async () => "job-1"));
const pendingTasks = hoisted(() => [] as Promise<unknown>[]);

mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));
mock.module("@pi-dash/observability", () => ({
  withFireAndForgetLog: mock(
    (_meta: Record<string, unknown>, task: () => Promise<unknown>) => {
      pendingTasks.push(task());
    }
  ),
}));

import { enqueueGuardianReactivationNotification } from "./kalakriti-guardian-notifications";

describe("Kalakriti Guardian notifications", () => {
  beforeEach(() => {
    enqueue.mockClear();
    pendingTasks.length = 0;
  });

  it("enqueues reactivation with Edition and membership idempotency", async () => {
    enqueueGuardianReactivationNotification({
      editionId: "edition-1",
      membershipId: "membership-1",
      userId: "guardian-1",
    });
    await Promise.all(pendingTasks);

    expect(enqueue).toHaveBeenCalledWith(
      "notify-kalakriti-guardian-reactivated",
      {
        editionId: "edition-1",
        membershipId: "membership-1",
        userId: "guardian-1",
      },
      {
        singletonKey: "kalakriti-guardian-reactivated-edition-1-membership-1",
      }
    );
  });
});
