import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  select: vi.fn(),
  sendMedia: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@pi-dash/db", () => ({
  db: { select: mocks.select, update: mocks.update },
}));
vi.mock("@pi-dash/whatsapp/messaging", () => ({
  sendWhatsAppGroupMessage: vi.fn(),
  sendWhatsAppMedia: mocks.sendMedia,
  sendWhatsAppMessage: vi.fn(),
}));
vi.mock("../enqueue", () => ({ enqueue: mocks.enqueue }));
vi.mock("./r2", () => ({ getR2Client: vi.fn() }));
vi.mock("./scheduled-whatsapp-media", () => ({
  buildScheduledWhatsAppMedia: () => [{ type: "image", url: "signed" }],
}));
vi.mock("evlog", () => ({
  createRequestLogger: () => ({ emit: vi.fn(), error: vi.fn(), set: vi.fn() }),
}));

import { handleCleanupStaleScheduledRecipients } from "./cleanup-stale-scheduled-recipients";
import {
  handleDeadLetterScheduledWhatsApp,
  handleSendScheduledWhatsApp,
} from "./send-scheduled-whatsapp";

const limitedQuery = (rows: unknown[]) => ({
  from: () => ({
    where: () => ({ limit: async () => rows }),
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
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
