import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueue = vi.hoisted(() => vi.fn(async () => "job-1"));
const pendingTasks = vi.hoisted(() => [] as Promise<unknown>[]);

vi.mock("@pi-dash/jobs/enqueue", () => ({ enqueue }));
vi.mock("@pi-dash/observability", () => ({
  withFireAndForgetLog: vi.fn(
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
