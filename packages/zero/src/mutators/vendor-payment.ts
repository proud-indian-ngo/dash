import { cityValues } from "@pi-dash/shared/constants";
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
  buildClaimedAttachmentInsert,
  buildHistoryInsert,
  claimUploadedR2ObjectKey,
  createR2ClaimOptions,
  deleteAllRelations,
  enqueueDeleteR2Object,
  insertRelations,
  replaceRelations,
} from "./submission-helpers";
import { recalculateParentStatus } from "./vendor-payment-transaction";

const createSchema = z.object({
  attachments: z.array(attachmentSchema),
  city: z.enum(cityValues).optional(),
  eventId: z.string().optional(),
  id: z.string(),
  lineItems: z.array(lineItemSchema),
  title: z.string().min(1),
  vendorId: z.string(),
});

export const vendorPaymentMutators = {
  approve: defineMutator(
    z.object({
      approvalScreenshotKey: z.string().optional(),
      id: z.string(),
      note: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;
      const canEditAnyStatus = can(ctx, "requests.edit_all_statuses");
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertPending(entity, "vendor payment", "approved", canEditAnyStatus);

      const now = Date.now();
      const approvalScreenshotKey = args.approvalScreenshotKey
        ? claimUploadedR2ObjectKey(
            args.approvalScreenshotKey,
            createR2ClaimOptions(ctx, tx.location, {
              durablePrefix: `vendor-payments/${args.id}/approval-screenshots`,
              subfolder: "approval-screenshots",
            })
          )
        : undefined;

      if (
        entity.approvalScreenshotKey &&
        entity.approvalScreenshotKey !== approvalScreenshotKey
      ) {
        enqueueDeleteR2Object(ctx, tx.location, entity.approvalScreenshotKey, {
          mutator: "vendorPayment.approve:replaceApprovalScreenshot",
          vendorPaymentId: args.id,
        });
      }

      await tx.mutate.vendorPayment.update({
        approvalScreenshotKey,
        id: args.id,
        rejectionReason: null,
        reviewedAt: now,
        reviewedBy: userId,
        status: "approved",
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
        const { id } = args;
        const { note } = args;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-vendor-payment-approved",
              {
                note,
                submitterId: ownerId,
                title,
                vendorPaymentId: id,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            mutator: "approveVendorPayment",
            submitterId: ownerId,
            title,
            vendorPaymentId: id,
          },
        });

        // Notify vendor creator if vendor was auto-approved
        if (vendorWasPending && vendor) {
          const vendorId = vendor.id;
          const vendorName = vendor.name;
          const vendorCreatorId = vendor.createdBy as string;
          const vpTitle = title;
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-vendor-auto-approved",
                {
                  creatorId: vendorCreatorId,
                  vendorId,
                  vendorName,
                  vendorPaymentTitle: vpTitle,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              mutator: "approveVendorPayment:autoApproveVendor",
              vendorCreatorId,
              vendorId,
            },
          });
        }
      }
    }
  ),

  approveInvoice: defineMutator(
    z.object({
      id: z.string(),
      note: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;
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
        invoiceReviewedAt: now,
        invoiceReviewedBy: userId,
        status: "completed",
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
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-vp-invoice-approved",
              {
                note: args.note,
                submitterId,
                vendorPaymentId: vpId,
                vendorPaymentTitle: vpTitle,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            mutator: "approveVendorPaymentInvoice",
            vendorPaymentId: vpId,
          },
        });
      }
    }
  ),
  create: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    assertHasPermission(ctx, "requests.create");
    const { userId } = ctx;

    const vendor = await tx.run(zql.vendor.where("id", args.vendorId).one());
    if (!vendor) {
      throw new Error("Vendor not found");
    }
    assertVendorUsable(vendor, userId);

    const now = Date.now();
    const vpFk = { vendorPaymentId: args.id };

    await tx.mutate.vendorPayment.insert({
      approvalScreenshotKey: null,
      city: args.city,
      createdAt: now,
      eventId: args.eventId,
      id: args.id,
      invoiceDate: null,
      invoiceNumber: null,
      invoiceRejectionReason: null,
      invoiceReviewedAt: null,
      invoiceReviewedBy: null,
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      status: "pending",
      submittedAt: now,
      title: args.title,
      updatedAt: now,
      userId,
      vendorId: args.vendorId,
    });

    await insertRelations(
      vpFk,
      args.lineItems,
      args.attachments,
      userId,
      "created",
      now,
      {
        insertAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.insert({
            ...data,
            purpose: "quotation",
          }),
        insertHistory: (data) => tx.mutate.vendorPaymentHistory.insert(data),
        insertLineItem: (data) => tx.mutate.vendorPaymentLineItem.insert(data),
      },
      createR2ClaimOptions(ctx, tx.location, {
        durablePrefix: `vendor-payments/${args.id}/quotation`,
        subfolder: "attachments",
      })
    );

    if (tx.location === "server") {
      const vendorPaymentId = args.id;
      const { title } = args;
      const submitter = await tx.run(zql.user.where("id", userId).one());
      const submitterName = submitter?.name;
      ctx.asyncTasks?.push({
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs/enqueue");
          await enqueue(
            "notify-vendor-payment-submitted",
            {
              submitterName: submitterName ?? "Someone",
              title,
              vendorPaymentId,
            },
            { traceId: ctx.traceId }
          );
        },
        meta: {
          mutator: "createVendorPayment",
          title,
          userId,
          vendorPaymentId,
        },
      });
    }
  }),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const { userId } = ctx;
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertCanDelete(entity, userId, can(ctx, "requests.delete_all"));
      enqueueDeleteR2Object(ctx, tx.location, entity.approvalScreenshotKey, {
        mutator: "vendorPayment.delete:approvalScreenshot",
        vendorPaymentId: args.id,
      });

      await deleteAllRelations({
        deleteAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.delete(data),
        deleteHistory: (data) => tx.mutate.vendorPaymentHistory.delete(data),
        deleteLineItem: (data) => tx.mutate.vendorPaymentLineItem.delete(data),
        onDeleteAttachmentObjectKey: (key) =>
          enqueueDeleteR2Object(ctx, tx.location, key, {
            mutator: "vendorPayment.delete",
            vendorPaymentId: args.id,
          }),
        queryAttachments: () =>
          tx.run(zql.vendorPaymentAttachment.where("vendorPaymentId", args.id)),
        queryHistory: () =>
          tx.run(zql.vendorPaymentHistory.where("vendorPaymentId", args.id)),
        queryLineItems: () =>
          tx.run(zql.vendorPaymentLineItem.where("vendorPaymentId", args.id)),
      });

      await tx.mutate.vendorPayment.delete({ id: args.id });
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;
      const canEditAnyStatus = can(ctx, "requests.edit_all_statuses");
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertPending(entity, "vendor payment", "rejected", canEditAnyStatus);

      const now = Date.now();
      await tx.mutate.vendorPayment.update({
        id: args.id,
        rejectionReason: args.reason,
        reviewedAt: now,
        reviewedBy: userId,
        status: "rejected",
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
      await Promise.all(
        pendingTransactions.map(async (txn) => {
          await tx.mutate.vendorPaymentTransaction.update({
            id: txn.id,
            rejectionReason: "Parent vendor payment was rejected",
            reviewedAt: now,
            reviewedBy: userId,
            status: "rejected",
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
        })
      );

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const { id } = args;
        const { reason } = args;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-vendor-payment-rejected",
              {
                reason,
                submitterId: ownerId,
                title,
                vendorPaymentId: id,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            mutator: "rejectVendorPayment",
            reason,
            submitterId: ownerId,
            title,
            vendorPaymentId: id,
          },
        });

        // Notify about cascade-rejected transactions
        if (pendingTransactions.length > 0) {
          const cascadeCount = pendingTransactions.length;
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-vpt-cascade-rejected",
                {
                  rejectionReason: reason,
                  submitterId: ownerId,
                  title,
                  transactionCount: cascadeCount,
                  vendorPaymentId: id,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              cascadeCount,
              mutator: "rejectVendorPayment:cascadeReject",
              vendorPaymentId: id,
            },
          });
        }
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
      const { userId } = ctx;
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
        invoiceRejectionReason: args.reason,
        status: "paid",
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
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-vp-invoice-rejected",
              {
                reason: args.reason,
                submitterId,
                timestamp: ts,
                vendorPaymentId: vpId,
                vendorPaymentTitle: vpTitle,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            mutator: "rejectVendorPaymentInvoice",
            vendorPaymentId: vpId,
          },
        });
      }
    }
  ),

  resetToPending: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.edit_all_statuses");
      const { userId } = ctx;
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");

      if (entity.status === "pending") {
        throw new Error("Vendor payment is already pending");
      }

      const transactions = await tx.run(
        zql.vendorPaymentTransaction.where("vendorPaymentId", args.id)
      );
      if (transactions.length > 0) {
        throw new Error(
          "Cannot reset vendor payment to pending after payments exist"
        );
      }

      const invoiceAttachments = await tx.run(
        zql.vendorPaymentAttachment
          .where("vendorPaymentId", args.id)
          .where("purpose", "invoice")
      );
      if (
        entity.invoiceNumber ||
        entity.invoiceDate ||
        invoiceAttachments.length > 0
      ) {
        throw new Error(
          "Cannot reset vendor payment to pending after invoice data exists"
        );
      }

      const now = Date.now();
      enqueueDeleteR2Object(ctx, tx.location, entity.approvalScreenshotKey, {
        mutator: "vendorPayment.resetToPending",
        vendorPaymentId: args.id,
      });

      await tx.mutate.vendorPayment.update({
        approvalScreenshotKey: null,
        id: args.id,
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        status: "pending",
        updatedAt: now,
      });

      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "submitted", now, "Reset to pending"),
        vendorPaymentId: args.id,
      });
    }
  ),

  submitInvoice: defineMutator(
    z.object({
      attachments: z.array(attachmentSchema).min(1),
      id: z.string(),
      invoiceDate: z.number(),
      invoiceNumber: z.string().min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const { userId } = ctx;
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
        invoiceDate: args.invoiceDate,
        invoiceNumber: args.invoiceNumber,
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
      const existingInvoiceObjectKeys = new Set(
        existingInvoiceAtts
          .map((attachment) => attachment.objectKey)
          .filter((key): key is string => Boolean(key))
      );
      const retainedInvoiceObjectKeys = new Set(
        args.attachments
          .filter((attachment) => attachment.type === "file")
          .map((attachment) => attachment.objectKey)
      );
      await Promise.all(
        existingInvoiceAtts.map(async (att) => {
          if (att.objectKey && !retainedInvoiceObjectKeys.has(att.objectKey)) {
            enqueueDeleteR2Object(ctx, tx.location, att.objectKey, {
              mutator: "vendorPayment.submitInvoice",
              vendorPaymentId: args.id,
            });
          }
          await tx.mutate.vendorPaymentAttachment.delete({ id: att.id });
        })
      );

      await Promise.all(
        args.attachments.map(async (att) => {
          await tx.mutate.vendorPaymentAttachment.insert({
            ...buildClaimedAttachmentInsert(
              att,
              now,
              createR2ClaimOptions(ctx, tx.location, {
                durablePrefix: `vendor-payments/${args.id}/invoice`,
                existingObjectKeys: existingInvoiceObjectKeys,
                subfolder: "attachments",
              })
            ),
            purpose: "invoice",
            vendorPaymentId: args.id,
          });
        })
      );

      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "invoice_submitted", now),
        vendorPaymentId: args.id,
      });

      if (tx.location === "server") {
        const vpId = args.id;
        const vpTitle = entity.title as string;
        const ts = now;
        const submitter = await tx.run(zql.user.where("id", userId).one());
        const submitterName = submitter?.name;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-vp-invoice-submitted",
              {
                submitterName: submitterName ?? "Someone",
                timestamp: ts,
                vendorPaymentId: vpId,
                vendorPaymentTitle: vpTitle,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            mutator: "submitVendorPaymentInvoice",
            vendorPaymentId: vpId,
          },
        });
      }
    }
  ),

  update: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const { userId } = ctx;
    const hasEditOwn = can(ctx, "requests.edit_own");
    const hasEditAll = can(ctx, "requests.edit_all");
    const canEditAnyStatus = can(ctx, "requests.edit_all_statuses");
    const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
    assertEntityExists(entity, "Vendor payment");
    if (!(hasEditAll || canEditAnyStatus)) {
      assertCanModify(
        entity,
        userId,
        false,
        "vendor payment",
        false,
        hasEditOwn
      );
    } else if (
      !canEditAnyStatus &&
      INVOICE_LOCKED_STATUSES.has(entity.status as string)
    ) {
      throw new Error(
        "Cannot edit vendor payment details while invoice is pending or completed"
      );
    }

    const vendor = await tx.run(zql.vendor.where("id", args.vendorId).one());
    if (!vendor) {
      throw new Error("Vendor not found");
    }
    assertVendorUsable(vendor, userId, canEditAnyStatus);

    const now = Date.now();
    const vpFk = { vendorPaymentId: args.id };

    await tx.mutate.vendorPayment.update({
      city: args.city,
      eventId: args.eventId,
      id: args.id,
      title: args.title,
      updatedAt: now,
      vendorId: args.vendorId,
    });

    await replaceRelations(
      vpFk,
      args.lineItems,
      args.attachments,
      userId,
      now,
      {
        deleteAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.delete(data),
        deleteLineItem: (data) => tx.mutate.vendorPaymentLineItem.delete(data),
        insertAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.insert({
            ...data,
            purpose: "quotation",
          }),
        insertHistory: (data) => tx.mutate.vendorPaymentHistory.insert(data),
        insertLineItem: (data) => tx.mutate.vendorPaymentLineItem.insert(data),
        onDeleteAttachmentObjectKey: (key) =>
          enqueueDeleteR2Object(ctx, tx.location, key, {
            mutator: "vendorPayment.update",
            vendorPaymentId: args.id,
          }),
        queryAttachments: () =>
          tx.run(
            zql.vendorPaymentAttachment
              .where("vendorPaymentId", args.id)
              .where("purpose", "quotation")
          ),
        queryLineItems: () =>
          tx.run(zql.vendorPaymentLineItem.where("vendorPaymentId", args.id)),
      },
      createR2ClaimOptions(ctx, tx.location, {
        durablePrefix: `vendor-payments/${args.id}/quotation`,
        subfolder: "attachments",
      })
    );

    // Recalculate payment status when admin edits line items on a non-pending VP
    if (hasEditAll && entity.status !== "pending") {
      await recalculateParentStatus(tx, args.id, now);
    }
  }),

  updateInvoice: defineMutator(
    z.object({
      attachments: z.array(attachmentSchema).min(1),
      id: z.string(),
      invoiceDate: z.number(),
      invoiceNumber: z.string().min(1),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const { userId } = ctx;
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
        invoiceDate: args.invoiceDate,
        invoiceNumber: args.invoiceNumber,
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
      const existingObjectKeys = new Set(
        existingAtts
          .map((attachment) => attachment.objectKey)
          .filter((key): key is string => Boolean(key))
      );
      const retainedObjectKeys = new Set(
        args.attachments
          .filter((attachment) => attachment.type === "file")
          .map((attachment) => attachment.objectKey)
      );
      await Promise.all(
        existingAtts.map(async (att) => {
          if (att.objectKey && !retainedObjectKeys.has(att.objectKey)) {
            enqueueDeleteR2Object(ctx, tx.location, att.objectKey, {
              mutator: "vendorPayment.updateInvoice",
              vendorPaymentId: args.id,
            });
          }
          await tx.mutate.vendorPaymentAttachment.delete({ id: att.id });
        })
      );
      await Promise.all(
        args.attachments.map(async (att) => {
          await tx.mutate.vendorPaymentAttachment.insert({
            ...buildClaimedAttachmentInsert(
              att,
              now,
              createR2ClaimOptions(ctx, tx.location, {
                durablePrefix: `vendor-payments/${args.id}/invoice`,
                existingObjectKeys,
                subfolder: "attachments",
              })
            ),
            purpose: "invoice",
            vendorPaymentId: args.id,
          });
        })
      );

      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "invoice_updated", now),
        vendorPaymentId: args.id,
      });
    }
  ),
};
