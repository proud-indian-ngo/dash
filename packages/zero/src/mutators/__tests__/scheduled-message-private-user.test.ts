import { beforeEach, describe, expect, it, mock } from "bun:test";

const enqueue = mock();
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));

import type { Context } from "../../context";
import { scheduledMessageMutators } from "../scheduled-message";

const privateUser = {
  banned: false,
  email: "volunteer@example.com",
  isActive: true,
  name: "Volunteer",
  phone: "+919999999999",
  role: "volunteer",
};

function context(): Context {
  return {
    asyncTasks: [],
    loadPrivateUser: mock(async () => privateUser),
    permissions: ["messages.schedule"],
    role: "admin",
    userId: "admin-1",
  };
}

beforeEach(() => {
  enqueue.mockReset();
});

describe("scheduled message private user reads", () => {
  it("captures the user's phone inside the mutation transaction", async () => {
    const ctx = context();
    const tx = {
      location: "server",
      mutate: {
        scheduledMessage: { insert: mock() },
        scheduledMessageRecipient: { insert: mock() },
      },
      run: mock(),
    };

    await scheduledMessageMutators.create.fn({
      args: {
        id: "message-1",
        message: "Hello",
        recipients: [{ id: "user-1", label: "Volunteer", type: "user" }],
        scheduledAt: Date.now() + 60_000,
      },
      ctx,
      tx,
    } as never);
    ctx.loadPrivateUser = mock(async () => ({
      ...privateUser,
      phone: "+918888888888",
    }));

    await ctx.asyncTasks
      ?.find((task) => task.meta.mutator === "scheduledMessage.create")
      ?.fn();

    expect(enqueue).toHaveBeenCalledWith(
      "send-scheduled-whatsapp",
      expect.objectContaining({ targetAddress: "+919999999999" }),
      expect.anything()
    );
    expect(tx.run).not.toHaveBeenCalled();
  });

  it("fails before writes when creating without a private user loader", async () => {
    const ctx = context();
    ctx.loadPrivateUser = undefined;
    const insertMessage = mock();
    const insertRecipient = mock();

    await expect(
      scheduledMessageMutators.create.fn({
        args: {
          id: "message-1",
          message: "Hello",
          recipients: [{ id: "user-1", label: "Volunteer", type: "user" }],
          scheduledAt: Date.now() + 60_000,
        },
        ctx,
        tx: {
          location: "server",
          mutate: {
            scheduledMessage: { insert: insertMessage },
            scheduledMessageRecipient: { insert: insertRecipient },
          },
        },
      } as never)
    ).rejects.toThrow("Private user loader is required");
    expect(insertMessage).not.toHaveBeenCalled();
    expect(insertRecipient).not.toHaveBeenCalled();
  });

  it("fails closed when retrying without a private user loader", async () => {
    const ctx = context();
    ctx.loadPrivateUser = undefined;
    const tx = {
      location: "server",
      mutate: { scheduledMessageRecipient: { update: mock() } },
      run: mock()
        .mockResolvedValueOnce({
          recipientId: "user-1",
          retryCount: 0,
          scheduledMessageId: "message-1",
          status: "failed",
          type: "user",
        })
        .mockResolvedValueOnce({ attachments: [], message: "Hello" }),
    };

    await expect(
      scheduledMessageMutators.retryRecipient.fn({
        args: { recipientId: "recipient-1" },
        ctx,
        tx,
      } as never)
    ).rejects.toThrow("Private user loader is required");
    expect(enqueue).not.toHaveBeenCalled();
    expect(ctx.asyncTasks).toHaveLength(0);
  });
});
