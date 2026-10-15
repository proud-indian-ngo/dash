import {
  cityValues,
  vendorPaymentNoInvoiceReasonValues,
} from "@pi-dash/shared/constants";
import {
  NO_INVOICE_NOTE_MAX_LENGTH,
  NO_INVOICE_REASON_LABELS,
  noInvoiceDetailsError,
} from "@pi-dash/shared/vendor-payment";
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
  assertCanChangeCharge,
  chargeChangeNote,
  expenseChargeArgs,
  resolveExpenseCharge,
  POSTED_CHARGE_MESSAGE,
  setChargedToSchema,
} from "./expense-charge";
import {
  isPostedInBooks,
  type LedgerSourceRef,
  queueLedgerPosting,
} from "./ledger-queue";
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
import {
  recalculateParentStatus,
  transactionAttachmentKeyPrefixes,
} from "./vendor-payment-transaction";

/** Its expense in the books (finance layer 3-3a); its payments follow it. */
const ledgerSource = (id: string): LedgerSourceRef => ({
  sourceId: id,
  sourceType: "vendor_payment",
});

const UUID_SEGMENT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function legacyAttachmentKeyPrefix(key: string): string | undefined {
  const segments = key.split("/");
  const attachmentsIndex = segments.indexOf("attachments");
  const legacyEntityId = segments[attachmentsIndex + 1];
  return legacyEntityId && UUID_SEGMENT_PATTERN.test(legacyEntityId)
    ? `attachments/${legacyEntityId}/`
    : undefined;
}

const vendorPaymentAttachmentKeyPrefixes = (id: string, key?: string) => {
  const prefixes = [`attachments/vendor-payments/${id}/`, `attachments/${id}/`];
  const legacyPrefix = key ? legacyAttachmentKeyPrefix(key) : undefined;
  return legacyPrefix ? [...prefixes, legacyPrefix] : prefixes;
};

const vendorPaymentApprovalKeyPrefixes = (id: string) => [
  `approval-screenshots/vendor-payments/${id}/approval-screenshots/`,
  `approval-screenshots/${id}/`,
];

/**
 * Invoice details for a paid request: either the vendor's invoice, or a reason
 * it has none (rent, statutory payments) with optional proof and a note. Both kinds keep
 * their files in the `invoice` attachments, so switching kind replaces them.
 */
const invoiceDetailsUnion = z.discriminatedUnion("kind", [
  z.strictObject({
    attachments: z.array(attachmentSchema).min(1),
    id: z.string(),
    invoiceDate: z.number(),
    invoiceNumber: z.string().trim().min(1),
    kind: z.literal("invoice"),
  }),
  z.strictObject({
    attachments: z.array(attachmentSchema),
    id: z.string(),
    invoiceDate: z.number(),
    kind: z.literal("no_invoice"),
    noInvoiceNote: z.string().trim().max(NO_INVOICE_NOTE_MAX_LENGTH).optional(),
    noInvoiceReason: z.enum(vendorPaymentNoInvoiceReasonValues),
  }),
]);

type InvoiceDetails = z.infer<typeof invoiceDetailsUnion>;

// Accept older clients for one release; remove after the next release.
const invoiceDetailsSchema = z.preprocess(
  (
    value:
      | InvoiceDetails
      | Omit<Extract<InvoiceDetails, { kind: "invoice" }>, "kind">
  ) => {
    if (value && typeof value === "object" && !("kind" in value)) {
      return { ...value, kind: "invoice" };
    }
    return value;
  },
  invoiceDetailsUnion
);

/**
 * Both kinds share a document date, but an invoice number and no-invoice
 * reason are mutually exclusive, so each kind clears the other's details.
 */
function invoiceDetailsUpdate(args: InvoiceDetails) {
  if (args.kind === "no_invoice") {
    const note = args.noInvoiceNote?.trim() || null;
    const error = noInvoiceDetailsError({
      note,
      reason: args.noInvoiceReason,
    });
    if (error) {
      throw new Error(error);
    }
    return {
      invoiceDate: args.invoiceDate,
      invoiceNumber: null,
      noInvoiceNote: note,
      noInvoiceReason: args.noInvoiceReason,
    };
  }
  if (args.attachments.length === 0) {
    throw new Error("Attach the invoice");
  }
  return {
    invoiceDate: args.invoiceDate,
    invoiceNumber: args.invoiceNumber,
    noInvoiceNote: null,
    noInvoiceReason: null,
  };
}

/** History note and metadata recording which kind was submitted. */
function invoiceDetailsHistory(args: InvoiceDetails): {
  metadata: Record<string, string>;
  note: string | undefined;
} {
  if (args.kind === "no_invoice") {
    return {
      metadata: {
        invoiceKind: "no_invoice",
        noInvoiceReason: args.noInvoiceReason,
      },
      note: `No invoice: ${NO_INVOICE_REASON_LABELS[args.noInvoiceReason]}`,
    };
  }
  return { metadata: { invoiceKind: "invoice" }, note: undefined };
}

const createSchema = z.object({
  attachments: z.array(attachmentSchema),
  ...expenseChargeArgs,
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
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      // Review applies only to pending requests, even for admins who can edit
      // any status; they reset a request to pending to review it again.
      assertPending(entity, "vendor payment", "approved");

      const now = Date.now();
      const requestedApprovalScreenshotKey =
        args.approvalScreenshotKey ?? entity.approvalScreenshotKey ?? undefined;
      const approvalScreenshotKey = requestedApprovalScreenshotKey
        ? claimUploadedR2ObjectKey(
            requestedApprovalScreenshotKey,
            createR2ClaimOptions(ctx, tx.location, {
              durablePrefix: `vendor-payments/${args.id}/approval-screenshots`,
              existingObjectKeys: entity.approvalScreenshotKey
                ? new Set([entity.approvalScreenshotKey])
                : undefined,
              subfolder: "approval-screenshots",
            })
          )
        : undefined;

      if (
        entity.approvalScreenshotKey &&
        entity.approvalScreenshotKey !== approvalScreenshotKey
      ) {
        enqueueDeleteR2Object(ctx, tx.location, entity.approvalScreenshotKey, {
          keyPrefixes: vendorPaymentApprovalKeyPrefixes(args.id),
          meta: {
            mutator: "vendorPayment.approve:replaceApprovalScreenshot",
            vendorPaymentId: args.id,
          },
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

      // Requests from before payments needed approval can already hold
      // approved payments; move them on to partially_paid or paid.
      const newStatus = await recalculateParentStatus(tx, args.id, now);
      // Payments already approved on an older request now count.
      queueLedgerPosting(
        ctx,
        tx,
        [ledgerSource(args.id)],
        "vendorPayment.approve"
      );

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

        // Notify the owner when approval lands an already paid request on paid
        if (newStatus === "paid") {
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-vp-fully-paid",
                {
                  submitterId: ownerId,
                  title,
                  vendorPaymentId: id,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              mutator: "approveVendorPayment:vpFullyPaid",
              vendorPaymentId: id,
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
      // The accepted invoice is the expense.
      queueLedgerPosting(
        ctx,
        tx,
        [ledgerSource(args.id)],
        "vendorPayment.approveInvoice"
      );

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
                noInvoiceReason: entity.noInvoiceReason ?? undefined,
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
    const charge = await resolveExpenseCharge(tx, args);

    await tx.mutate.vendorPayment.insert({
      approvalScreenshotKey: null,
      ...charge,
      city: args.city,
      createdAt: now,
      id: args.id,
      invoiceDate: null,
      invoiceNumber: null,
      invoiceRejectionReason: null,
      invoiceReviewedAt: null,
      invoiceReviewedBy: null,
      noInvoiceNote: null,
      noInvoiceReason: null,
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
        keyPrefixes: vendorPaymentApprovalKeyPrefixes(args.id),
        meta: {
          mutator: "vendorPayment.delete:approvalScreenshot",
          vendorPaymentId: args.id,
        },
      });

      await deleteAllRelations({
        deleteAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.delete(data),
        deleteHistory: (data) => tx.mutate.vendorPaymentHistory.delete(data),
        deleteLineItem: (data) => tx.mutate.vendorPaymentLineItem.delete(data),
        onDeleteAttachmentObjectKey: (key) =>
          enqueueDeleteR2Object(ctx, tx.location, key, {
            keyPrefixes: vendorPaymentAttachmentKeyPrefixes(args.id, key),
            meta: {
              mutator: "vendorPayment.delete",
              vendorPaymentId: args.id,
            },
          }),
        queryAttachments: () =>
          tx.run(zql.vendorPaymentAttachment.where("vendorPaymentId", args.id)),
        queryHistory: () =>
          tx.run(zql.vendorPaymentHistory.where("vendorPaymentId", args.id)),
        queryLineItems: () =>
          tx.run(zql.vendorPaymentLineItem.where("vendorPaymentId", args.id)),
      });

      const transactions = await tx.run(
        zql.vendorPaymentTransaction.where("vendorPaymentId", args.id)
      );
      const transactionAttachments = await Promise.all(
        transactions.map(async (transaction) => ({
          attachments: await tx.run(
            zql.vendorPaymentTransactionAttachment.where(
              "vendorPaymentTransactionId",
              transaction.id
            )
          ),
          transactionId: transaction.id,
        }))
      );
      for (const { attachments, transactionId } of transactionAttachments) {
        for (const attachment of attachments) {
          enqueueDeleteR2Object(ctx, tx.location, attachment.objectKey, {
            keyPrefixes: transactionAttachmentKeyPrefixes(transactionId),
            meta: {
              mutator: "vendorPayment.delete:transactionAttachment",
              transactionId,
              vendorPaymentId: args.id,
            },
          });
        }
      }

      await tx.mutate.vendorPayment.delete({ id: args.id });
      // Its expense and payments, if posted, are reversed.
      queueLedgerPosting(
        ctx,
        tx,
        [
          ledgerSource(args.id),
          ...transactions.map((t) => ({
            sourceId: t.id,
            sourceType: "vendor_payment_transaction" as const,
          })),
        ],
        "vendorPayment.delete"
      );
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      // Review applies only to pending requests, even for admins who can edit
      // any status; they reset a request to pending to review it again.
      assertPending(entity, "vendor payment", "rejected");

      // Money already went out on requests paid before approval was required;
      // rejecting would hide those payments, so the request must be approved.
      const approvedTransactions = await tx.run(
        zql.vendorPaymentTransaction
          .where("vendorPaymentId", args.id)
          .where("status", "approved")
      );
      if (approvedTransactions.length > 0) {
        throw new Error(
          "This request already has approved payments; approve it instead"
        );
      }

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
      queueLedgerPosting(
        ctx,
        tx,
        [ledgerSource(args.id)],
        "vendorPayment.reject"
      );

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
      queueLedgerPosting(
        ctx,
        tx,
        [ledgerSource(args.id)],
        "vendorPayment.rejectInvoice"
      );

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
                noInvoiceReason: entity.noInvoiceReason ?? undefined,
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

      // Rejected payments stay as history and do not block a reset.
      const transactions = await tx.run(
        zql.vendorPaymentTransaction
          .where("vendorPaymentId", args.id)
          .where("status", "!=", "rejected")
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
        entity.noInvoiceReason ||
        invoiceAttachments.length > 0
      ) {
        throw new Error(
          "Cannot reset vendor payment to pending after invoice data exists"
        );
      }

      const now = Date.now();
      enqueueDeleteR2Object(ctx, tx.location, entity.approvalScreenshotKey, {
        keyPrefixes: vendorPaymentApprovalKeyPrefixes(args.id),
        meta: {
          mutator: "vendorPayment.resetToPending",
          vendorPaymentId: args.id,
        },
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
      queueLedgerPosting(
        ctx,
        tx,
        [ledgerSource(args.id)],
        "vendorPayment.resetToPending"
      );
    }
  ),

  submitInvoice: defineMutator(
    invoiceDetailsSchema,
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

      const details = invoiceDetailsUpdate(args);
      const now = Date.now();

      await tx.mutate.vendorPayment.update({
        ...details,
        id: args.id,
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
              keyPrefixes: vendorPaymentAttachmentKeyPrefixes(
                args.id,
                att.objectKey
              ),
              meta: {
                mutator: "vendorPayment.submitInvoice",
                vendorPaymentId: args.id,
              },
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

      const history = invoiceDetailsHistory(args);
      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "invoice_submitted", now, history.note),
        metadata: history.metadata,
        vendorPaymentId: args.id,
      });
      queueLedgerPosting(
        ctx,
        tx,
        [ledgerSource(args.id)],
        "vendorPayment.submitInvoice"
      );

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
                noInvoiceReason: details.noInvoiceReason ?? undefined,
                proofAttachmentCount: args.attachments.length,
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

  /**
   * Finance changes what the request is charged to, at approval or later,
   * until its expense is posted to the books: a posted request refuses
   * this (founder decision, finance layer 3-3a).
   */
  setChargedTo: defineMutator(setChargedToSchema, async ({ tx, ctx, args }) => {
    const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
    assertEntityExists(entity, "Vendor payment");
    assertCanChangeCharge(ctx, entity);
    if (await isPostedInBooks(tx, ledgerSource(args.id))) {
      throw new Error(POSTED_CHARGE_MESSAGE);
    }
    const charge = await resolveExpenseCharge(tx, args, entity);
    const note = await chargeChangeNote(tx, entity, charge);
    const now = Date.now();
    await tx.mutate.vendorPayment.update({
      id: args.id,
      updatedAt: now,
      ...charge,
    });
    await tx.mutate.vendorPaymentHistory.insert({
      ...buildHistoryInsert(ctx.userId, "updated", now, note),
      vendorPaymentId: args.id,
    });
    queueLedgerPosting(
      ctx,
      tx,
      [ledgerSource(args.id)],
      "vendorPayment.setChargedTo"
    );
  }),

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
    const charge = await resolveExpenseCharge(tx, args, entity);

    await tx.mutate.vendorPayment.update({
      ...charge,
      city: args.city,
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
            keyPrefixes: vendorPaymentAttachmentKeyPrefixes(args.id, key),
            meta: {
              mutator: "vendorPayment.update",
              vendorPaymentId: args.id,
            },
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
    // An edit after posting reverses and reposts the expense.
    queueLedgerPosting(
      ctx,
      tx,
      [ledgerSource(args.id)],
      "vendorPayment.update"
    );
  }),

  updateInvoice: defineMutator(
    invoiceDetailsSchema,
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

      const details = invoiceDetailsUpdate(args);
      const now = Date.now();

      const oldInvoiceKind = entity.noInvoiceReason ? "no_invoice" : "invoice";
      const requiresNewApproval =
        status === "completed" && oldInvoiceKind !== args.kind;
      // Same-kind edits retain approval; changing kind needs a fresh review.
      const newStatus =
        canEditAll && status === "completed" && !requiresNewApproval
          ? "completed"
          : "invoice_pending";

      await tx.mutate.vendorPayment.update({
        ...details,
        id: args.id,
        invoiceRejectionReason: null,
        ...(requiresNewApproval
          ? { invoiceReviewedAt: null, invoiceReviewedBy: null }
          : {}),
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
              keyPrefixes: vendorPaymentAttachmentKeyPrefixes(
                args.id,
                att.objectKey
              ),
              meta: {
                mutator: "vendorPayment.updateInvoice",
                vendorPaymentId: args.id,
              },
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

      const history = invoiceDetailsHistory(args);
      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "invoice_updated", now, history.note),
        metadata: {
          ...history.metadata,
          newInvoiceKind: args.kind,
          oldInvoiceKind,
        },
        vendorPaymentId: args.id,
      });
      // A changed kind reopens review, which reverses a posted expense.
      queueLedgerPosting(
        ctx,
        tx,
        [ledgerSource(args.id)],
        "vendorPayment.updateInvoice"
      );

      if (requiresNewApproval && tx.location === "server") {
        const submitter = await tx.run(zql.user.where("id", userId).one());
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-vp-invoice-submitted",
              {
                noInvoiceReason: details.noInvoiceReason ?? undefined,
                proofAttachmentCount: args.attachments.length,
                submitterName: submitter?.name ?? "Someone",
                timestamp: now,
                vendorPaymentId: args.id,
                vendorPaymentTitle: entity.title,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            mutator: "updateVendorPaymentInvoice",
            vendorPaymentId: args.id,
          },
        });
      }
    }
  ),
};
