import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/contribution-receipts", () => ({
  loadReceiptDeliveryTarget: async () => null,
  markReceiptEmailed: async () => undefined,
  markReceiptWhatsAppSent: async () => undefined,
  recordReceiptDeliveryFailure: async () => undefined,
}));
mock.module("@pi-dash/db/queries/email-suppression", () => ({
  getEmailSuppression: async () => null,
}));
mock.module("@pi-dash/email", () => ({
  renderDonationReceiptEmail: async () => "",
}));
mock.module("@pi-dash/email/mailer", () => ({
  EmailSendError: class extends Error {},
  sendEmail: async () => ({ status: "skipped" as const }),
}));
mock.module("@pi-dash/whatsapp/cloud", () => ({
  getCloudTemplate: async () => undefined,
  isCloudApiEnabled: () => false,
}));
mock.module("@pi-dash/whatsapp/notify", () => ({
  sendWhatsAppNotification: async () => "sent",
  whatsappMessageStatus: async () => null,
}));
mock.module("./create-handler", () => ({
  createNotifyHandler: () => async () => ({}),
}));
mock.module("../lib/receipt-pdf", () => ({
  receiptPdf: async () => null,
}));

const { deliverContributionReceipt } =
  await import("./deliver-contribution-receipt");
type Deps = NonNullable<Parameters<typeof deliverContributionReceipt>[1]>;

const payload = { receiptId: "r1" };
const target = {
  contributionId: "c1",
  delivered: false,
  donorChanged: false,
  email: "donor@example.com" as string | null,
  phone: "+919999999999" as string | null,
  voided: false,
};
const rendered = {
  document: {
    donor: { name: "Test Donor" },
    gift: { amountPaise: 500_000, receivedOn: "2026-05-01" },
    number: "PI/2026-27/0001",
    org: { name: "Example Trust" },
    voidedAt: null,
  },
  filename: "PI-2026-27-0001.pdf",
  pdf: Buffer.from("%PDF"),
} as never;

let events: string[] = [];
let loads = 0;

function deps(loaded: typeof target | null = target): Deps {
  const recordFailure = async (_id: string, failure: string) => {
    events.push(`failure:${failure}`);
  };
  return {
    email: {
      getSuppression: async () => null,
      markEmailed: async () => {
        events.push("emailed");
      },
      recordFailure,
      renderEmail: async () => "<p>Thanks</p>",
      renderPdf: async () => rendered,
      send: async (options) => {
        events.push(`email:${options.idempotencyKey}`);
        return { id: "e1", status: "sent" as const };
      },
    },
    loadTarget: async () => {
      loads += 1;
      return loaded;
    },
    whatsapp: {
      markSent: async () => {
        events.push("whatsapp_sent");
      },
      recordFailure,
      renderPdf: async () => rendered,
      send: async (_phone, _message, options) => {
        events.push(`whatsapp:${options.idempotencyKey}`);
        return "sent";
      },
      loggedStatus: async () => null,
      templateReady: async () => true,
    },
  };
}

describe("automatic receipt delivery", () => {
  beforeEach(() => {
    events = [];
    loads = 0;
  });

  it("reads the contacts once and emails a donor who has an address", async () => {
    expect(await deliverContributionReceipt(payload, deps())).toEqual({
      channel: "email",
      outcome: "sent",
    });
    expect(loads).toBe(1);
    expect(events).toEqual(["email:receipt-r1-automatic", "emailed"]);
  });

  it("uses WhatsApp only for a donor without an email address", async () => {
    expect(
      await deliverContributionReceipt(
        payload,
        deps({ ...target, email: null })
      )
    ).toEqual({ channel: "whatsapp", outcome: "sent" });
    expect(events).toEqual([
      "whatsapp:receipt-whatsapp-r1-automatic",
      "whatsapp_sent",
    ]);
  });

  it("doesn't fall back to WhatsApp from a bounced address", async () => {
    const d = deps();
    d.email.getSuppression = async () => ({
      createdAt: new Date(),
      reason: "hard_bounce",
    });
    expect(await deliverContributionReceipt(payload, d)).toEqual({
      channel: "email",
      outcome: "suppressed",
    });
    expect(events).toEqual(["failure:email_suppressed"]);
  });

  it("still emails after finance's WhatsApp send failed for want of a template", async () => {
    // The manual send recorded whatsapp_no_template and delivered nothing,
    // so the receipt reads as undelivered when the window ends.
    expect(await deliverContributionReceipt(payload, deps())).toEqual({
      channel: "email",
      outcome: "sent",
    });
  });

  it("skips a voided or already delivered receipt, and refuses a changed donor", async () => {
    expect(
      await deliverContributionReceipt(
        payload,
        deps({ ...target, voided: true })
      )
    ).toEqual({ outcome: "voided" });
    expect(
      await deliverContributionReceipt(
        payload,
        deps({ ...target, delivered: true })
      )
    ).toEqual({ outcome: "already_delivered" });
    expect(
      await deliverContributionReceipt(
        payload,
        deps({ ...target, donorChanged: true })
      )
    ).toEqual({ outcome: "donor_changed" });
    expect(events).toEqual(["failure:donor_changed"]);
  });

  it("records a donor it can't reach", async () => {
    expect(
      await deliverContributionReceipt(
        payload,
        deps({ ...target, email: null, phone: null })
      )
    ).toEqual({ outcome: "no_contact" });
    expect(events).toEqual(["failure:no_contact"]);
  });

  it("records a thrown send and rethrows it for a retry", async () => {
    const d = deps();
    d.email.send = async () => {
      throw new Error("Resend down");
    };
    await expect(deliverContributionReceipt(payload, d)).rejects.toThrow(
      "Resend down"
    );
    expect(events).toEqual(["failure:email_failed"]);
  });
});
