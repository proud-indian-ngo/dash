import { beforeEach, describe, expect, it, mock } from "bun:test";

class ReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptError";
  }
}

const RECEIPT = "0190a000-0000-7000-8000-000000000002";
const HOUR = 60 * 60 * 1000;

const target = {
  autoSendAt: null as Date | null,
  contributionId: "c1",
  delivered: false,
  email: "donor@example.com" as string | null,
  number: "PI/2026-27/0001",
  partyId: "p1",
  phone: "+919999999999" as string | null,
  voided: false,
};
let loaded = { ...target };
let queued: { data: unknown; name: string }[] = [];

mock.module("@pi-dash/db", () => ({
  db: { transaction: async (work: (tx: unknown) => unknown) => work({}) },
}));
mock.module("@pi-dash/db/queries/contribution-receipts", () => ({
  issueReceiptsIn: async () => ({ issued: [], skipped: [] }),
  loadLiveReceiptContacts: async () => ({}),
  loadReceiptCandidates: async () => ({}),
  loadReceiptConfig: async () => ({ settings: null }),
  loadReceiptEmailTarget: async () => loaded,
  loadReceiptReadiness: async () => ({}),
  loadReceiptWhatsAppTarget: async () => loaded,
  ReceiptError,
  voidReceiptIn: async () => ({}),
}));
mock.module("@pi-dash/db/queries/email-suppression", () => ({
  getEmailSuppression: async () => null,
}));
mock.module("@pi-dash/jobs/enqueue", () => ({
  enqueue: async (name: string, data: unknown) => {
    queued.push({ data, name });
    return "job-1";
  },
  inTransaction: () => ({}),
}));
mock.module("@pi-dash/jobs/lib/receipt-pdf", () => ({
  readReceiptSignature: async () => Buffer.from(""),
  ReceiptSignatureError: class extends Error {},
}));

const { queueReceiptEmail, queueReceiptNow, queueReceiptWhatsApp } =
  await import("./server");

describe("sending a receipt from finance", () => {
  beforeEach(() => {
    loaded = { ...target };
    queued = [];
  });

  it("always queues an explicit email or WhatsApp, even once delivered", async () => {
    loaded = { ...target, delivered: true };
    await queueReceiptEmail(RECEIPT);
    await queueReceiptWhatsApp(RECEIPT);
    expect(queued.map(({ name }) => name)).toEqual([
      "send-contribution-receipt",
      "send-contribution-receipt-whatsapp",
    ]);
    // WhatsApp goes even though the donor has an email address.
    // Each click is its own request, never the automatic one.
    expect(queued[1]?.data).toEqual({
      onlyWithoutEmail: false,
      receiptId: RECEIPT,
      requestId: expect.not.stringMatching(/^automatic$/),
    });
  });

  it("refuses WhatsApp for a donor without a phone, or a voided receipt", async () => {
    loaded = { ...target, phone: null };
    await expect(queueReceiptWhatsApp(RECEIPT)).rejects.toThrow(
      "The donor has no phone number"
    );
    loaded = { ...target, voided: true };
    await expect(queueReceiptWhatsApp(RECEIPT)).rejects.toThrow("voided");
    expect(queued).toEqual([]);
  });

  it("sends a waiting receipt now by the automatic rule", async () => {
    loaded = { ...target, autoSendAt: new Date(Date.now() + HOUR) };
    await queueReceiptNow(RECEIPT);
    expect(queued).toEqual([
      {
        data: { receiptId: RECEIPT, requestId: expect.any(String) },
        name: "send-contribution-receipt",
      },
      {
        data: {
          onlyWithoutEmail: true,
          receiptId: RECEIPT,
          requestId: expect.any(String),
        },
        name: "send-contribution-receipt-whatsapp",
      },
    ]);
  });

  it("refuses Send now for a receipt that isn't waiting or reaches no one", async () => {
    for (const receipt of [
      target,
      { ...target, autoSendAt: new Date(Date.now() - HOUR) },
      { ...target, autoSendAt: new Date(Date.now() + HOUR), delivered: true },
      { ...target, autoSendAt: new Date(Date.now() + HOUR), voided: true },
    ]) {
      loaded = receipt;
      await expect(queueReceiptNow(RECEIPT)).rejects.toThrow(
        "isn't waiting to be sent"
      );
    }
    loaded = {
      ...target,
      autoSendAt: new Date(Date.now() + HOUR),
      email: null,
      phone: null,
    };
    await expect(queueReceiptNow(RECEIPT)).rejects.toThrow(
      "no email address or phone number"
    );
    expect(queued).toEqual([]);
  });
});
