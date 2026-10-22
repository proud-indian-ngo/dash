import { beforeEach, describe, expect, it, mock } from "bun:test";

class ReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptError";
  }
}

const RECEIPT = "0190a000-0000-7000-8000-000000000002";

const target = {
  contributionId: "c1",
  donorChanged: false,
  email: "donor@example.com" as string | null,
  phone: "+919999999999" as string | null,
  voided: false,
};
let loaded = { ...target };
let queued: { data: unknown; name: string }[] = [];
// Whether the receipt still waits for its automatic send.
let waiting = false;
let cancels: { waiting: boolean }[] = [];

mock.module("@pi-dash/db", () => ({
  db: { transaction: async (work: (tx: unknown) => unknown) => work({}) },
}));
mock.module("@pi-dash/db/queries/contribution-receipts", () => ({
  cancelAutomaticReceiptSend: async (
    _tx: unknown,
    _id: string,
    options: { waiting: boolean }
  ) => {
    cancels.push({ waiting: options.waiting });
    const wasWaiting = waiting;
    waiting = false;
    return !options.waiting || wasWaiting;
  },
  issueReceiptsIn: async () => ({ issued: [], skipped: [] }),
  loadLiveReceiptContacts: async () => ({}),
  loadReceiptCandidates: async () => ({}),
  loadReceiptConfig: async () => ({ settings: null }),
  loadReceiptDeliveryTarget: async () => loaded,
  loadReceiptReadiness: async () => ({}),
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
    waiting = false;
    cancels = [];
  });

  it("always queues an explicit email or WhatsApp, cancelling the automatic send", async () => {
    waiting = true;
    await queueReceiptEmail(RECEIPT);
    await queueReceiptWhatsApp(RECEIPT);
    expect(queued.map(({ name }) => name)).toEqual([
      "send-contribution-receipt",
      "send-contribution-receipt-whatsapp",
    ]);
    expect(cancels).toEqual([{ waiting: false }, { waiting: false }]);
    expect(waiting).toBe(false);
    // WhatsApp goes even though the donor has an email address, under its
    // own request, never the automatic one.
    expect(queued[1]?.data).toEqual({
      onlyWithoutEmail: false,
      receiptId: RECEIPT,
      requestId: expect.not.stringMatching(/^automatic$/),
    });
  });

  it("refuses WhatsApp for a donor without a phone, a voided receipt or a changed donor", async () => {
    loaded = { ...target, phone: null };
    await expect(queueReceiptWhatsApp(RECEIPT)).rejects.toThrow(
      "The donor has no phone number"
    );
    loaded = { ...target, voided: true };
    await expect(queueReceiptWhatsApp(RECEIPT)).rejects.toThrow("voided");
    loaded = { ...target, donorChanged: true };
    await expect(queueReceiptWhatsApp(RECEIPT)).rejects.toThrow(
      "Void the receipt and issue a new one"
    );
    await expect(queueReceiptEmail(RECEIPT)).rejects.toThrow(
      "Void the receipt and issue a new one"
    );
    expect(queued).toEqual([]);
  });

  it("sends a waiting receipt now by the automatic rule, once", async () => {
    waiting = true;
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
    // A second click (another tab) finds nothing waiting.
    await expect(queueReceiptNow(RECEIPT)).rejects.toThrow(
      "isn't waiting to be sent"
    );
    expect(queued).toHaveLength(2);
  });

  it("refuses Send now for a donor it can't reach", async () => {
    waiting = true;
    loaded = { ...target, email: null, phone: null };
    await expect(queueReceiptNow(RECEIPT)).rejects.toThrow(
      "no email address or phone number"
    );
    expect(queued).toEqual([]);
  });
});
