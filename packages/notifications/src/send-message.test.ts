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

vi.mock("./batching", () => ({
  holdNotification: vi.fn(async () => true),
}));

vi.mock("./email", () => ({
  sendBulkNotificationEmails: vi.fn(async () => true),
  sendNotificationEmail: vi.fn(async () => true),
}));

const { cloud, gowaSend, logged } = vi.hoisted(() => ({
  cloud: { enabled: false },
  gowaSend: vi.fn(
    async (
      _phone: string,
      _message: string,
      _options?: { idempotencyKey?: string }
    ) => undefined
  ),
  logged: [] as { error?: unknown; fields: Record<string, unknown> }[],
}));

vi.mock("@pi-dash/whatsapp/cloud", () => ({
  isCloudApiEnabled: () => cloud.enabled,
}));

// Records what each logger was given, so tests can check what's logged.
vi.mock("evlog", () => ({
  createRequestLogger: () => {
    const entry: { error?: unknown; fields: Record<string, unknown> } = {
      fields: {},
    };
    logged.push(entry);
    return {
      emit: () => undefined,
      error: (error: unknown) => {
        entry.error = error;
      },
      set: (fields: Record<string, unknown>) => {
        Object.assign(entry.fields, fields);
      },
      warn: () => undefined,
    };
  },
}));

vi.mock("@pi-dash/whatsapp/messaging", () => ({
  sendWhatsAppMessage: gowaSend,
}));

// The GoWA path of sendWhatsAppNotification (Cloud API not configured).
const { gowaNotify } = vi.hoisted(() => ({
  gowaNotify: async (
    phone: string,
    notification: { text: string },
    options: { idempotencyKey: string }
  ): Promise<"sent" | "duplicate" | "no_template" | "rejected"> => {
    await gowaSend(phone, notification.text, {
      idempotencyKey: options.idempotencyKey,
    });
    return "sent";
  },
}));
vi.mock("@pi-dash/whatsapp/notify", () => ({
  sendWhatsAppNotification: vi.fn(gowaNotify),
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
import { sendWhatsAppNotification } from "@pi-dash/whatsapp/notify";
import {
  getEnabledUserPhonesForTopic,
  isWhatsAppTopicEnabled,
} from "@pi-dash/whatsapp/preferences";
import { getUserPhone } from "@pi-dash/whatsapp/users";

import { holdNotification } from "./batching";
import { sendBulkNotificationEmails, sendNotificationEmail } from "./email";
import { insertNotification } from "./inbox";
import { isNotificationsDisabled } from "./kill-switch";
import {
  getBulkChannelPreferences,
  getBulkUserEmails,
  getChannelPreferences,
} from "./preferences";
import { captureSends, sendBulkMessage, sendMessage } from "./send-message";
import { TOPICS } from "./topics";

const baseMessage = {
  body: "b",
  idempotencyKey: "k",
  title: "t",
  to: "user-1",
  topic: TOPICS.ACCOUNT,
  whatsappTemplate: null,
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
        whatsappTemplate: null,
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
    expect(insertNotification).toHaveBeenCalledTimes(1);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("reuses the same inbox key when a delivery is retried", async () => {
    await sendMessage({ ...baseMessage, channels: ["inbox"] });
    await sendMessage({ ...baseMessage, channels: ["inbox"] });

    expect(insertNotification).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(insertNotification).mock.calls[0]?.[0].idempotencyKey
    ).toBe("k-inbox");
    expect(
      vi.mocked(insertNotification).mock.calls[1]?.[0].idempotencyKey
    ).toBe("k-inbox");
  });

  it("gives each email a stable per-message idempotency key", async () => {
    await sendMessage({ ...baseMessage, channels: ["email"] });

    expect(vi.mocked(sendNotificationEmail).mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: "k-email",
      toEmail: "test@test.com",
      topic: baseMessage.topic,
      userId: baseMessage.to,
    });
  });

  it("batches bulk email to recipients with email on and an address", async () => {
    vi.mocked(getBulkChannelPreferences).mockResolvedValueOnce(
      new Map([
        [
          "u2",
          { emailEnabled: false, inboxEnabled: true, whatsappEnabled: true },
        ],
      ])
    );
    vi.mocked(getBulkUserEmails).mockResolvedValueOnce(
      new Map([
        ["u1", "one@test.com"],
        ["u2", "two@test.com"],
      ])
    );

    const result = await sendBulkMessage({
      body: "b",
      idempotencyKey: "bulk",
      title: "t",
      topic: TOPICS.ACCOUNT,
      userIds: ["u1", "u2", "u3"],
      whatsappTemplate: null,
    });

    expect(result.channels.emailQueued).toBe(true);
    expect(sendBulkNotificationEmails).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "bulk-email",
        recipients: [{ email: "one@test.com", userId: "u1" }],
        topic: TOPICS.ACCOUNT,
      })
    );
    expect(holdNotification).not.toHaveBeenCalled();
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

  it("keeps WhatsApp retry keys stable and separates recipients", async () => {
    vi.mocked(getUserPhone).mockResolvedValue("919999999999");
    vi.mocked(isWhatsAppTopicEnabled).mockResolvedValue(true);

    await sendMessage({ ...baseMessage, channels: ["whatsapp"] });
    await sendMessage({ ...baseMessage, channels: ["whatsapp"] });
    await sendMessage({
      ...baseMessage,
      channels: ["whatsapp"],
      to: "user-2",
    });

    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(3);
    expect(vi.mocked(sendWhatsAppMessage).mock.calls[0]?.[2]).toEqual({
      idempotencyKey: "k-whatsapp-user-1",
    });
    expect(vi.mocked(sendWhatsAppMessage).mock.calls[1]?.[2]).toEqual({
      idempotencyKey: "k-whatsapp-user-1",
    });
    expect(vi.mocked(sendWhatsAppMessage).mock.calls[2]?.[2]).toEqual({
      idempotencyKey: "k-whatsapp-user-2",
    });
  });
});

describe("sendBulkMessage WhatsApp delivery keys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNotificationsDisabled).mockResolvedValue(false);
    vi.mocked(getEnabledUserPhonesForTopic).mockResolvedValue(
      new Map([
        ["user-1", "911111111111"],
        ["user-2", "922222222222"],
      ])
    );
  });

  it("keeps recipient-specific keys stable across retries", async () => {
    const message = {
      body: "b",
      idempotencyKey: "k",
      title: "t",
      topic: TOPICS.ACCOUNT,
      userIds: ["user-1", "user-2"],
      whatsappTemplate: null,
    };

    const first = await sendBulkMessage(message);
    const second = await sendBulkMessage(message);

    expect(first.channels.whatsappRecipients).toBe(2);
    expect(second.channels.whatsappRecipients).toBe(2);
    expect(
      vi
        .mocked(sendWhatsAppMessage)
        .mock.calls.map(([phone, , options]) => [phone, options])
    ).toEqual([
      ["911111111111", { idempotencyKey: "k-whatsapp-user-1" }],
      ["922222222222", { idempotencyKey: "k-whatsapp-user-2" }],
      ["911111111111", { idempotencyKey: "k-whatsapp-user-1" }],
      ["922222222222", { idempotencyKey: "k-whatsapp-user-2" }],
    ]);
  });
});

describe("batched topics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNotificationsDisabled).mockResolvedValue(false);
    vi.mocked(getChannelPreferences).mockResolvedValue({
      emailEnabled: true,
      inboxEnabled: true,
      whatsappEnabled: true,
    });
  });

  it("writes the inbox now and holds email and WhatsApp", async () => {
    vi.mocked(getUserPhone).mockResolvedValue("919999999999");
    vi.mocked(isWhatsAppTopicEnabled).mockResolvedValue(true);

    const result = await sendMessage({
      ...baseMessage,
      clickAction: "/teams/t1",
      emailHtml: "<p>html</p>",
      title: "👥 Added to team",
      topic: TOPICS.TEAMS,
    });

    expect(insertNotification).toHaveBeenCalledTimes(1);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(holdNotification).toHaveBeenCalledWith({
      body: "b",
      clickAction: "/teams/t1",
      emailHtml: "<p>html</p>",
      idempotencyKey: "k",
      recipients: [
        { channel: "email", userId: "user-1" },
        { channel: "whatsapp", userId: "user-1" },
      ],
      title: "👥 Added to team",
      topic: TOPICS.TEAMS,
      whatsappTemplate: null,
      whatsappText:
        "*👥 Added to team*\n\nb\n\nView: http://test/teams/t1\n\n_Sent by test_(http://test)",
    });
    expect(result.held).toBe(true);
    expect(result.channels).toEqual({
      emailQueued: true,
      inboxQueued: true,
      whatsapp: true,
    });
  });

  it("holds only recipients who would have been sent each channel", async () => {
    vi.mocked(getBulkChannelPreferences).mockResolvedValueOnce(
      new Map([
        [
          "u2",
          { emailEnabled: false, inboxEnabled: true, whatsappEnabled: true },
        ],
      ])
    );
    vi.mocked(getBulkUserEmails).mockResolvedValueOnce(
      new Map([
        ["u1", "one@test.com"],
        ["u2", "two@test.com"],
      ])
    );
    vi.mocked(getEnabledUserPhonesForTopic).mockResolvedValueOnce(
      new Map([["u3", "913333333333"]])
    );

    const result = await sendBulkMessage({
      body: "b",
      idempotencyKey: "bulk",
      title: "t",
      topic: TOPICS.REQUESTS_SUBMISSIONS,
      userIds: ["u1", "u2", "u3"],
      whatsappTemplate: null,
    });

    expect(sendBulkNotificationEmails).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(vi.mocked(holdNotification).mock.calls[0]?.[0].recipients).toEqual([
      { channel: "email", userId: "u1" },
      { channel: "whatsapp", userId: "u3" },
    ]);
    expect(result.held).toBe(true);
    expect(result.channels.whatsappRecipients).toBe(1);
  });

  it("sends straight away when the message is marked immediate", async () => {
    await sendMessage({
      ...baseMessage,
      channels: ["email"],
      immediate: true,
      topic: TOPICS.EVENTS_SCHEDULE,
    });

    expect(holdNotification).not.toHaveBeenCalled();
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
  });

  it("fails the send when the message can't be held, so the job retries", async () => {
    vi.mocked(holdNotification).mockRejectedValueOnce(new Error("db down"));

    await expect(
      sendMessage({ ...baseMessage, channels: ["email"], topic: TOPICS.TEAMS })
    ).rejects.toThrow("db down");
  });

  it("skips WhatsApp lookups when the bulk send posts to a group instead", async () => {
    await sendBulkMessage({
      body: "b",
      idempotencyKey: "bulk",
      skipWhatsApp: true,
      title: "t",
      topic: TOPICS.EVENTS_SCHEDULE,
      userIds: ["u1"],
      whatsappTemplate: null,
    });

    expect(getEnabledUserPhonesForTopic).not.toHaveBeenCalled();
  });
});

const template = {
  name: "account_welcome",
  params: { name: "Asha" },
} as const;

describe("WhatsApp outcomes and failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logged.length = 0;
    cloud.enabled = false;
    vi.mocked(sendWhatsAppNotification).mockImplementation(gowaNotify);
    vi.mocked(isNotificationsDisabled).mockResolvedValue(false);
    vi.mocked(getChannelPreferences).mockResolvedValue({
      emailEnabled: true,
      inboxEnabled: true,
      whatsappEnabled: true,
    });
    vi.mocked(getUserPhone).mockResolvedValue("919999999999");
    vi.mocked(isWhatsAppTopicEnabled).mockResolvedValue(true);
  });

  it("counts a duplicate as delivered and a rejection as not", async () => {
    vi.mocked(sendWhatsAppNotification).mockResolvedValueOnce("duplicate");
    const duplicate = await sendMessage(baseMessage);
    vi.mocked(sendWhatsAppNotification).mockResolvedValueOnce("rejected");
    const rejected = await sendMessage(baseMessage);

    expect(duplicate.channels.whatsapp).toBe(true);
    expect(rejected.channels.whatsapp).toBe(false);
  });

  it("rethrows a transient WhatsApp failure once inbox and email finish", async () => {
    const finished: string[] = [];
    vi.mocked(insertNotification).mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished.push("inbox");
      return true;
    });
    vi.mocked(sendNotificationEmail).mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      finished.push("email");
      return true;
    });
    vi.mocked(sendWhatsAppNotification).mockRejectedValueOnce(
      new Error("throttled")
    );

    await expect(sendMessage(baseMessage)).rejects.toThrow("throttled");
    expect(finished.sort()).toEqual(["email", "inbox"]);
    expect(logged.some((l) => l.fields.channel === "whatsapp")).toBe(true);
  });

  it("holds a batched message without a template off WhatsApp on the Cloud API", async () => {
    cloud.enabled = true;

    const result = await sendMessage({ ...baseMessage, topic: TOPICS.TEAMS });

    expect(getUserPhone).not.toHaveBeenCalled();
    expect(vi.mocked(holdNotification).mock.calls[0]?.[0].recipients).toEqual([
      { channel: "email", userId: "user-1" },
    ]);
    expect(result.channels.whatsapp).toBe(false);
  });

  it("holds a batched message with a template for WhatsApp on the Cloud API", async () => {
    cloud.enabled = true;

    await sendMessage({
      ...baseMessage,
      topic: TOPICS.TEAMS,
      whatsappTemplate: template,
    });

    expect(vi.mocked(holdNotification).mock.calls[0]?.[0].recipients).toEqual([
      { channel: "email", userId: "user-1" },
      { channel: "whatsapp", userId: "user-1" },
    ]);
  });

  it("keeps a message without a template on WhatsApp through GoWA", async () => {
    const result = await sendMessage(baseMessage);
    expect(result.channels.whatsapp).toBe(true);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });
});

describe("sendBulkMessage WhatsApp sends", () => {
  const userIds = Array.from({ length: 12 }, (_, i) => `u${i}`);

  beforeEach(() => {
    vi.clearAllMocks();
    logged.length = 0;
    cloud.enabled = true;
    vi.mocked(isNotificationsDisabled).mockResolvedValue(false);
    vi.mocked(getEnabledUserPhonesForTopic).mockResolvedValue(
      new Map(userIds.map((id) => [id, `91${id}`]))
    );
  });

  const bulk = {
    body: "b",
    idempotencyKey: "k",
    title: "t",
    topic: TOPICS.ACCOUNT,
    userIds,
    whatsappTemplate: template,
  };

  it("sends at most five at once", async () => {
    let inFlight = 0;
    let most = 0;
    vi.mocked(sendWhatsAppNotification).mockImplementation(async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 2));
      inFlight -= 1;
      return "sent";
    });

    const result = await sendBulkMessage(bulk);

    expect(sendWhatsAppNotification).toHaveBeenCalledTimes(12);
    expect(most).toBe(5);
    expect(result.channels.whatsappRecipients).toBe(12);
  });

  it("logs a failed recipient, sends the rest and then fails for a retry", async () => {
    vi.mocked(sendWhatsAppNotification).mockImplementation(
      async (_phone, _notification, options) => {
        if (options.userId === "u3") {
          throw new Error("503 from Meta");
        }
        return options.userId === "u4" ? "rejected" : "sent";
      }
    );

    await expect(sendBulkMessage(bulk)).rejects.toThrow("503 from Meta");

    expect(sendWhatsAppNotification).toHaveBeenCalledTimes(12);
    const failures = logged.filter((l) => l.error);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.fields).toMatchObject({
      channel: "whatsapp",
      idempotencyKey: "k-whatsapp-u3",
      userId: "u3",
    });
    expect(JSON.stringify(failures[0]?.fields)).not.toContain("91u3");
  });

  it("skips WhatsApp on the Cloud API for a message without a template", async () => {
    await sendBulkMessage({ ...bulk, whatsappTemplate: null });
    expect(getEnabledUserPhonesForTopic).not.toHaveBeenCalled();
    expect(sendWhatsAppNotification).not.toHaveBeenCalled();
  });
});
