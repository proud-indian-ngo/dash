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
  sendWhatsAppMessage: vi.fn(async () => undefined),
}));

vi.mock("@pi-dash/email", () => ({
  renderNotificationDigestEmail: mocks.renderNotificationDigestEmail,
}));
vi.mock("@pi-dash/env/server", () => ({
  env: { APP_NAME: "PI", APP_URL: "https://dash.test" },
}));
vi.mock("@pi-dash/whatsapp/messaging", () => ({
  sendWhatsAppMessage: mocks.sendWhatsAppMessage,
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

import { flushHeldNotifications, holdNotification } from "./batching";
import { TOPICS } from "./topics";

interface Row {
  batchId: string;
  channel: "email" | "whatsapp";
  key: string;
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
      clickAction: `/x/${r.key}`,
      digest: { name: r.key },
      emailHtml: `<p>${r.key}</p>`,
      key: r.key,
      title: r.title ?? "📄 New invoice",
      topicId: r.topicId ?? TOPICS.REQUESTS_SUBMISSIONS,
      userId: r.userId,
      whatsappText: `wa ${r.key}`,
    }))
  );
  state.select.push(
    read.map((r) => ({ idempotencyKey: `${r.key}-inbox`, userId: r.userId }))
  );
}

const stampedSent = () => state.sets.filter((s) => "sentAt" in s).length;

beforeEach(() => {
  vi.clearAllMocks();
  state.execute = [];
  state.select = [];
  state.sets = [];
  state.holdError = null;
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
