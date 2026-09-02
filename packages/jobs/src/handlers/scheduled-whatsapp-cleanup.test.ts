import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  enqueue: mock(),
  select: mock(),
  sendMedia: mock(),
  update: mock(),
}));

mock.module("@pi-dash/db", () => ({
  db: { select: mocks.select, update: mocks.update },
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
  mocks.update.mockReturnValue({
    set: () => ({ where: async () => undefined }),
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
          recipientRowId: "recipient-1",
          scheduledMessageId: "message-1",
        },
        id: "job-1",
      },
    ] as never);

    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("does not delete attachments when stale recipients become terminal", async () => {
    mocks.select.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: async () => [
            { id: "recipient-1", scheduledMessageId: "message-1" },
          ],
        }),
      }),
    });

    await handleCleanupStaleScheduledRecipients([{ data: {} }] as never);

    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
