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
  getUserIdsWithPermission: vi.fn(async () => ["approver-1"]),
}));
vi.mock("../send-message", () => ({
  sendBulkMessage: mocks.sendBulkMessage,
  sendMessage: mocks.sendMessage,
}));

import {
  notifyVendorPaymentTransactionApproved,
  notifyVendorPaymentTransactionRejected,
  notifyVendorPaymentTransactionSubmitted,
} from "./vendor-payment-transaction";

const base = {
  submitterId: "user-1",
  transactionId: "txn-1",
  vendorPaymentId: "vp-1",
  vendorPaymentTitle: "Stage hire",
};

const sentBody = (mock: typeof mocks.sendMessage) =>
  mock.mock.calls[0]?.[0]?.body as string;

describe("vendor payment transaction notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("formats amountPaise from current jobs", async () => {
    await notifyVendorPaymentTransactionApproved({
      ...base,
      amountPaise: 1999,
    });
    expect(sentBody(mocks.sendMessage)).toContain("₹19.99 payment");
  });

  it("accepts the legacy rupee amount from jobs enqueued before the paise release", async () => {
    await notifyVendorPaymentTransactionSubmitted({
      ...base,
      amount: 19.99,
      submitterName: "Asha",
    });
    expect(sentBody(mocks.sendBulkMessage)).toContain(
      "logged a payment of ₹19.99"
    );

    await notifyVendorPaymentTransactionRejected({
      ...base,
      amount: 1500,
      reason: "Duplicate",
    });
    expect(sentBody(mocks.sendMessage)).toContain("₹1,500.00 payment");
  });

  it("prefers amountPaise when a job carries both", async () => {
    await notifyVendorPaymentTransactionApproved({
      ...base,
      amount: 1,
      amountPaise: 150_000,
    });
    expect(sentBody(mocks.sendMessage)).toContain("₹1,500.00 payment");
  });

  it("fails clearly when the job has no amount", async () => {
    await expect(notifyVendorPaymentTransactionApproved(base)).rejects.toThrow(
      "neither amountPaise nor a legacy rupee amount"
    );
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
