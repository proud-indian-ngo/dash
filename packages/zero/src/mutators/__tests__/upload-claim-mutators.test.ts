import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncTask, Context } from "../../context";
import { advancePaymentMutators } from "../advance-payment";
import { eventPhotoMutators } from "../event-photo";
import { reimbursementMutators } from "../reimbursement";
import { scheduledMessageMutators } from "../scheduled-message";
import { vendorPaymentMutators } from "../vendor-payment";
import { vendorPaymentTransactionMutators } from "../vendor-payment-transaction";

const copyR2Object = vi.fn();
const enqueue = vi.fn();

const serverContext = (permissions: string[] = []): Context => ({
  asyncTasks: [],
  beforeCommitTasks: [],
  copyR2Object,
  enqueue: enqueue as Context["enqueue"],
  permissions,
  r2KeyPrefix: "app",
  role: "volunteer",
  userId: "user-1",
});

const taskByMutator = (tasks: AsyncTask[], mutator: string) =>
  tasks.find((task) => task.meta.mutator === mutator);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("server mutator upload claims", () => {
  it("claims a reimbursement attachment under its request", async () => {
    const insertAttachment = vi.fn();
    const ctx = serverContext(["requests.create"]);
    const tx = {
      location: "server",
      mutate: {
        reimbursement: { insert: vi.fn() },
        reimbursementAttachment: { insert: insertAttachment },
        reimbursementHistory: { insert: vi.fn() },
        reimbursementLineItem: { insert: vi.fn() },
      },
      run: vi.fn().mockResolvedValue(undefined),
    };
    const sourceKey = "app/attachments/tmp/user-1/upload-id-receipt.pdf";

    await reimbursementMutators.create.fn({
      args: {
        attachments: [
          {
            filename: "receipt.pdf",
            id: "attachment-1",
            mimeType: "application/pdf",
            objectKey: sourceKey,
            type: "file",
          },
        ],
        expenseDate: 1,
        id: "request-1",
        lineItems: [],
        title: "Travel",
      },
      ctx,
      tx,
    } as never);

    expect(insertAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey:
          "app/attachments/reimbursements/request-1/upload-id-receipt.pdf",
        reimbursementId: "request-1",
      })
    );
  });

  it("claims a replacement approval screenshot for an advance payment", async () => {
    const update = vi.fn();
    const ctx = serverContext(["requests.approve"]);
    const tx = {
      location: "server",
      mutate: {
        advancePayment: { update },
        advancePaymentHistory: { insert: vi.fn() },
      },
      run: vi
        .fn()
        .mockResolvedValueOnce({ status: "pending", userId: "owner-1" })
        .mockResolvedValueOnce([]),
    };
    const sourceKey = "app/approval-screenshots/tmp/user-1/upload-id-proof.png";

    await advancePaymentMutators.approve.fn({
      args: { approvalScreenshotKey: sourceKey, id: "advance-1" },
      ctx,
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalScreenshotKey:
          "app/approval-screenshots/advance-payments/advance-1/approval-screenshots/upload-id-proof.png",
        id: "advance-1",
      })
    );
  });

  it("claims an advance-payment attachment under its request", async () => {
    const insertAttachment = vi.fn();
    const ctx = serverContext(["requests.create"]);
    const tx = {
      location: "server",
      mutate: {
        advancePayment: { insert: vi.fn() },
        advancePaymentAttachment: { insert: insertAttachment },
        advancePaymentHistory: { insert: vi.fn() },
        advancePaymentLineItem: { insert: vi.fn() },
      },
      run: vi.fn().mockResolvedValue(undefined),
    };
    const sourceKey = "app/attachments/tmp/user-1/upload-id-advance.pdf";

    await advancePaymentMutators.create.fn({
      args: {
        attachments: [
          {
            filename: "advance.pdf",
            id: "attachment-1",
            mimeType: "application/pdf",
            objectKey: sourceKey,
            type: "file",
          },
        ],
        id: "advance-1",
        lineItems: [],
        title: "Supplies",
      },
      ctx,
      tx,
    } as never);

    expect(insertAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        advancePaymentId: "advance-1",
        objectKey:
          "app/attachments/advance-payments/advance-1/upload-id-advance.pdf",
      })
    );
  });

  it("claims a vendor-payment quotation under its request", async () => {
    const insertAttachment = vi.fn();
    const ctx = serverContext(["requests.create"]);
    const tx = {
      location: "server",
      mutate: {
        vendorPayment: { insert: vi.fn() },
        vendorPaymentAttachment: { insert: insertAttachment },
        vendorPaymentHistory: { insert: vi.fn() },
        vendorPaymentLineItem: { insert: vi.fn() },
      },
      run: vi
        .fn()
        .mockResolvedValueOnce({ createdBy: "user-1", status: "approved" })
        .mockResolvedValueOnce(undefined),
    };
    const sourceKey = "app/attachments/tmp/user-1/upload-id-quote.pdf";

    await vendorPaymentMutators.create.fn({
      args: {
        attachments: [
          {
            filename: "quote.pdf",
            id: "attachment-1",
            mimeType: "application/pdf",
            objectKey: sourceKey,
            type: "file",
          },
        ],
        id: "vendor-payment-1",
        lineItems: [],
        title: "Venue",
        vendorId: "vendor-1",
      },
      ctx,
      tx,
    } as never);

    expect(insertAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey:
          "app/attachments/vendor-payments/vendor-payment-1/quotation/upload-id-quote.pdf",
        purpose: "quotation",
      })
    );
  });

  it("claims a vendor-payment invoice attachment under the invoice scope", async () => {
    const insertAttachment = vi.fn();
    const ctx = serverContext();
    const tx = {
      location: "server",
      mutate: {
        vendorPayment: { update: vi.fn() },
        vendorPaymentAttachment: {
          delete: vi.fn(),
          insert: insertAttachment,
        },
        vendorPaymentHistory: { insert: vi.fn() },
      },
      run: vi
        .fn()
        .mockResolvedValueOnce({
          status: "paid",
          title: "Venue",
          userId: "user-1",
        })
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(undefined),
    };
    const sourceKey = "app/attachments/tmp/user-1/upload-id-invoice.pdf";

    await vendorPaymentMutators.submitInvoice.fn({
      args: {
        attachments: [
          {
            filename: "invoice.pdf",
            id: "invoice-attachment-1",
            mimeType: "application/pdf",
            objectKey: sourceKey,
            type: "file",
          },
        ],
        id: "vendor-payment-1",
        invoiceDate: 1,
        invoiceNumber: "INV-1",
      },
      ctx,
      tx,
    } as never);

    expect(insertAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey:
          "app/attachments/vendor-payments/vendor-payment-1/invoice/upload-id-invoice.pdf",
        purpose: "invoice",
      })
    );
  });

  it("claims a vendor-payment transaction attachment", async () => {
    const insertAttachment = vi.fn();
    const ctx = serverContext(["requests.record_payment"]);
    const tx = {
      location: "server",
      mutate: {
        vendorPayment: { update: vi.fn() },
        vendorPaymentTransaction: { insert: vi.fn() },
        vendorPaymentTransactionAttachment: { insert: insertAttachment },
        vendorPaymentTransactionHistory: { insert: vi.fn() },
      },
      run: vi
        .fn()
        .mockResolvedValueOnce({
          status: "pending",
          title: "Venue",
          userId: "user-1",
        })
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ amount: 1000 }])
        .mockResolvedValueOnce(undefined),
    };
    const sourceKey = "app/attachments/tmp/user-1/upload-id-payment.pdf";

    await vendorPaymentTransactionMutators.create.fn({
      args: {
        amount: 100,
        attachments: [
          {
            filename: "payment.pdf",
            id: "transaction-attachment-1",
            mimeType: "application/pdf",
            objectKey: sourceKey,
            type: "file",
          },
        ],
        id: "transaction-1",
        transactionDate: 1,
        vendorPaymentId: "vendor-payment-1",
      },
      ctx,
      tx,
    } as never);

    expect(insertAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey:
          "app/attachments/vendor-payment-transactions/transaction-1/upload-id-payment.pdf",
        vendorPaymentTransactionId: "transaction-1",
      })
    );
  });

  it("preserves an existing approval screenshot when no replacement is supplied", async () => {
    const approvalScreenshotKey =
      "app/approval-screenshots/reimbursements/request-1/approval-screenshots/proof.png";
    const update = vi.fn();
    const ctx = serverContext(["requests.approve"]);
    const tx = {
      location: "server",
      mutate: {
        reimbursement: { update },
        reimbursementHistory: { insert: vi.fn() },
      },
      run: vi
        .fn()
        .mockResolvedValueOnce({
          approvalScreenshotKey,
          status: "pending",
          title: "Travel",
          userId: "owner-1",
        })
        .mockResolvedValueOnce([]),
    };

    await reimbursementMutators.approve.fn({
      args: { id: "request-1" },
      ctx,
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ approvalScreenshotKey, id: "request-1" })
    );
    expect(
      taskByMutator(
        ctx.asyncTasks ?? [],
        "reimbursement.approve:replaceApprovalScreenshot"
      )
    ).toBeUndefined();
  });

  it("claims scheduled-message attachments before persisting them", async () => {
    const insertMessage = vi.fn();
    const ctx = serverContext(["messages.schedule"]);
    const tx = {
      location: "server",
      mutate: {
        scheduledMessage: { insert: insertMessage },
        scheduledMessageRecipient: { insert: vi.fn() },
      },
      run: vi.fn(),
    };
    const sourceKey =
      "app/scheduled-messages/tmp/user-1/upload-id-voice-note.mp3";
    const targetKey =
      "app/scheduled-messages/message-1/upload-id-voice-note.mp3";

    await scheduledMessageMutators.create.fn({
      args: {
        attachments: [
          {
            fileName: "voice-note.mp3",
            mimeType: "audio/mpeg",
            r2Key: sourceKey,
          },
        ],
        id: "message-1",
        message: "Listen",
        recipients: [{ id: "group-1", label: "Group", type: "group" }],
        scheduledAt: Date.now() + 60_000,
      },
      ctx,
      tx,
    } as never);

    expect(insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          {
            fileName: "voice-note.mp3",
            mimeType: "audio/mpeg",
            r2Key: targetKey,
          },
        ],
      })
    );
    await ctx.beforeCommitTasks?.[0]?.fn();
    expect(copyR2Object).toHaveBeenCalledWith({
      mimeType: "audio/mpeg",
      sourceKey,
      targetKey,
    });
    await taskByMutator(
      ctx.asyncTasks ?? [],
      "cleanup-claimed-r2-source"
    )?.fn();
    expect(enqueue).toHaveBeenCalledWith(
      "delete-r2-object",
      { deleteIfUnreferenced: false, r2Key: sourceKey },
      { traceId: undefined }
    );
  });

  it("claims an event photo under its event before inserting the row", async () => {
    const insertPhoto = vi.fn();
    const ctx = serverContext();
    const tx = {
      location: "server",
      mutate: { eventPhoto: { insert: insertPhoto } },
      run: vi
        .fn()
        .mockResolvedValueOnce({
          name: "Cleanup",
          startTime: 1,
          teamId: "team-1",
        })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ id: "member-1" }),
    };
    const sourceKey = "app/photos/tmp/user-1/upload-id-photo.jpg";
    const targetKey = "app/photos/event-1/upload-id-photo.jpg";

    await eventPhotoMutators.upload.fn({
      args: {
        eventId: "event-1",
        id: "photo-1",
        mimeType: "image/jpeg",
        now: 2,
        r2Key: sourceKey,
      },
      ctx,
      tx,
    } as never);

    expect(insertPhoto).toHaveBeenCalledWith(
      expect.objectContaining({ r2Key: targetKey, status: "pending" })
    );
    await ctx.beforeCommitTasks?.[0]?.fn();
    expect(copyR2Object).toHaveBeenCalledWith({
      mimeType: "image/jpeg",
      sourceKey,
      targetKey,
    });
  });

  it("does not delete an event-photo key outside the owning event", async () => {
    const ctx = serverContext();
    const tx = {
      location: "server",
      mutate: { eventPhoto: { delete: vi.fn() } },
      run: vi
        .fn()
        .mockResolvedValueOnce({
          eventId: "event-1",
          r2Key: "app/photos/other-event/photo.jpg",
          status: "pending",
          uploadedBy: "user-1",
        })
        .mockResolvedValueOnce({ name: "Cleanup", teamId: "team-1" }),
    };

    await eventPhotoMutators.delete.fn({
      args: { id: "photo-1" },
      ctx,
      tx,
    } as never);

    expect(
      taskByMutator(ctx.asyncTasks ?? [], "deleteEventPhoto")
    ).toBeUndefined();
  });

  it("clears a rejected event photo key before queueing durable cleanup", async () => {
    const update = vi.fn();
    const ctx = serverContext(["events.manage_photos"]);
    const tx = {
      location: "server",
      mutate: { eventPhoto: { update } },
      run: vi
        .fn()
        .mockResolvedValueOnce({
          eventId: "event-1",
          r2Key: "app/photos/event-1/photo.jpg",
          status: "pending",
          uploadedBy: "user-1",
        })
        .mockResolvedValueOnce({ name: "Cleanup", teamId: "team-1" })
        .mockResolvedValueOnce(undefined),
    };

    await eventPhotoMutators.reject.fn({
      args: { id: "photo-1", now: 3 },
      ctx,
      tx,
    } as never);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "photo-1", r2Key: null })
    );
    await taskByMutator(ctx.asyncTasks ?? [], "rejectEventPhoto")?.fn();
    expect(enqueue).toHaveBeenCalledWith(
      "delete-r2-object",
      {
        deleteIfUnreferenced: true,
        r2Key: "app/photos/event-1/photo.jpg",
      },
      { startAfter: "30 seconds", traceId: undefined }
    );
  });
});
