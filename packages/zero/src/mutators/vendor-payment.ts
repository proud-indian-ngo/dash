import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertHasPermission, assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import {
  mutatorAttachmentSchema as attachmentSchema,
  mutatorLineItemSchema as lineItemSchema,
} from "../shared-schemas";
import {
  INVOICE_LOCKED_STATUSES,
  INVOICE_UPLOADABLE_STATUSES,
} from "../vendor-payment-constants";
import {
  assertCanDelete,
  assertCanModify,
  assertEntityExists,
  assertPending,
  assertVendorUsable,
  buildAttachmentInsert,
  buildHistoryInsert,
  deleteAllRelations,
  insertRelations,
  replaceRelations,
} from "./submission-helpers";
import { recalculateParentStatus } from "./vendor-payment-transaction";

const createSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  title: z.string().min(1),
  eventId: z.string().optional(),
  lineItems: z.array(lineItemSchema),
  attachments: z.array(attachmentSchema),
});

export const vendorPaymentMutators = {
  create: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const userId = ctx.userId;

    const vendor = await tx.run(zql.vendor.where("id", args.vendorId).one());
    if (!vendor) {
      throw new Error("Vendor not found");
    }
    assertVendorUsable(vendor, userId);

    const now = Date.now();
    const vpFk = { vendorPaymentId: args.id };

    await tx.mutate.vendorPayment.insert({
      id: args.id,
      userId,
      vendorId: args.vendorId,
      title: args.title,
      eventId: args.eventId ?? null,
      invoiceNumber: null,
      invoiceDate: null,
      status: "pending",
      rejectionReason: null,
      approvalScreenshotKey: null,
      reviewedBy: null,
      reviewedAt: null,
      invoiceReviewedBy: null,
      invoiceReviewedAt: null,
      invoiceRejectionReason: null,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await insertRelations(
      vpFk,
      args.lineItems,
      args.attachments,
      userId,
      "created",
      now,
      {
        insertLineItem: (data) => tx.mutate.vendorPaymentLineItem.insert(data),
        insertAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.insert({
            ...data,
            purpose: "quotation",
          }),
        insertHistory: (data) => tx.mutate.vendorPaymentHistory.insert(data),
      }
    );

    if (tx.location === "server") {
      const vendorPaymentId = args.id;
      const title = args.title;
      const submitter = await tx.run(zql.user.where("id", userId).one());
      const submitterName = submitter?.name ?? "Unknown";
      ctx.asyncTasks?.push({
        meta: {
          mutator: "createVendorPayment",
          userId,
          vendorPaymentId,
          title,
        },
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs/enqueue");
          await enqueue("notify-vendor-payment-submitted", {
            vendorPaymentId,
            title,
            submitterName,
          });
        },
      });
    }
  }),

  update: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const userId = ctx.userId;
    const hasEditAll = can(ctx, "requests.edit_all");
    const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
    assertEntityExists(entity, "Vendor payment");
    if (!hasEditAll) {
      assertCanModify(entity, userId, false, "vendor payment");
    } else if (INVOICE_LOCKED_STATUSES.has(entity.status as string)) {
      throw new Error(
        "Cannot edit vendor payment details while invoice is pending or completed"
      );
    }

    const vendor = await tx.run(zql.vendor.where("id", args.vendorId).one());
    if (!vendor) {
      throw new Error("Vendor not found");
    }
    assertVendorUsable(vendor, userId);

    const now = Date.now();
    const vpFk = { vendorPaymentId: args.id };

    await tx.mutate.vendorPayment.update({
      id: args.id,
      vendorId: args.vendorId,
      title: args.title,
      eventId: args.eventId ?? null,
      updatedAt: now,
    });

    await replaceRelations(
      vpFk,
      args.lineItems,
      args.attachments,
      userId,
      now,
      {
        insertLineItem: (data) => tx.mutate.vendorPaymentLineItem.insert(data),
        insertAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.insert({
            ...data,
            purpose: "quotation",
          }),
        insertHistory: (data) => tx.mutate.vendorPaymentHistory.insert(data),
        queryLineItems: () =>
          tx.run(zql.vendorPaymentLineItem.where("vendorPaymentId", args.id)),
        queryAttachments: () =>
          tx.run(
            zql.vendorPaymentAttachment
              .where("vendorPaymentId", args.id)
              .where("purpose", "quotation")
          ),
        deleteLineItem: (data) => tx.mutate.vendorPaymentLineItem.delete(data),
        deleteAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.delete(data),
      }
    );

    // Recalculate payment status when admin edits line items on a non-pending VP
    if (hasEditAll && entity.status !== "pending") {
      await recalculateParentStatus(tx, args.id, now);
    }
  }),

  approve: defineMutator(
    z.object({
      id: z.string(),
      note: z.string().optional(),
      approvalScreenshotKey: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const userId = ctx.userId;
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertPending(entity, "vendor payment", "approved");

      const now = Date.now();

      await tx.mutate.vendorPayment.update({
        id: args.id,
        status: "approved",
        approvalScreenshotKey: args.approvalScreenshotKey ?? null,
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });

      // Auto-approve the linked vendor if it's still pending
      const vendor = await tx.run(
        zql.vendor.where("id", entity.vendorId).one()
      );
      const vendorWasPending = vendor && vendor.status === "pending";
      if (vendorWasPending) {
        await tx.mutate.vendor.update({
          id: vendor.id,
          status: "approved",
          updatedAt: now,
        });
      }

      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "approved", now, args.note),
        vendorPaymentId: args.id,
      });

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const id = args.id;
        const note = args.note;
        const approvalScreenshotKey = args.approvalScreenshotKey;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "approveVendorPayment",
            vendorPaymentId: id,
            title,
            submitterId: ownerId,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue("notify-vendor-payment-approved", {
              vendorPaymentId: id,
              title,
              submitterId: ownerId,
              note,
              approvalScreenshotKey,
            });
          },
        });

        // Notify vendor creator if vendor was auto-approved
        if (vendorWasPending && vendor) {
          const vendorId = vendor.id;
          const vendorName = vendor.name;
          const vendorCreatorId = vendor.createdBy as string;
          const vpTitle = title;
          ctx.asyncTasks?.push({
            meta: {
              mutator: "approveVendorPayment:autoApproveVendor",
              vendorId,
              vendorCreatorId,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue("notify-vendor-auto-approved", {
                vendorId,
                vendorName,
                creatorId: vendorCreatorId,
                vendorPaymentTitle: vpTitle,
              });
            },
          });
        }
      }
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const userId = ctx.userId;
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertCanDelete(entity, userId, can(ctx, "requests.delete_all"));

      await deleteAllRelations({
        queryLineItems: () =>
          tx.run(zql.vendorPaymentLineItem.where("vendorPaymentId", args.id)),
        queryAttachments: () =>
          tx.run(zql.vendorPaymentAttachment.where("vendorPaymentId", args.id)),
        queryHistory: () =>
          tx.run(zql.vendorPaymentHistory.where("vendorPaymentId", args.id)),
        deleteLineItem: (data) => tx.mutate.vendorPaymentLineItem.delete(data),
        deleteAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.delete(data),
        deleteHistory: (data) => tx.mutate.vendorPaymentHistory.delete(data),
      });

      await tx.mutate.vendorPayment.delete({ id: args.id });
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const userId = ctx.userId;
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertPending(entity, "vendor payment", "rejected");

      const now = Date.now();

      await tx.mutate.vendorPayment.update({
        id: args.id,
        status: "rejected",
        rejectionReason: args.reason,
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });

      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "rejected", now, args.reason),
        vendorPaymentId: args.id,
      });

      // Cascade reject all pending transactions
      const pendingTransactions = await tx.run(
        zql.vendorPaymentTransaction
          .where("vendorPaymentId", args.id)
          .where("status", "pending")
      );
      for (const txn of pendingTransactions) {
        await tx.mutate.vendorPaymentTransaction.update({
          id: txn.id,
          status: "rejected",
          rejectionReason: "Parent vendor payment was rejected",
          reviewedBy: userId,
          reviewedAt: now,
          updatedAt: now,
        });
        await tx.mutate.vendorPaymentTransactionHistory.insert({
          ...buildHistoryInsert(
            userId,
            "rejected",
            now,
            "Parent vendor payment was rejected"
          ),
          vendorPaymentTransactionId: txn.id,
        });
      }

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const id = args.id;
        const reason = args.reason;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "rejectVendorPayment",
            vendorPaymentId: id,
            title,
            submitterId: ownerId,
            reason,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue("notify-vendor-payment-rejected", {
              vendorPaymentId: id,
              title,
              submitterId: ownerId,
              reason,
            });
          },
        });

        // Notify about cascade-rejected transactions
        if (pendingTransactions.length > 0) {
          const cascadeCount = pendingTransactions.length;
          ctx.asyncTasks?.push({
            meta: {
              mutator: "rejectVendorPayment:cascadeReject",
              vendorPaymentId: id,
              cascadeCount,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue("notify-vpt-cascade-rejected", {
                vendorPaymentId: id,
                title,
                submitterId: ownerId,
                transactionCount: cascadeCount,
                rejectionReason: reason,
              });
            },
          });
        }
      }
    }
  ),

  submitInvoice: defineMutator(
    z.object({
      id: z.string(),
      invoiceNumber: z.string().min(1),
      invoiceDate: z.number(),
      attachments: z.array(attachmentSchema).min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const userId = ctx.userId;
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");

      const isOwner = entity.userId === userId;
      const isAdmin = can(ctx, "requests.approve");
      if (!(isOwner || isAdmin)) {
        throw new Error("Unauthorized");
      }
      if (!INVOICE_UPLOADABLE_STATUSES.has(entity.status as string)) {
        throw new Error(
          "Invoice can only be uploaded when the payment status is 'paid'"
        );
      }

      const now = Date.now();

      await tx.mutate.vendorPayment.update({
        id: args.id,
        invoiceNumber: args.invoiceNumber,
        invoiceDate: args.invoiceDate,
        invoiceRejectionReason: null,
        status: "invoice_pending",
        updatedAt: now,
      });

      // Remove any existing invoice attachments before inserting new ones
      const existingInvoiceAtts = await tx.run(
        zql.vendorPaymentAttachment
          .where("vendorPaymentId", args.id)
          .where("purpose", "invoice")
      );
      for (const att of existingInvoiceAtts) {
        await tx.mutate.vendorPaymentAttachment.delete({ id: att.id });
      }

      for (const att of args.attachments) {
        await tx.mutate.vendorPaymentAttachment.insert({
          ...buildAttachmentInsert(att, now),
          purpose: "invoice",
          vendorPaymentId: args.id,
        });
      }

      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "invoice_submitted", now),
        vendorPaymentId: args.id,
      });

      if (tx.location === "server") {
        const vpId = args.id;
        const vpTitle = entity.title as string;
        const ts = now;
        const submitter = await tx.run(zql.user.where("id", userId).one());
        const submitterName = submitter?.name ?? "Unknown";
        ctx.asyncTasks?.push({
          meta: {
            mutator: "submitVendorPaymentInvoice",
            vendorPaymentId: vpId,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue("notify-vp-invoice-submitted", {
              vendorPaymentId: vpId,
              vendorPaymentTitle: vpTitle,
              submitterName,
              timestamp: ts,
            });
          },
        });
      }
    }
  ),

  updateInvoice: defineMutator(
    z.object({
      id: z.string(),
      invoiceNumber: z.string().min(1),
      invoiceDate: z.number(),
      attachments: z.array(attachmentSchema).min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const userId = ctx.userId;
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");

      const isOwner = entity.userId === userId;
      const canEditAll = can(ctx, "requests.edit_all");
      if (!(isOwner || canEditAll)) {
        throw new Error("Unauthorized");
      }

      const status = entity.status as string;
      const invoiceEditableStatuses = canEditAll
        ? new Set(["paid", "invoice_pending", "completed"])
        : new Set(["paid", "invoice_pending"]);
      if (!invoiceEditableStatuses.has(status)) {
        throw new Error(
          "Invoice can only be edited in paid, invoice_pending, or completed status"
        );
      }

      const now = Date.now();

      // Admin editing a completed invoice keeps the status;
      // non-admin or non-completed resets to invoice_pending for re-approval
      const newStatus =
        canEditAll && status === "completed" ? "completed" : "invoice_pending";

      await tx.mutate.vendorPayment.update({
        id: args.id,
        invoiceNumber: args.invoiceNumber,
        invoiceDate: args.invoiceDate,
        invoiceRejectionReason: null,
        status: newStatus,
        updatedAt: now,
      });

      // Replace invoice attachments
      const existingAtts = await tx.run(
        zql.vendorPaymentAttachment
          .where("vendorPaymentId", args.id)
          .where("purpose", "invoice")
      );
      for (const att of existingAtts) {
        await tx.mutate.vendorPaymentAttachment.delete({ id: att.id });
      }
      for (const att of args.attachments) {
        await tx.mutate.vendorPaymentAttachment.insert({
          ...buildAttachmentInsert(att, now),
          purpose: "invoice",
          vendorPaymentId: args.id,
        });
      }

      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "invoice_updated", now),
        vendorPaymentId: args.id,
      });
    }
  ),

  approveInvoice: defineMutator(
    z.object({
      id: z.string(),
      note: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const userId = ctx.userId;
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");

      if (entity.status !== "invoice_pending") {
        throw new Error(
          "Can only approve invoice when status is invoice_pending"
        );
      }

      const now = Date.now();

      await tx.mutate.vendorPayment.update({
        id: args.id,
        status: "completed",
        invoiceReviewedBy: userId,
        invoiceReviewedAt: now,
        updatedAt: now,
      });

      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "invoice_approved", now, args.note),
        vendorPaymentId: args.id,
      });

      if (tx.location === "server") {
        const vpId = args.id;
        const vpTitle = entity.title as string;
        const submitterId = entity.userId as string;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "approveVendorPaymentInvoice",
            vendorPaymentId: vpId,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue("notify-vp-invoice-approved", {
              vendorPaymentId: vpId,
              vendorPaymentTitle: vpTitle,
              submitterId,
              note: args.note,
            });
          },
        });
      }
    }
  ),

  rejectInvoice: defineMutator(
    z.object({
      id: z.string(),
      reason: z.string().trim().min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const userId = ctx.userId;
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");

      if (entity.status !== "invoice_pending") {
        throw new Error(
          "Can only reject invoice when status is invoice_pending"
        );
      }

      const now = Date.now();

      await tx.mutate.vendorPayment.update({
        id: args.id,
        status: "paid",
        invoiceRejectionReason: args.reason,
        updatedAt: now,
      });

      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "invoice_rejected", now, args.reason),
        vendorPaymentId: args.id,
      });

      if (tx.location === "server") {
        const vpId = args.id;
        const vpTitle = entity.title as string;
        const submitterId = entity.userId as string;
        const ts = now;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "rejectVendorPaymentInvoice",
            vendorPaymentId: vpId,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue("notify-vp-invoice-rejected", {
              vendorPaymentId: vpId,
              vendorPaymentTitle: vpTitle,
              submitterId,
              reason: args.reason,
              timestamp: ts,
            });
          },
        });
      }
    }
  ),
};
