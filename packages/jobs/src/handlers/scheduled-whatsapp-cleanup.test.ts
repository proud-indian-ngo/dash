import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  enqueue: mock(),
  execute: mock(),
  logGowaSend: mock(),
  select: mock(),
  sendMedia: mock(),
  update: mock(),
}));

mock.module("@pi-dash/db", () => ({
  db: {
    execute: mocks.execute,
    select: mocks.select,
    update: mocks.update,
  },
}));
mock.module("@pi-dash/whatsapp/gowa-log", () => ({
  logGowaSend: mocks.logGowaSend,
}));
mock.module("@pi-dash/whatsapp/messaging", () => ({
  sendWhatsAppGroupMessage: mock(),
  sendWhatsAppMedia: mocks.sendMedia,
  sendWhatsAppMessage: mock(),
}));
mock.module("../enqueue", () => ({ enqueue: mocks.enqueue }));
mock.module("./r2", () => ({ getR2Client: mock() }));
mock.module("./scheduled-whatsapp-media", () => ({
  buildScheduledWhatsAppMedia: () => [{ type: "image", url: "signed" }],
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({ emit: mock(), error: mock(), set: mock() }),
}));

const { handleCleanupStaleScheduledRecipients } =
  await import("./cleanup-stale-scheduled-recipients");
const { handleDeadLetterScheduledWhatsApp, handleSendScheduledWhatsApp } =
  await import("./send-scheduled-whatsapp");

const limitedQuery = (rows: unknown[]) => ({
  from: () => ({
    where: () => ({ limit: async () => rows }),
  }),
});

beforeEach(() => {
  mock.clearAllMocks();
  mocks.execute.mockResolvedValue([{ cleanedUp: 1, messagesAffected: 1 }]);
  mocks.update.mockReturnValue({
    set: () => ({
      where: () =>
        Object.assign(Promise.resolve(undefined), {
          returning: async () => [{ recipientId: "user-1" }],
        }),
    }),
  });
  mocks.sendMedia.mockResolvedValue(undefined);
});

describe("scheduled WhatsApp attachment retention", () => {
  it("does not delete attachments after successful delivery", async () => {
    mocks.select
      .mockReturnValueOnce(limitedQuery([{ status: "pending" }]))
      .mockReturnValueOnce(limitedQuery([{ updatedAt: null }]));

    await handleSendScheduledWhatsApp([
      {
        data: {
          attachments: [
            {
              fileName: "photo.jpg",
              mimeType: "image/jpeg",
              r2Key: "app/scheduled-messages/message-1/photo.jpg",
            },
          ],
          enqueuedAt: Date.now(),
          message: "Message",
          recipientRowId: "recipient-1",
          recipientType: "user",
          scheduledMessageId: "message-1",
          targetAddress: "1234567890",
        },
      },
    ] as never);

    expect(mocks.sendMedia).toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("does not delete attachments after dead-letter handling", async () => {
    await handleDeadLetterScheduledWhatsApp([
      {
        data: {
          message: "Message",
          recipientRowId: "recipient-1",
          recipientType: "user",
          scheduledMessageId: "message-1",
          targetAddress: "1234567890",
        },
        id: "job-1",
      },
    ] as never);

    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
    // The delivery log shows it failed, against the user, not the phone.
    expect(mocks.logGowaSend).toHaveBeenCalledWith(
      expect.objectContaining({
        chatJid: null,
        error: "All retries exhausted",
        kind: "direct",
        userId: "user-1",
      }),
      []
    );
  });

  it("does not delete attachments when stale recipients become terminal", async () => {
    await handleCleanupStaleScheduledRecipients([{ data: {} }] as never);

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
