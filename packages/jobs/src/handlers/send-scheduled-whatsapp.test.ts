import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { WhatsAppMediaAttachment } from "@pi-dash/whatsapp/messaging";

const mocks = {
  sendGroupMessage: mock(async () => undefined),
  sendMedia: mock(
    async (
      _phone: string,
      _attachment: WhatsAppMediaAttachment,
      _caption?: string
    ) => undefined
  ),
  sendMessage: mock(async () => undefined),
  setRecipient: mock(),
  select: mock(),
  update: mock(),
};

mock.module("@pi-dash/db", () => ({
  db: { select: mocks.select, update: mocks.update },
}));
mock.module("@pi-dash/whatsapp/messaging", () => ({
  sendWhatsAppGroupMessage: mocks.sendGroupMessage,
  sendWhatsAppMedia: mocks.sendMedia,
  sendWhatsAppMessage: mocks.sendMessage,
}));
mock.module("./r2", () => ({
  getR2Client: () => ({
    presign: (key: string) => `https://r2.example.test/${key}`,
  }),
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({ emit: mock(), set: mock() }),
}));

const { handleSendScheduledWhatsApp } =
  await import("./send-scheduled-whatsapp");

const limitedQuery = (rows: unknown[]) => ({
  from: () => ({
    where: () => ({ limit: async () => rows }),
  }),
});

const attachments = Array.from({ length: 5 }, (_, index) => ({
  fileName: `file-${index + 1}.pdf`,
  mimeType: "application/pdf",
  r2Key: `app/scheduled-messages/message-1/file-${index + 1}.pdf`,
}));

const job = (overrides: Record<string, unknown> = {}) =>
  ({
    data: {
      attachments,
      enqueuedAt: Date.now(),
      message: "Scheduled message",
      recipientRowId: "recipient-1",
      recipientType: "user",
      scheduledMessageId: "message-1",
      targetAddress: "919876543210",
      ...overrides,
    },
    id: "job-1",
  }) as never;

beforeEach(() => {
  mock.clearAllMocks();
  mocks.select
    .mockReturnValueOnce(limitedQuery([{ status: "pending" }]))
    .mockReturnValueOnce(limitedQuery([{ updatedAt: null }]));
  mocks.update.mockReturnValue({
    set: mocks.setRecipient.mockReturnValue({ where: async () => undefined }),
  });
  mocks.sendMedia.mockResolvedValue(undefined);
});

describe("handleSendScheduledWhatsApp", () => {
  it("sends all attachments sequentially in order and captions only the last", async () => {
    let active = 0;
    let maxActive = 0;
    mocks.sendMedia.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
    });

    await handleSendScheduledWhatsApp([job()]);

    expect(maxActive).toBe(1);
    expect(mocks.sendMedia.mock.calls).toEqual(
      attachments.map(
        (attachment, index): Parameters<typeof mocks.sendMedia> => [
          "919876543210",
          {
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            url: `https://r2.example.test/${attachment.r2Key}`,
          },
          index === attachments.length - 1 ? "Scheduled message" : undefined,
        ]
      )
    );
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.setRecipient).toHaveBeenCalledWith({
      sentAt: expect.any(Date),
      status: "sent",
      updatedAt: expect.any(Date),
    });
  });

  it("leaves the recipient pending when an attachment send fails", async () => {
    mocks.sendMedia.mockImplementationOnce(async () => undefined);
    mocks.sendMedia.mockImplementationOnce(async () => {
      throw new Error("GoWA unavailable");
    });

    await expect(handleSendScheduledWhatsApp([job()])).rejects.toThrow(
      "GoWA unavailable"
    );

    expect(mocks.setRecipient).not.toHaveBeenCalled();
  });

  it.each([
    ["user", mocks.sendMessage],
    ["group", mocks.sendGroupMessage],
  ] as const)(
    "sends an attachment-free %s message as text",
    async (type, send) => {
      await handleSendScheduledWhatsApp([
        job({ attachments: undefined, recipientType: type }),
      ]);

      expect(send).toHaveBeenCalledWith("919876543210", "Scheduled message");
      expect(mocks.sendMedia).not.toHaveBeenCalled();
      expect(mocks.setRecipient).toHaveBeenCalledWith({
        sentAt: expect.any(Date),
        status: "sent",
        updatedAt: expect.any(Date),
      });
    }
  );
});
