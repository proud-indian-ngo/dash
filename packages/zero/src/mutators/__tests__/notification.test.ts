import { describe, expect, it, mock } from "bun:test";

import { notificationMutators } from "../notification";

const OWN_ID = "019a0000-0000-7000-8000-000000000001";
const FOREIGN_ID = "019a0000-0000-7000-8000-000000000002";
const MISSING_ID = "019a0000-0000-7000-8000-000000000003";

const ctx = {
  permissions: [],
  role: "volunteer",
  userId: "user-1",
};

function txWith(notification: { id: string; userId: string } | undefined) {
  return {
    mutate: { notification: { update: mock(async () => undefined) } },
    run: mock(async () => notification),
  };
}

type NotificationMutator =
  | typeof notificationMutators.archive
  | typeof notificationMutators.markAsRead
  | typeof notificationMutators.markAsUnread;

async function run(
  mutator: NotificationMutator,
  id: string,
  tx: ReturnType<typeof txWith>
) {
  return mutator.fn({ args: { id }, ctx, tx } as never);
}

describe("notification ownership", () => {
  it.each([
    ["archive", notificationMutators.archive, { archived: true, read: true }],
    ["markAsRead", notificationMutators.markAsRead, { read: true }],
    ["markAsUnread", notificationMutators.markAsUnread, { read: false }],
  ] as const)("allows an owner to %s", async (_name, mutator, changes) => {
    const tx = txWith({ id: OWN_ID, userId: ctx.userId });

    await run(mutator, OWN_ID, tx);

    expect(tx.mutate.notification.update).toHaveBeenCalledWith({
      id: OWN_ID,
      ...changes,
    });
  });

  it.each([
    ["archive", notificationMutators.archive],
    ["markAsRead", notificationMutators.markAsRead],
    ["markAsUnread", notificationMutators.markAsUnread],
  ] as const)(
    "rejects %s for another user's notification",
    async (_name, mutator) => {
      const tx = txWith({ id: FOREIGN_ID, userId: "user-2" });

      await expect(run(mutator, FOREIGN_ID, tx)).rejects.toThrow("Forbidden");
      expect(tx.mutate.notification.update).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["archive", notificationMutators.archive],
    ["markAsRead", notificationMutators.markAsRead],
    ["markAsUnread", notificationMutators.markAsUnread],
  ] as const)(
    "rejects %s for a missing notification",
    async (_name, mutator) => {
      const tx = txWith(undefined);

      await expect(run(mutator, MISSING_ID, tx)).rejects.toThrow(
        "Notification not found"
      );
      expect(tx.mutate.notification.update).not.toHaveBeenCalled();
    }
  );

  it("keeps markAllAsRead scoped to the current user", async () => {
    const update = mock(async () => undefined);
    const runQuery = mock(async (_query: unknown) => [
      { id: OWN_ID, userId: ctx.userId },
      { id: FOREIGN_ID, userId: ctx.userId },
    ]);
    const tx = {
      mutate: { notification: { update } },
      run: runQuery,
    };

    await notificationMutators.markAllAsRead.fn({
      args: {},
      ctx,
      tx,
    } as never);

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({ id: OWN_ID, read: true });
    expect(update).toHaveBeenCalledWith({ id: FOREIGN_ID, read: true });
    const query = runQuery.mock.calls[0]?.[0] as { ast: unknown };
    expect(JSON.stringify(query.ast)).toContain('"value":"user-1"');
  });
});
