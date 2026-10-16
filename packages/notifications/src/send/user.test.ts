import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  renderNotificationEmail: vi.fn(async () => "<html />"),
  sendMessage: vi.fn(async () => undefined),
}));

vi.mock("@pi-dash/email", () => ({
  renderNotificationEmail: mocks.renderNotificationEmail,
}));
vi.mock("@pi-dash/env/server", () => ({
  env: { APP_URL: "https://dash.example.test" },
}));
vi.mock("@pi-dash/db/queries/email-suppression", () => ({
  getEmailSuppression: vi.fn(async () => null),
}));
vi.mock("../email", () => ({
  sendNotificationEmail: vi.fn(async () => true),
}));
vi.mock("../send-message", () => ({
  sendMessage: mocks.sendMessage,
}));

import { TOPICS } from "../topics";
import { notifyKalakritiGuardianAccess, notifyUserBanned } from "./user";

describe("Kalakriti Guardian access notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      body: "Your Guardian access to Kalakriti 2028 is ready. Use the login credentials provided by your administrator.",
      reusedIdentity: false,
    },
    {
      body: "Your Guardian access to Kalakriti 2028 is active. Your existing login credentials remain unchanged.",
      reusedIdentity: true,
    },
  ])(
    "sends the correct access instructions",
    async ({ body, reusedIdentity }) => {
      await notifyKalakritiGuardianAccess({
        editionName: "Kalakriti 2028",
        membershipId: "membership-1",
        reusedIdentity,
        userId: "user-1",
        year: 2028,
      });

      expect(mocks.renderNotificationEmail).toHaveBeenCalledWith({
        ctaLabel: "Open Kalakriti",
        ctaUrl: "https://dash.example.test/kalakriti/2028",
        heading: "Guardian access for Kalakriti 2028",
        paragraphs: [body],
      });
      expect(mocks.sendMessage).toHaveBeenCalledWith({
        body,
        clickAction: "/kalakriti/2028",
        emailHtml: "<html />",
        idempotencyKey: "kalakriti-guardian-access-membership-1",
        title: "Guardian access for Kalakriti 2028",
        to: "user-1",
        topic: TOPICS.ACCOUNT,
        whatsappTemplate: {
          name: "kalakriti_guardian_ready",
          params: { edition: "Kalakriti 2028" },
          path: "kalakriti/2028",
        },
      });
    }
  );
});

describe("suspended account notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the reason in the WhatsApp template when there is one", async () => {
    await notifyUserBanned({ reason: "Missed\nshifts", userId: "user-1" });

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsappTemplate: {
          name: "account_suspended",
          params: { reason: "Missed shifts" },
        },
      })
    );
  });

  it("uses the no-reason template when there is no reason", async () => {
    await notifyUserBanned({ userId: "user-1" });

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsappTemplate: { name: "account_suspended_no_reason", params: {} },
      })
    );
  });
});
