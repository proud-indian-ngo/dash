import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A stand-in for the Drizzle client: every builder call chains, and awaiting
 * a query takes the next queued result for its kind. `sets` records what
 * each update wrote, so tests can tell a "stamp sent" from a lease change.
 */
const state = vi.hoisted(() => ({
  execute: [] as unknown[][],
  holdError: null as Error | null,
  select: [] as unknown[][],
  sets: [] as Record<string, unknown>[],
}));

vi.mock("@pi-dash/db", () => {
  const chain = (result: () => unknown): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (
              resolve: (value: unknown) => void,
              reject: (error: unknown) => void
            ) => Promise.resolve().then(result).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            if (prop === "set") {
              state.sets.push(args[0] as Record<string, unknown>);
            }
            return chain(result);
          };
        },
      }
    );
  const db = {
    delete: () => chain(() => []),
    execute: () => chain(() => state.execute.shift() ?? []),
    insert: () => chain(() => [{ key: "k" }]),
    select: () => chain(() => state.select.shift() ?? []),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      if (state.holdError) {
        throw state.holdError;
      }
      return await fn(db);
    },
    update: () => chain(() => []),
  };
  return { db };
});

const mocks = vi.hoisted(() => ({
  getBulkChannelPreferences: vi.fn(async () => new Map()),
  getBulkUserEmails: vi.fn(
    async (ids: string[]) => new Map(ids.map((id) => [id, `${id}@test.dev`]))
  ),
  getEnabledUserPhonesForTopic: vi.fn(
    async (ids: string[]) => new Map(ids.map((id) => [id, `91${id}`]))
  ),
  isNotificationsDisabled: vi.fn(async () => false),
  renderNotificationDigestEmail: vi.fn(async () => "<html>digest</html>"),
  sendBulkNotificationEmails: vi.fn(
    async (_options: Record<string, unknown>) => true
  ),
  sendNotificationEmail: vi.fn(async () => true),
  sendWhatsAppMessage: vi.fn(
    async (
      _phone: string,
      _text: string,
      _options: { idempotencyKey: string }
    ) => undefined
  ),
  cloud: {
    category: "UTILITY",
    enabled: false,
    status: "APPROVED",
  },
  getCloudTemplate: vi.fn(async (name: string) => ({
    category: mocks.cloud.category,
    name,
    status: mocks.cloud.status,
  })),
  pruneWhatsAppMessages: vi.fn(async () => 0),
  sendCloudTemplate: vi.fn(
    async (_phone: string, _message: { name: string; params: object }) =>
      "wamid.1"
  ),
}));

vi.mock("@pi-dash/email", () => ({
  renderNotificationDigestEmail: mocks.renderNotificationDigestEmail,
}));
vi.mock("@pi-dash/env/server", () => ({
  env: { APP_NAME: "PI", APP_URL: "https://dash.test" },
}));
vi.mock("@pi-dash/whatsapp/cloud", () => ({
  getCloudTemplate: mocks.getCloudTemplate,
  isCloudApiEnabled: () => mocks.cloud.enabled,
}));

type Outcome = "sent" | "duplicate" | "no_template" | "rejected";
/**
 * sendWhatsAppNotification as the flush sees it: GoWA text without the
 * Cloud API, otherwise the template (or "no_template" without one).
 */
const { notify } = vi.hoisted(() => ({
  notify: async (
    phone: string,
    notification: {
      template?: { name: string; params: object };
      text: string;
    },
    options: { idempotencyKey: string; userId?: string }
  ): Promise<Outcome> => {
    if (!mocks.cloud.enabled) {
      await mocks.sendWhatsAppMessage(phone, notification.text, {
        idempotencyKey: options.idempotencyKey,
      });
      return "sent";
    }
    if (!notification.template) {
      return "no_template";
    }
    await mocks.sendCloudTemplate(phone, notification.template);
    return "sent";
  },
}));
vi.mock("@pi-dash/whatsapp/notify", () => ({
  pruneWhatsAppMessages: mocks.pruneWhatsAppMessages,
  sendWhatsAppNotification: vi.fn(notify),
}));
vi.mock("@pi-dash/whatsapp/preferences", () => ({
  getEnabledUserPhonesForTopic: mocks.getEnabledUserPhonesForTopic,
}));
vi.mock("./email", () => ({
  sendBulkNotificationEmails: mocks.sendBulkNotificationEmails,
  sendNotificationEmail: mocks.sendNotificationEmail,
}));
vi.mock("./kill-switch", () => ({
  isNotificationsDisabled: mocks.isNotificationsDisabled,
}));
vi.mock("./preferences", () => ({
  getBulkChannelPreferences: mocks.getBulkChannelPreferences,
  getBulkUserEmails: mocks.getBulkUserEmails,
}));

import { sendWhatsAppNotification } from "@pi-dash/whatsapp/notify";

import {
  flushHeldNotifications,
  holdNotification,
  WHATSAPP_SEPARATE_SEND_LIMIT,
} from "./batching";
import { TOPICS } from "./topics";

interface Row {
  batchId: string;
  channel: "email" | "whatsapp";
  key: string;
  /** The record it's about; rows about one record collapse into one. */
  name?: string;
  title?: string;
  topicId?: string;
  userId: string;
}

/** Queues one run: what the claim returns, the rows it loads, what's been read. */
function queueRun(rows: Row[], read: { key: string; userId: string }[] = []) {
  state.execute.push(
    [...new Set(rows.map((r) => r.batchId))].map((batch_id) => ({ batch_id }))
  );
  state.select.push(
    rows.map((r) => ({
      batchId: r.batchId,
      body: `body ${r.key}`,
      channel: r.channel,
      clickAction: `/x/${r.name ?? r.key}`,
      digest: { name: r.name ?? r.key },
      emailHtml: `<p>${r.key}</p>`,
      key: r.key,
      title: r.title ?? "📄 New invoice",
      topicId: r.topicId ?? TOPICS.REQUESTS_SUBMISSIONS,
      userId: r.userId,
      whatsappTemplate: {
        name: "invoice_submitted",
        params: { submitter: "Priya", title: r.key },
        path: `vendor-payments/${r.key}`,
      },
      whatsappText: `wa ${r.key}`,
    }))
  );
  state.select.push(
    read.map((r) => ({ idempotencyKey: `${r.key}-inbox`, userId: r.userId }))
  );
}

const stampedSent = () => state.sets.filter((s) => "sentAt" in s).length;
/** A claim expired for the next run (not a takeover, which counts attempts). */
const expired = () =>
  state.sets.some((s) => "claimedAt" in s && !("attempts" in s));

beforeEach(() => {
  vi.clearAllMocks();
  state.execute = [];
  state.select = [];
  state.sets = [];
  state.holdError = null;
  mocks.cloud.enabled = false;
  mocks.cloud.category = "UTILITY";
  mocks.cloud.status = "APPROVED";
  vi.mocked(sendWhatsAppNotification).mockImplementation(notify);
});

describe("flushHeldNotifications", () => {
  it("sends a message held for several recipients once, through the batch endpoint", async () => {
    queueRun([
      { batchId: "b2", channel: "email", key: "k1", userId: "u2" },
      { batchId: "b1", channel: "email", key: "k1", userId: "u1" },
    ]);

    const result = await flushHeldNotifications();

    expect(mocks.sendBulkNotificationEmails).toHaveBeenCalledTimes(1);
    const call = mocks.sendBulkNotificationEmails.mock.calls[0]?.[0] as {
      emailHtml: string;
      idempotencyKey: string;
      recipients: unknown[];
    };
    expect(call.emailHtml).toBe("<p>k1</p>");
    expect(call.recipients).toEqual([
      { email: "u2@test.dev", userId: "u2" },
      { email: "u1@test.dev", userId: "u1" },
    ]);
    expect(call.idempotencyKey).toMatch(/^k1-email-[0-9a-f]{16}$/);
    expect(result).toMatchObject({ batches: 2, digests: 0, singles: 2 });
  });

  it("keys a resend of the same batches the same way, whatever their order", async () => {
    queueRun([
      { batchId: "b1", channel: "email", key: "k1", userId: "u1" },
      { batchId: "b2", channel: "email", key: "k1", userId: "u2" },
    ]);
    await flushHeldNotifications();
    queueRun([
      { batchId: "b2", channel: "email", key: "k1", userId: "u2" },
      { batchId: "b1", channel: "email", key: "k1", userId: "u1" },
    ]);
    await flushHeldNotifications();

    const keys = mocks.sendBulkNotificationEmails.mock.calls.map(
      (c) => (c[0] as { idempotencyKey: string }).idempotencyKey
    );
    expect(keys[0]).toBe(keys[1]);
  });

  it("sends a digest under its batch key with the topic in the subject", async () => {
    queueRun([
      { batchId: "b1", channel: "email", key: "k1", userId: "u1" },
      { batchId: "b1", channel: "email", key: "k2", userId: "u1" },
    ]);

    const result = await flushHeldNotifications();

    expect(mocks.sendBulkNotificationEmails).not.toHaveBeenCalled();
    expect(mocks.sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailHtml: "<html>digest</html>",
        idempotencyKey: "digest-b1-email",
        title: "New invoice (2) · Pending approvals",
        toEmail: "u1@test.dev",
        userId: "u1",
      })
    );
    expect(result.digests).toBe(1);
  });

  it("stamps a batch sent without emailing someone who turned email off", async () => {
    mocks.getBulkChannelPreferences.mockResolvedValueOnce(
      new Map([
        [
          "u1",
          { emailEnabled: false, inboxEnabled: true, whatsappEnabled: true },
        ],
      ])
    );
    queueRun([
      { batchId: "b1", channel: "email", key: "k1", userId: "u1" },
      { batchId: "b1", channel: "email", key: "k2", userId: "u1" },
    ]);

    await flushHeldNotifications();

    expect(mocks.sendNotificationEmail).not.toHaveBeenCalled();
    expect(stampedSent()).toBeGreaterThan(0);
  });

  it("leaves out messages already read in the inbox", async () => {
    queueRun(
      [
        { batchId: "b1", channel: "email", key: "k1", userId: "u1" },
        { batchId: "b1", channel: "email", key: "k2", userId: "u1" },
      ],
      [{ key: "k1", userId: "u1" }]
    );

    const result = await flushHeldNotifications();

    expect(result.skippedRead).toBe(1);
    expect(mocks.sendNotificationEmail).not.toHaveBeenCalled();
    expect(mocks.sendBulkNotificationEmails).toHaveBeenCalledWith(
      expect.objectContaining({ emailHtml: "<p>k2</p>" })
    );
  });

  it("sends a single WhatsApp as written, under the message's own key", async () => {
    queueRun([{ batchId: "b1", channel: "whatsapp", key: "k1", userId: "u1" }]);

    await flushHeldNotifications();

    expect(mocks.sendWhatsAppMessage).toHaveBeenCalledWith("91u1", "wa k1", {
      idempotencyKey: "k1-whatsapp-u1",
    });
  });

  it("keeps sending other groups when one group fails", async () => {
    mocks.getBulkUserEmails.mockRejectedValueOnce(new Error("db down"));
    queueRun([
      { batchId: "b1", channel: "email", key: "k1", userId: "u1" },
      { batchId: "b2", channel: "whatsapp", key: "k2", userId: "u1" },
    ]);

    const result = await flushHeldNotifications();

    expect(result.failedGroups).toBe(1);
    expect(mocks.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    // The failed group's claim is expired for the next run, not stamped sent.
    expect(state.sets.some((s) => "claimedAt" in s && !("attempts" in s))).toBe(
      true
    );
  });

  it("stops between groups once the job is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    queueRun([{ batchId: "b1", channel: "email", key: "k1", userId: "u1" }]);

    await flushHeldNotifications(controller.signal);

    expect(mocks.sendBulkNotificationEmails).not.toHaveBeenCalled();
  });

  it("drops due messages without sending while the kill switch is on", async () => {
    mocks.isNotificationsDisabled.mockResolvedValueOnce(true);

    const result = await flushHeldNotifications();

    expect(state.execute).toEqual([]);
    expect(mocks.sendBulkNotificationEmails).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(result.dropped).toBe(0);
    expect(stampedSent()).toBe(1);
  });
});

describe("flushHeldNotifications with the Cloud API", () => {
  beforeEach(() => {
    mocks.cloud.enabled = true;
  });

  const twoForOnePerson = (): Row[] => [
    { batchId: "b1", channel: "whatsapp", key: "k1", userId: "u1" },
    { batchId: "b1", channel: "whatsapp", key: "k2", userId: "u1" },
  ];

  it("sends a single held message as its own template", async () => {
    queueRun([{ batchId: "b1", channel: "whatsapp", key: "k1", userId: "u1" }]);
    await flushHeldNotifications();
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mocks.sendCloudTemplate).toHaveBeenCalledWith("91u1", {
      name: "invoice_submitted",
      params: { submitter: "Priya", title: "k1" },
      path: "vendor-payments/k1",
    });
  });

  it("sends several as the summary template while it's utility", async () => {
    queueRun(twoForOnePerson());
    const result = await flushHeldNotifications();
    expect(mocks.sendCloudTemplate).toHaveBeenCalledTimes(1);
    const [, message] = mocks.sendCloudTemplate.mock.calls[0] ?? [];
    expect(message).toMatchObject({
      name: "notifications_summary",
      params: { count: "2", summary: "k1; k2" },
    });
    expect(result.digests).toBe(1);
  });

  it("sends each message alone once Meta moves the summary to marketing", async () => {
    mocks.cloud.category = "MARKETING";
    queueRun(twoForOnePerson());
    const result = await flushHeldNotifications();
    expect(
      mocks.sendCloudTemplate.mock.calls.map(([, message]) => message.name)
    ).toEqual(["invoice_submitted", "invoice_submitted"]);
    expect(result).toMatchObject({ digests: 0, singles: 2 });
  });

  const heldFor = (count: number): Row[] =>
    Array.from({ length: count }, (_, i) => ({
      batchId: "b1",
      channel: "whatsapp" as const,
      key: `k${i + 1}`,
      userId: "u1",
    }));
  const sentNames = () =>
    mocks.sendCloudTemplate.mock.calls.map(([, message]) => message.name);

  it("sends the marketing summary once a batch is past the separate-send limit", async () => {
    mocks.cloud.category = "MARKETING";
    queueRun(heldFor(WHATSAPP_SEPARATE_SEND_LIMIT + 1));
    const result = await flushHeldNotifications();
    expect(sentNames()).toEqual(["notifications_summary"]);
    const [, message] = mocks.sendCloudTemplate.mock.calls[0] ?? [];
    expect(message?.params).toMatchObject({ count: "6" });
    expect(result.digests).toBe(1);
  });

  it("sends a marketing batch at the limit separately", async () => {
    mocks.cloud.category = "MARKETING";
    queueRun(heldFor(WHATSAPP_SEPARATE_SEND_LIMIT));
    await flushHeldNotifications();
    expect(sentNames()).toEqual(Array(5).fill("invoice_submitted"));
  });

  it("never sends a summary Meta hasn't approved, however many are held", async () => {
    mocks.cloud.status = "PENDING";
    queueRun(heldFor(7));
    const result = await flushHeldNotifications();
    expect(sentNames()).toEqual(Array(7).fill("invoice_submitted"));
    expect(result).toMatchObject({ digests: 0, singles: 7 });
  });

  it("sends each message alone when the template lookup fails", async () => {
    mocks.getCloudTemplate.mockRejectedValueOnce(new Error("graph down"));
    queueRun(heldFor(7));
    await flushHeldNotifications();
    expect(sentNames()).toEqual(Array(7).fill("invoice_submitted"));
  });

  it("sends updates to one record as the newest message, not a summary", async () => {
    queueRun([
      {
        batchId: "b1",
        channel: "whatsapp",
        key: "k1",
        name: "rent",
        userId: "u1",
      },
      {
        batchId: "b1",
        channel: "whatsapp",
        key: "k2",
        name: "rent",
        userId: "u1",
      },
    ]);
    const result = await flushHeldNotifications();
    expect(mocks.getCloudTemplate).not.toHaveBeenCalled();
    expect(sendWhatsAppNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendWhatsAppNotification).mock.calls[0]?.[2]).toEqual({
      idempotencyKey: "k2-whatsapp-u1",
      userId: "u1",
    });
    expect(result).toMatchObject({ digests: 0, singles: 1 });
  });

  it("keeps sending the rest when one separate message is refused", async () => {
    mocks.cloud.category = "MARKETING";
    vi.mocked(sendWhatsAppNotification).mockResolvedValueOnce("rejected");
    queueRun(twoForOnePerson());
    const result = await flushHeldNotifications();
    expect(sendWhatsAppNotification).toHaveBeenCalledTimes(2);
    expect(result.singles).toBe(1);
    // Refused for good: the batch is done, not retried.
    expect(expired()).toBe(false);
    expect(stampedSent()).toBe(2);
  });

  it("expires a batch for retry when a separate send fails for now", async () => {
    mocks.cloud.category = "MARKETING";
    vi.mocked(sendWhatsAppNotification).mockRejectedValueOnce(
      new Error("throttled")
    );
    queueRun(twoForOnePerson());
    const result = await flushHeldNotifications();
    expect(sendWhatsAppNotification).toHaveBeenCalledTimes(2);
    expect(result.singles).toBe(1);
    expect(expired()).toBe(true);
    // Only the takeover sweep's stamp; the batch itself isn't stamped sent.
    expect(stampedSent()).toBe(1);
  });

  it("expires a batch for retry when its summary fails for now", async () => {
    vi.mocked(sendWhatsAppNotification).mockRejectedValueOnce(new Error("503"));
    queueRun(twoForOnePerson());
    const result = await flushHeldNotifications();
    expect(result.digests).toBe(0);
    expect(expired()).toBe(true);
    expect(stampedSent()).toBe(1);
  });
});

describe("WhatsApp send log pruning", () => {
  it("prunes at most hourly though the flush runs every minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2100-01-01T00:00:00Z"));
      await flushHeldNotifications();
      vi.setSystemTime(new Date("2100-01-01T00:01:00Z"));
      await flushHeldNotifications();
      vi.setSystemTime(new Date("2100-01-01T00:59:00Z"));
      await flushHeldNotifications();
      expect(mocks.pruneWhatsAppMessages).toHaveBeenCalledTimes(1);
      vi.setSystemTime(new Date("2100-01-01T01:00:00Z"));
      await flushHeldNotifications();
      expect(mocks.pruneWhatsAppMessages).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("holdNotification", () => {
  const input = {
    body: "b",
    idempotencyKey: "k",
    recipients: [{ channel: "email" as const, userId: "u1" }],
    title: "t",
    topic: TOPICS.TEAMS,
  };

  it("holds nothing for no recipients", async () => {
    expect(await holdNotification({ ...input, recipients: [] })).toBe(false);
  });

  it("throws when it can't store, so the notify job is retried", async () => {
    state.holdError = new Error("connection reset");
    await expect(holdNotification(input)).rejects.toThrow("connection reset");
  });
});
