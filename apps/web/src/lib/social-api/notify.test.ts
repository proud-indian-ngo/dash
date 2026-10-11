import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/social-api", () => ({
  getAppConfigValues: mock(),
}));
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue: mock() }));
mock.module("@pi-dash/notifications/kill-switch", () => ({
  isNotificationsDisabled: mock(),
}));
mock.module("@pi-dash/whatsapp/users", () => ({ getUserPhone: mock() }));

import {
  handleSocialNotifyRequest,
  notifyRequestSchema,
  type SocialNotifyDeps,
  socialNotifyIdempotencyKey,
} from "./notify";
import { stubAuthorize } from "./test-helpers";

const NOW = Date.parse("2026-10-11T10:00:00+05:30");
const body = {
  lines: ["Recap: Spoken English, Sat 18 Oct, 3 photos"],
  template: "social-digest",
  to: "approver",
};

function createDeps(overrides: Partial<SocialNotifyDeps> = {}) {
  const enqueueWhatsApp = mock(async () => "job-1");
  const getUserPhone = mock(async () => "+919999999999");
  const deps: SocialNotifyDeps = {
    authorize: stubAuthorize(),
    enqueueWhatsApp,
    getAppConfigValues: mock(
      async () => new Map([["social_approver_user_id", "user-approver"]])
    ),
    getUserPhone,
    isNotificationsDisabled: mock(async () => false),
    now: () => NOW,
    ...overrides,
  };
  return { deps, enqueueWhatsApp, getUserPhone };
}

const post = (payload: unknown) =>
  new Request("https://dash.proudindian.ngo/api/social/v1/notify", {
    body: JSON.stringify(payload),
    method: "POST",
  });

describe("notifyRequestSchema", () => {
  it.each([
    { to: "someone" },
    { template: "other" },
    { lines: [] },
    { lines: [""] },
    { lines: ["x".repeat(501)] },
    { lines: Array.from({ length: 41 }, () => "line") },
  ])("rejects %o", (change) => {
    expect(notifyRequestSchema.safeParse({ ...body, ...change }).success).toBe(
      false
    );
  });

  it("accepts 40 lines of 500 characters", () => {
    expect(
      notifyRequestSchema.safeParse({
        ...body,
        lines: Array.from({ length: 40 }, () => "x".repeat(500)),
      }).success
    ).toBe(true);
  });
});

describe("handleSocialNotifyRequest", () => {
  it("queues one WhatsApp digest to the approver with a per-day idempotency key", async () => {
    const { deps, enqueueWhatsApp, getUserPhone } = createDeps();

    const response = await handleSocialNotifyRequest(post(body), deps);

    expect(response.status).toBe(204);
    expect(getUserPhone).toHaveBeenCalledWith("user-approver");
    expect(enqueueWhatsApp).toHaveBeenCalledWith({
      idempotencyKey: socialNotifyIdempotencyKey(
        body as Parameters<typeof socialNotifyIdempotencyKey>[0],
        NOW
      ),
      message: "Social digest\n\nRecap: Spoken English, Sat 18 Oct, 3 photos",
      phone: "+919999999999",
    });
  });

  it("derives the same key for the same body and day, a new one the next day", () => {
    const parsed = notifyRequestSchema.parse(body);
    const key = socialNotifyIdempotencyKey(parsed, NOW);
    expect(socialNotifyIdempotencyKey(parsed, NOW + 3600_000)).toBe(key);
    expect(socialNotifyIdempotencyKey(parsed, NOW + 24 * 3600_000)).not.toBe(
      key
    );
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns 204 without sending when notifications are switched off", async () => {
    const { deps, enqueueWhatsApp } = createDeps({
      isNotificationsDisabled: mock(async () => true),
    });
    const response = await handleSocialNotifyRequest(post(body), deps);
    expect(response.status).toBe(204);
    expect(enqueueWhatsApp).not.toHaveBeenCalled();
  });

  it("returns 503 when no approver or phone is configured", async () => {
    const noKey = createDeps({
      getAppConfigValues: mock(async () => new Map()),
    });
    expect(
      (await handleSocialNotifyRequest(post(body), noKey.deps)).status
    ).toBe(503);

    const noPhone = createDeps({ getUserPhone: mock(async () => null) });
    expect(
      (await handleSocialNotifyRequest(post(body), noPhone.deps)).status
    ).toBe(503);
    expect(noPhone.enqueueWhatsApp).not.toHaveBeenCalled();
  });

  it("returns 413 for a body over 64 KB", async () => {
    const { deps, enqueueWhatsApp } = createDeps();
    const response = await handleSocialNotifyRequest(
      post({ ...body, lines: ["x".repeat(70_000)] }),
      deps
    );
    expect(response.status).toBe(413);
    expect(enqueueWhatsApp).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid body and the auth error for a bad token", async () => {
    const { deps } = createDeps();
    expect(
      (await handleSocialNotifyRequest(post({ ...body, lines: [] }), deps))
        .status
    ).toBe(400);
    const denied = createDeps({ authorize: stubAuthorize(403) });
    expect(
      (await handleSocialNotifyRequest(post(body), denied.deps)).status
    ).toBe(403);
  });
});
