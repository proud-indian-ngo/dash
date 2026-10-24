import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { WhatsAppMediaAttachment } from "@pi-dash/whatsapp/messaging";

const mocks = {
  logGowaSend: mock(async () => undefined),
  sendGroupMessage: mock(async () => undefined),
  sendMedia: mock(
    async (
      _phone: string,
      _attachment: WhatsAppMediaAttachment,
      _caption?: string
    ): Promise<string | undefined> => undefined
  ),
  sendMessage: mock(async () => undefined),
  setRecipient: mock(),
  select: mock(),
  update: mock(),
};

mock.module("@pi-dash/db", () => ({
  db: { select: mocks.select, update: mocks.update },
}));
mock.module("@pi-dash/whatsapp/gowa-log", () => ({
  logGowaSend: mocks.logGowaSend,
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

const { handleSendScheduledWhatsApp, handleDeadLetterScheduledWhatsApp } =
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

let recipient: Record<string, unknown>;
let parent: Record<string, unknown>;
let address: Record<string, unknown>;

beforeEach(() => {
  mock.clearAllMocks();
  mocks.select.mockReset();
  recipient = {
    recipientId: "user-1",
    scheduledMessageId: "message-1",
    status: "pending",
    type: "user",
  };
  parent = {
    attachments,
    message: "Scheduled message",
    updatedAt: new Date(0),
  };
  address = { phone: "919876543210", jid: "persisted-group@g.us" };
  mocks.select
    .mockReturnValueOnce(limitedQuery([recipient]))
    .mockReturnValueOnce(limitedQuery([parent]))
    .mockReturnValueOnce(limitedQuery([address]));
  mocks.update.mockReturnValue({
    set: mocks.setRecipient.mockReturnValue({
      where: () => ({
        returning: async () => [recipient],
        then: (resolve: (value: undefined) => unknown) => resolve(undefined),
      }),
    }),
  });
  mocks.sendMedia.mockResolvedValue(undefined);
});

describe("handleSendScheduledWhatsApp", () => {
  it("sends all attachments sequentially in order and captions only the last", async () => {
    let active = 0;
    let maxActive = 0;
    let sent = 0;
    mocks.sendMedia.mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      sent += 1;
      return `3EB0${sent}`;
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
    // One logged send for all five attachments, keeping the user, not the phone.
    expect(mocks.logGowaSend).toHaveBeenCalledWith(
      {
        attachmentCount: 5,
        chatJid: null,
        kind: "direct",
        scheduledMessageId: "message-1",
        source: "scheduled",
        text: "Scheduled message",
        userId: "user-1",
      },
      ["3EB01", "3EB02", "3EB03", "3EB04", "3EB05"]
    );
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
    expect(mocks.logGowaSend).not.toHaveBeenCalled();
  });

  it.each([
    ["user", mocks.sendMessage],
    ["group", mocks.sendGroupMessage],
  ] as const)(
    "sends an attachment-free %s message as text",
    async (type, send) => {
      parent.attachments = null;
      recipient.type = type;
      await handleSendScheduledWhatsApp([job()]);

      expect(send).toHaveBeenCalledWith(
        type === "group" ? "persisted-group@g.us" : "919876543210",
        "Scheduled message"
      );
      expect(mocks.sendMedia).not.toHaveBeenCalled();
      expect(mocks.setRecipient).toHaveBeenCalledWith({
        sentAt: expect.any(Date),
        status: "sent",
        updatedAt: expect.any(Date),
      });
    }
  );
});

// Failure cases: forged payload content/destination/files, unrelated recipient,
// sent/cancelled replay, missing parent/address, stale send and stale DLQ entry.
describe("scheduled WhatsApp trust boundary", () => {
  it("ignores caller-provided content, destination, type and attachments", async () => {
    await handleSendScheduledWhatsApp([
      job({
        attachments: [
          {
            fileName: "private.pdf",
            mimeType: "application/pdf",
            r2Key: "app/private/secret.pdf",
          },
        ],
        message: "forged message",
        recipientType: "group",
        targetAddress: "attacker@g.us",
      }),
    ]);
    expect(mocks.sendMedia.mock.calls).toEqual(
      attachments.map((attachment, index) => [
        "919876543210",
        {
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          url: `https://r2.example.test/${attachment.r2Key}`,
        },
        index === attachments.length - 1 ? "Scheduled message" : undefined,
      ])
    );
    expect(JSON.stringify(mocks.logGowaSend.mock.calls)).not.toContain(
      "forged"
    );
  });

  it.each(["sent", "cancelled"])(
    "does not replay a %s recipient",
    async (status) => {
      recipient.status = status;
      await handleSendScheduledWhatsApp([job()]);
      expect(mocks.sendMedia).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    }
  );

  it("rejects a recipient belonging to another message", async () => {
    recipient.scheduledMessageId = "other-message";
    await handleSendScheduledWhatsApp([job()]);
    expect(mocks.sendMedia).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not send a stale revision", async () => {
    parent.updatedAt = new Date(Date.now() + 60_000);
    await handleSendScheduledWhatsApp([job()]);
    expect(mocks.sendMedia).not.toHaveBeenCalled();
  });

  it.each(["sent", "cancelled"])(
    "dead letters cannot overwrite %s",
    async (status) => {
      recipient.status = status;
      await handleDeadLetterScheduledWhatsApp([job()]);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.logGowaSend).not.toHaveBeenCalled();
    }
  );

  it("dead letters cannot fail a different message's recipient", async () => {
    recipient.scheduledMessageId = "other-message";
    await handleDeadLetterScheduledWhatsApp([job()]);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("dead letters ignore obsolete revisions", async () => {
    parent.updatedAt = new Date(Date.now() + 60_000);
    await handleDeadLetterScheduledWhatsApp([job()]);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("dead letters log persisted content", async () => {
    await handleDeadLetterScheduledWhatsApp([
      job({ message: "forged message", targetAddress: "attacker" }),
    ]);
    expect(mocks.setRecipient).toHaveBeenCalled();
    expect(mocks.logGowaSend).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Scheduled message", userId: "user-1" }),
      []
    );
  });
});
