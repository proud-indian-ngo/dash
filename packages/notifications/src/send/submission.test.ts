import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  renderNotificationEmail: vi.fn(
    async (_options: Record<string, unknown>) => "<html />"
  ),
  sendBulkMessage: vi.fn((_options: Record<string, unknown>) =>
    Promise.resolve()
  ),
  sendMessage: vi.fn((_options: Record<string, unknown>) => Promise.resolve()),
}));

vi.mock("@pi-dash/email", () => ({
  renderNotificationEmail: mocks.renderNotificationEmail,
}));
vi.mock("@pi-dash/env/server", () => ({
  env: { APP_URL: "https://dash.example.test" },
}));
vi.mock("../helpers", () => ({
  getUserIdsWithPermission: vi.fn(async () => []),
}));
vi.mock("../send-message", () => ({
  sendBulkMessage: mocks.sendBulkMessage,
  sendMessage: mocks.sendMessage,
}));

import { TOPICS } from "../topics";
import { createSubmissionNotifier } from "./submission";

describe("submission approval notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the authenticated detail action without attaching protected media", async () => {
    const notifier = createSubmissionNotifier({
      entityLabel: "Reimbursement",
      getLineItems: async () => [],
      idempotencyPrefix: "reimbursement",
      routePrefix: "reimbursements",
      statusTopic: TOPICS.REQUESTS_STATUS,
      submittedTopic: TOPICS.REQUESTS_SUBMISSIONS,
    });

    await notifier.notifyApproved({
      entityId: "request-1",
      note: "Paid",
      submitterId: "user-1",
      title: "Travel",
    });

    const emailOptions = mocks.renderNotificationEmail.mock.calls[0]?.[0];
    const messageOptions = mocks.sendMessage.mock.calls[0]?.[0];
    expect(emailOptions).not.toHaveProperty("imageUrl");
    expect(emailOptions).toMatchObject({
      ctaUrl: "https://dash.example.test/reimbursements/request-1",
    });
    expect(messageOptions).not.toHaveProperty("imageUrl");
    expect(messageOptions).toMatchObject({
      clickAction: "/reimbursements/request-1",
    });
  });
});
