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
  getVendorPaymentLineItems: vi.fn(async () => []),
}));
vi.mock("../send-message", () => ({
  sendBulkMessage: mocks.sendBulkMessage,
  sendMessage: mocks.sendMessage,
}));

import {
  notifyVendorPaymentInvoiceApproved,
  notifyVendorPaymentInvoiceRejected,
  notifyVendorPaymentInvoiceSubmitted,
} from "./vendor-payment";

const base = {
  submitterId: "user-1",
  timestamp: 1,
  vendorPaymentId: "vp-1",
  vendorPaymentTitle: "Office rent",
};

const sent = (mock: typeof mocks.sendMessage) =>
  mock.mock.calls[0]?.[0] as { body: string; title: string };

describe("vendor payment invoice notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("speaks of an invoice when one was uploaded", async () => {
    await notifyVendorPaymentInvoiceSubmitted({
      ...base,
      submitterName: "Asha",
    });
    expect(sent(mocks.sendBulkMessage)).toMatchObject({
      body: 'Asha uploaded an invoice for "Office rent" — time to review.',
      title: "📄 New invoice",
    });
  });

  it("names the reason and reports when no proof is attached", async () => {
    await notifyVendorPaymentInvoiceSubmitted({
      ...base,
      noInvoiceReason: "rent",
      submitterName: "Asha",
    });
    expect(sent(mocks.sendBulkMessage)).toMatchObject({
      body: 'Asha says "Office rent" has no invoice (Rent / lease). No proof attached — time to review.',
      title: "📄 Payment without invoice",
    });

    vi.clearAllMocks();
    await notifyVendorPaymentInvoiceSubmitted({
      ...base,
      noInvoiceReason: "rent",
      proofAttachmentCount: 0,
      submitterName: "Asha",
    });
    expect(sent(mocks.sendBulkMessage).body).toContain("No proof attached");
  });

  it.each([
    [1, "with 1 proof file"],
    [2, "with 2 proof files"],
  ])("reports %i attached proof files", async (proofAttachmentCount, copy) => {
    await notifyVendorPaymentInvoiceSubmitted({
      ...base,
      noInvoiceReason: "rent",
      proofAttachmentCount,
      submitterName: "Asha",
    });
    expect(sent(mocks.sendBulkMessage).body).toContain(copy);
  });

  it("uses no-invoice copy for approval and rejection", async () => {
    await notifyVendorPaymentInvoiceApproved({
      ...base,
      noInvoiceReason: "rent",
    });
    expect(sent(mocks.sendMessage).title).toBe("✅ Payment completed!");
    expect(sent(mocks.sendMessage).body).not.toContain("invoice for");

    vi.clearAllMocks();
    await notifyVendorPaymentInvoiceRejected({
      ...base,
      noInvoiceReason: "statutory",
      reason: "Attach the challan",
    });
    expect(sent(mocks.sendMessage).body).toBe(
      'Closing "Office rent" without an invoice wasn\'t approved: Attach the challan'
    );
  });
});
