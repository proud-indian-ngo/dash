import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/contribution-receipts", () => ({
  loadReceiptWhatsAppTarget: async () => null,
}));
mock.module("@pi-dash/whatsapp/notify", () => ({
  sendWhatsAppNotification: async () => "sent",
}));
mock.module("./create-handler", () => ({
  createNotifyHandler: () => async () => ({}),
}));
mock.module("../lib/receipt-pdf", () => ({
  renderReceiptPdf: async () => null,
}));

const { sendContributionReceiptWhatsApp } =
  await import("./send-contribution-receipt-whatsapp");
type Deps = NonNullable<Parameters<typeof sendContributionReceiptWhatsApp>[1]>;
const payload = { receiptId: "receipt-1", requestId: "automatic" };
const sent: unknown[][] = [];

function dependencies(overrides: Partial<Deps> = {}): Deps {
  return {
    loadTarget: async () => ({
      email: null,
      phone: "+919999999999",
      voided: false,
    }),
    renderPdf: async () =>
      ({
        document: {
          gift: { amountPaise: 50_000, receivedOn: "2026-10-01" },
          number: "PI/2026-27/0001",
          voidedAt: null,
        },
        filename: "PI-2026-27-0001.pdf",
        pdf: Buffer.from("%PDF"),
      }) as never,
    send: async (...args) => {
      sent.push(args);
      return "sent";
    },
    ...overrides,
  };
}

describe("receipt WhatsApp delivery", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it("sends the PDF by WhatsApp when the donor has a phone but no email", async () => {
    expect(
      await sendContributionReceiptWhatsApp(payload, dependencies())
    ).toEqual({ outcome: "sent" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject([
      "+919999999999",
      {
        template: {
          name: "donation_receipt",
          params: { amount: "₹500.00", number: "PI/2026-27/0001" },
          document: {
            filename: "PI-2026-27-0001.pdf",
            bytes: new Uint8Array(Buffer.from("%PDF")),
          },
        },
      },
      { idempotencyKey: "receipt-whatsapp-receipt-1-automatic" },
    ]);
  });

  it("skips WhatsApp when email exists, without rendering or sending the PDF", async () => {
    const renderPdf = mock(async () => null);
    expect(
      await sendContributionReceiptWhatsApp(
        payload,
        dependencies({
          loadTarget: async () => ({
            email: "donor@example.com",
            phone: "+919999999999",
            voided: false,
          }),
          renderPdf,
        })
      )
    ).toEqual({ outcome: "email_available" });
    expect(renderPdf).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it("skips missing receipts, voided receipts and donors without a phone", async () => {
    for (const [target, outcome] of [
      [null, "missing"],
      [{ email: null, phone: "+919999999999", voided: true }, "voided"],
      [{ email: null, phone: null, voided: false }, "no_phone"],
    ] as const) {
      expect(
        await sendContributionReceiptWhatsApp(
          payload,
          dependencies({ loadTarget: async () => target })
        )
      ).toEqual({ outcome });
    }
    expect(sent).toEqual([]);
  });

  it("rechecks a void that happened before PDF rendering", async () => {
    const deps = dependencies();
    const rendered = await deps.renderPdf(payload.receiptId);
    expect(
      await sendContributionReceiptWhatsApp(
        payload,
        dependencies({
          renderPdf: async () => ({
            ...rendered!,
            document: { ...rendered!.document, voidedAt: new Date() },
          }),
        })
      )
    ).toEqual({ outcome: "voided" });
    expect(sent).toEqual([]);
  });

  it("preserves transport outcomes and lets transient errors retry", async () => {
    expect(
      await sendContributionReceiptWhatsApp(
        payload,
        dependencies({ send: async () => "duplicate" })
      )
    ).toEqual({ outcome: "duplicate" });
    expect(
      await sendContributionReceiptWhatsApp(
        payload,
        dependencies({ send: async () => "not_configured" })
      )
    ).toEqual({ outcome: "not_configured" });
    await expect(
      sendContributionReceiptWhatsApp(
        payload,
        dependencies({
          send: async () => {
            throw new Error("retry");
          },
        })
      )
    ).rejects.toThrow("retry");
  });
});
