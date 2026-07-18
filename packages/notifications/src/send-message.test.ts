import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./kill-switch", () => ({
  isNotificationsDisabled: vi.fn(async () => true),
}));

vi.mock("./preferences", () => ({
  getBulkChannelPreferences: vi.fn(async () => new Map()),
  getBulkUserEmails: vi.fn(async () => new Map()),
  getChannelPreferences: vi.fn(async () => ({
    emailEnabled: true,
    inboxEnabled: true,
    whatsappEnabled: true,
  })),
  getUserEmail: vi.fn(async () => "test@test.com"),
}));

vi.mock("./inbox", () => ({
  insertBulkNotifications: vi.fn(async () => 0),
  insertNotification: vi.fn(async () => true),
}));

vi.mock("./email", () => ({
  sendNotificationEmail: vi.fn(async () => true),
}));

vi.mock("@pi-dash/whatsapp/messaging", () => ({
  sendWhatsAppMessage: vi.fn(async () => undefined),
}));

vi.mock("@pi-dash/whatsapp/preferences", () => ({
  getEnabledUserPhonesForTopic: vi.fn(async () => new Map()),
  isWhatsAppTopicEnabled: vi.fn(async () => false),
}));

vi.mock("@pi-dash/whatsapp/users", () => ({
  getUserPhone: vi.fn(async () => null),
}));

vi.mock("@pi-dash/env/server", () => ({
  env: { APP_NAME: "test", APP_URL: "http://test" },
}));

import { sendWhatsAppMessage } from "@pi-dash/whatsapp/messaging";
import { isWhatsAppTopicEnabled } from "@pi-dash/whatsapp/preferences";
import { getUserPhone } from "@pi-dash/whatsapp/users";
import { sendNotificationEmail } from "./email";
import { insertNotification } from "./inbox";
import { isNotificationsDisabled } from "./kill-switch";
import { getChannelPreferences } from "./preferences";
import { captureSends, sendBulkMessage, sendMessage } from "./send-message";
import { TOPICS } from "./topics";

const baseMessage = {
  body: "b",
  idempotencyKey: "k",
  title: "t",
  to: "user-1",
  topic: TOPICS.ACCOUNT,
};

describe("captureSends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures a single sendMessage call inside the scope", async () => {
    const { result, sends } = await captureSends(() =>
      sendMessage(baseMessage)
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]?.kind).toBe("message");
    expect(result.suppressedByKillSwitch).toBe(true);
  });

  it("captures parallel sends without cross-contamination", async () => {
    const runA = captureSends(() =>
      Promise.all([
        sendMessage({ ...baseMessage, to: "a1" }),
        sendMessage({ ...baseMessage, to: "a2" }),
      ])
    );
    const runB = captureSends(() => sendMessage({ ...baseMessage, to: "b1" }));
    const [a, b] = await Promise.all([runA, runB]);
    expect(a.sends).toHaveLength(2);
    expect(b.sends).toHaveLength(1);
    const aTos = a.sends.map((s) =>
      s.kind === "message" ? s.result.to : null
    );
    expect(aTos).toEqual(["a1", "a2"]);
  });

  it("captures sends emitted before a thrown error", async () => {
    const run = captureSends(async () => {
      await sendMessage({ ...baseMessage, to: "before" });
      throw new Error("boom");
    });
    await expect(run).rejects.toThrow("boom");
  });

  it("records sendBulkMessage with bulk kind", async () => {
    const { sends } = await captureSends(() =>
      sendBulkMessage({
        body: "b",
        idempotencyKey: "k",
        title: "t",
        topic: TOPICS.ACCOUNT,
        userIds: ["u1", "u2"],
      })
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]?.kind).toBe("bulk");
  });

  it("isolates nested captureSends scopes", async () => {
    const { sends: outer } = await captureSends(async () => {
      await sendMessage({ ...baseMessage, to: "outer" });
      const { sends: inner } = await captureSends(() =>
        sendMessage({ ...baseMessage, to: "inner" })
      );
      expect(inner).toHaveLength(1);
    });
    expect(outer).toHaveLength(1);
    expect(outer[0]?.kind === "message" && outer[0].result.to).toBe("outer");
  });
});

describe("sendMessage channel allowlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNotificationsDisabled).mockResolvedValue(false);
    vi.mocked(getChannelPreferences).mockResolvedValue({
      emailEnabled: true,
      inboxEnabled: true,
      whatsappEnabled: true,
    });
  });

  it("sends only allowed channels", async () => {
    const result = await sendMessage({
      ...baseMessage,
      channels: ["inbox"],
    });

    expect(result.channels).toEqual({
      emailQueued: false,
      inboxQueued: true,
      whatsapp: false,
    });
    expect(insertNotification).toHaveBeenCalledOnce();
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("honors preferences for allowed channels", async () => {
    vi.mocked(getChannelPreferences).mockResolvedValue({
      emailEnabled: true,
      inboxEnabled: false,
      whatsappEnabled: true,
    });

    const result = await sendMessage({
      ...baseMessage,
      channels: ["inbox"],
    });

    expect(result.channels.inboxQueued).toBe(false);
    expect(insertNotification).not.toHaveBeenCalled();
  });

  it("honors the WhatsApp topic preference for an allowed channel", async () => {
    vi.mocked(getUserPhone).mockResolvedValue("919999999999");
    vi.mocked(isWhatsAppTopicEnabled).mockResolvedValue(false);

    const result = await sendMessage({
      ...baseMessage,
      channels: ["whatsapp"],
    });

    expect(result.channels.whatsapp).toBe(false);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });
});
