import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/db/queries/contribution-receipts", () => ({
  loadReceiptDeliveryTarget: async () => null,
  markReceiptWhatsAppSent: async () => undefined,
  recordReceiptDeliveryFailure: async () => undefined,
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

const { sendContributionReceiptWhatsApp } =
  await import("./send-contribution-receipt-whatsapp");
type Deps = NonNullable<Parameters<typeof sendContributionReceiptWhatsApp>[1]>;
const payload = { receiptId: "receipt-1", requestId: "q1" };
const sent: unknown[][] = [];
const marked: string[] = [];
const failures: string[] = [];
const target = {
  contributionId: "c1",
  delivered: false,
  donorChanged: false,
  email: null,
  phone: "+919999999999",
  voided: false,
};

function dependencies(overrides: Partial<Deps> = {}): Deps {
  return {
    loadTarget: async () => target,
    markSent: async (id) => {
      marked.push(id);
    },
    recordFailure: async (_id, failure) => {
      failures.push(failure);
    },
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
    loggedStatus: async () => null,
    templateReady: async () => true,
    ...overrides,
  };
}

describe("finance's WhatsApp send", () => {
  beforeEach(() => {
    sent.length = 0;
    marked.length = 0;
    failures.length = 0;
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
      { idempotencyKey: "receipt-whatsapp-receipt-1-q1" },
    ]);
    expect(marked).toEqual(["receipt-1"]);
  });

  it("skips missing receipts, voided receipts and donors without a phone", async () => {
    for (const [loaded, outcome] of [
      [null, "missing"],
      [{ ...target, voided: true }, "voided"],
      [{ ...target, phone: null }, "no_phone"],
    ] as const) {
      expect(
        await sendContributionReceiptWhatsApp(
          payload,
          dependencies({ loadTarget: async () => loaded })
        )
      ).toEqual({ outcome });
    }
    expect(sent).toEqual([]);
    expect(failures).toEqual(["no_phone"]);
  });

  it("refuses and records a receipt whose gift changed donor", async () => {
    expect(
      await sendContributionReceiptWhatsApp(
        payload,
        dependencies({
          loadTarget: async () => ({ ...target, donorChanged: true }),
        })
      )
    ).toEqual({ outcome: "donor_changed" });
    expect(sent).toEqual([]);
    expect(failures).toEqual(["donor_changed"]);
  });

  it("settles a reused key by how its first send fared", async () => {
    const duplicate = (status: "sent" | "failed" | "sending" | null) =>
      sendContributionReceiptWhatsApp(
        payload,
        dependencies({
          loggedStatus: async (key) => {
            expect(key).toBe("receipt-whatsapp-receipt-1-q1");
            return status;
          },
          send: async () => "duplicate",
        })
      );
    expect(await duplicate("sent")).toEqual({ outcome: "already_sent" });
    expect(marked).toEqual(["receipt-1"]);
    // Meta refused it: stays refused, shown as such, not silently dropped.
    expect(await duplicate("failed")).toEqual({ outcome: "already_rejected" });
    expect(failures).toEqual(["whatsapp_rejected"]);
    // Still sending elsewhere: nothing to record yet.
    expect(await duplicate("sending")).toEqual({ outcome: "duplicate" });
    expect(marked).toEqual(["receipt-1"]);
    expect(failures).toEqual(["whatsapp_rejected"]);
  });

  it("sends finance's explicit WhatsApp even when the donor has email", async () => {
    expect(
      await sendContributionReceiptWhatsApp(
        payload,
        dependencies({
          loadTarget: async () => ({
            ...target,
            email: "donor@example.com",
          }),
        })
      )
    ).toEqual({ outcome: "sent" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.[2]).toEqual({
      idempotencyKey: "receipt-whatsapp-receipt-1-q1",
    });
  });

  it("reports an unapproved template as not sent, without uploading the PDF", async () => {
    const renderPdf = mock(async () => null);
    expect(
      await sendContributionReceiptWhatsApp(
        payload,
        dependencies({ renderPdf, templateReady: async () => false })
      )
    ).toEqual({ outcome: "no_template" });
    expect(renderPdf).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
    expect(failures).toEqual(["whatsapp_no_template"]);
  });

  it("rechecks a void that happened before PDF retrieval", async () => {
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

  it("skips a receipt that disappears before PDF retrieval", async () => {
    expect(
      await sendContributionReceiptWhatsApp(
        payload,
        dependencies({ renderPdf: async () => null })
      )
    ).toEqual({ outcome: "missing" });
    expect(sent).toEqual([]);
  });

  it("preserves transport outcomes, records the ones that left it unsent, and lets transient errors retry", async () => {
    for (const outcome of [
      "duplicate",
      "no_template",
      "not_configured",
      "rejected",
    ] as const) {
      expect(
        await sendContributionReceiptWhatsApp(
          payload,
          dependencies({ send: async () => outcome })
        )
      ).toEqual({ outcome });
    }
    expect(failures).toEqual([
      "whatsapp_no_template",
      "whatsapp_not_configured",
      "whatsapp_rejected",
    ]);
    expect(marked).toEqual([]);
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
    expect(failures.at(-1)).toBe("whatsapp_failed");
  });
});
