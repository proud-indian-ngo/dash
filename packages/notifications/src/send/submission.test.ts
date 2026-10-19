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
      listNoun: "reimbursements",
      routePrefix: "reimbursements",
      statusTopic: TOPICS.REQUESTS_STATUS,
      submittedTopic: TOPICS.REQUESTS_SUBMISSIONS,
    });

    await notifier.notifyApproved({
      entityId: "request-1",
      note: "Paid",
      reviewedAt: 1,
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
      idempotencyKey: "reimbursement-approved-request-1-user-1-1",
    });
  });

  it("describes a submission as a review row with its total", async () => {
    const notifier = createSubmissionNotifier({
      entityLabel: "Reimbursement",
      getLineItems: async () => [
        { amountPaise: 150_000, categoryName: "Travel", description: null },
        { amountPaise: 25_000, categoryName: "Food", description: null },
      ],
      idempotencyPrefix: "reimbursement",
      listNoun: "reimbursements",
      routePrefix: "reimbursements",
      statusTopic: TOPICS.REQUESTS_STATUS,
      submittedTopic: TOPICS.REQUESTS_SUBMISSIONS,
    });

    await notifier.notifySubmitted({
      entityId: "request-1",
      submitterName: "Asha",
      title: "Bus to venue",
    });

    expect(mocks.sendBulkMessage.mock.calls[0]?.[0]).toMatchObject({
      digest: {
        actionLabel: "Review",
        amountPaise: 175_000,
        list: { label: "Review reimbursements", path: "/reimbursements" },
        meta: "Asha · Reimbursement",
        name: "Bus to venue",
        status: { label: "Needs review", tone: "warning" },
      },
    });
  });

  it("fills the request_approved_with_note template when there is a note", async () => {
    const notifier = createSubmissionNotifier({
      entityLabel: "Reimbursement",
      getLineItems: async () => [
        { amountPaise: 150_000, categoryName: "Travel", description: null },
      ],
      idempotencyPrefix: "reimbursement",
      listNoun: "reimbursements",
      routePrefix: "reimbursements",
      statusTopic: TOPICS.REQUESTS_STATUS,
      submittedTopic: TOPICS.REQUESTS_SUBMISSIONS,
    });

    await notifier.notifyApproved({
      entityId: "request-1",
      note: "Paid by UPI",
      reviewedAt: 1,
      submitterId: "user-1",
      title: "Travel",
    });

    expect(mocks.sendMessage.mock.calls[0]?.[0]).toMatchObject({
      whatsappTemplate: {
        name: "request_approved_with_note",
        params: {
          amount: "₹1,500.00",
          note: "Paid by UPI",
          request_type: "reimbursement",
          title: "Travel",
        },
        path: "reimbursements/request-1",
      },
    });
  });

  it("fills the request_approved template without a note or line items", async () => {
    const notifier = createSubmissionNotifier({
      entityLabel: "Advance Payment",
      getLineItems: async () => [],
      idempotencyPrefix: "advance-payment",
      listNoun: "advance payments",
      routePrefix: "advance-payments",
      statusTopic: TOPICS.REQUESTS_STATUS,
      submittedTopic: TOPICS.REQUESTS_SUBMISSIONS,
    });

    await notifier.notifyApproved({
      entityId: "request-2",
      reviewedAt: 1,
      submitterId: "user-1",
      title: "Stage hire",
    });

    expect(mocks.sendMessage.mock.calls[0]?.[0]).toMatchObject({
      whatsappTemplate: {
        name: "request_approved",
        params: {
          amount: "amount not entered",
          request_type: "advance payment",
          title: "Stage hire",
        },
        path: "advance-payments/request-2",
      },
    });
  });
});
