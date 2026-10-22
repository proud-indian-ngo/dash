import { beforeEach, describe, expect, it, mock } from "bun:test";

// Keep the real database, Resend and PDF modules out of the test.
mock.module("@pi-dash/db/queries/contribution-receipts", () => ({
  loadReceiptEmailTarget: async () => null,
  markReceiptEmailed: async () => undefined,
  recordReceiptDeliveryFailure: async () => undefined,
}));
mock.module("@pi-dash/db/queries/email-suppression", () => ({
  getEmailSuppression: async () => null,
}));
mock.module("@pi-dash/email", () => ({
  renderDonationReceiptEmail: async () => "",
}));
class EmailSendError extends Error {
  readonly statusCode: number | null;
  constructor(code: string, message: string, statusCode: number | null) {
    super(`Resend ${code}: ${message}`);
    this.statusCode = statusCode;
  }
}

mock.module("@pi-dash/email/mailer", () => ({
  EmailSendError,
  sendEmail: async () => ({ status: "skipped" as const }),
}));
mock.module("./create-handler", () => ({
  createNotifyHandler: () => async () => ({}),
}));
mock.module("../lib/receipt-pdf", () => ({
  receiptPdf: async () => null,
}));

const { sendContributionReceipt } = await import("./send-contribution-receipt");
type Deps = Parameters<typeof sendContributionReceipt>[1];

const target = {
  contributionId: "c1",
  delivered: false,
  email: "donor@example.com",
  number: "PI/2026-27/0001",
  partyId: "p1",
  voided: false,
};

const document = {
  donor: { address: "Somewhere", idType: "pan", name: "Test Donor" },
  gift: { amountPaise: 500_000, receivedOn: "2026-05-01" },
  number: "PI/2026-27/0001",
  org: { address: "Here", name: "Example Trust", pan: "AAATE0000E" },
};

let sent: Record<string, unknown>[] = [];
let marked: string[] = [];
let failures: string[] = [];

function deps(overrides: Partial<NonNullable<Deps>> = {}): NonNullable<Deps> {
  return {
    getSuppression: async () => null,
    loadTarget: async () => target,
    markEmailed: async (id: string) => {
      marked.push(id);
    },
    recordFailure: async (_id, failure) => {
      failures.push(failure);
    },
    renderEmail: async () => "<p>Thanks</p>",
    renderPdf: async () =>
      ({
        document,
        filename: "PI-2026-27-0001.pdf",
        pdf: Buffer.from("%PDF"),
      }) as never,
    send: async (options) => {
      sent.push(options as unknown as Record<string, unknown>);
      return { id: "email-1", status: "sent" as const };
    },
    ...overrides,
  };
}

const payload = { receiptId: "r1", requestId: "q1" };

describe("sendContributionReceipt", () => {
  beforeEach(() => {
    sent = [];
    marked = [];
    failures = [];
  });

  it("emails the PDF to the donor and stamps the receipt", async () => {
    expect(await sendContributionReceipt(payload, deps())).toEqual({
      outcome: "sent",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      attachments: [{ filename: "PI-2026-27-0001.pdf" }],
      idempotencyKey: "receipt-r1-q1",
      subject: "Your donation receipt PI/2026-27/0001",
      to: "donor@example.com",
    });
    expect(marked).toEqual(["r1"]);
  });

  it("skips voided receipts, missing addresses and suppressed addresses", async () => {
    expect(
      await sendContributionReceipt(
        payload,
        deps({ loadTarget: async () => ({ ...target, voided: true }) })
      )
    ).toEqual({ outcome: "voided" });
    expect(
      await sendContributionReceipt(
        payload,
        deps({ loadTarget: async () => ({ ...target, email: null }) })
      )
    ).toEqual({ outcome: "no_email" });
    expect(
      await sendContributionReceipt(
        payload,
        deps({
          getSuppression: async () => ({
            createdAt: new Date(),
            reason: "complaint",
          }),
        })
      )
    ).toEqual({ outcome: "suppressed" });
    expect(sent).toHaveLength(0);
    expect(marked).toHaveLength(0);
    // Finance sees the bounce; a missing address is the WhatsApp job's call.
    expect(failures).toEqual(["email_suppressed"]);
  });

  it("skips the automatic send once the receipt was delivered by hand", async () => {
    expect(
      await sendContributionReceipt(
        { receiptId: "r1", requestId: "automatic" },
        deps({ loadTarget: async () => ({ ...target, delivered: true }) })
      )
    ).toEqual({ outcome: "already_delivered" });
    expect(sent).toHaveLength(0);
  });

  it("always sends finance's email, even when already delivered", async () => {
    expect(
      await sendContributionReceipt(
        payload,
        deps({ loadTarget: async () => ({ ...target, delivered: true }) })
      )
    ).toEqual({ outcome: "sent" });
    expect(sent).toHaveLength(1);
  });

  it("records a 409 idempotency conflict as already sent", async () => {
    expect(
      await sendContributionReceipt(
        payload,
        deps({
          send: async () => {
            throw new EmailSendError(
              "invalid_idempotent_request",
              "Key already used",
              409
            );
          },
        })
      )
    ).toEqual({ outcome: "already_sent" });
    expect(marked).toEqual(["r1"]);
  });

  it("lets other Resend failures throw for a retry", async () => {
    await expect(
      sendContributionReceipt(
        payload,
        deps({
          send: async () => {
            throw new EmailSendError("internal_server_error", "Down", 500);
          },
        })
      )
    ).rejects.toThrow("Down");
    expect(marked).toHaveLength(0);
  });

  it("doesn't stamp the receipt when email isn't configured", async () => {
    expect(
      await sendContributionReceipt(
        payload,
        deps({ send: async () => ({ status: "skipped" as const }) })
      )
    ).toEqual({ outcome: "not_configured" });
    expect(marked).toHaveLength(0);
    expect(failures).toEqual(["email_not_configured"]);
  });
});
