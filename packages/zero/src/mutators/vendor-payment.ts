import { CLEARED_LEAD_APPROVAL } from "@pi-dash/shared/approval-policy";
import { vendorPaymentNoInvoiceReasonValues } from "@pi-dash/shared/constants";
import { provisionHeadOf } from "@pi-dash/shared/provisions";
import {
  NO_INVOICE_NOTE_MAX_LENGTH,
  NO_INVOICE_REASON_LABELS,
  noInvoiceDetailsError,
} from "@pi-dash/shared/vendor-payment";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission, assertIsLoggedIn, can } from "../permissions";
import { type Schema, zql } from "../schema";
import {
  mutatorAttachmentSchema as attachmentSchema,
  mutatorLineItemSchema as lineItemSchema,
} from "../shared-schemas";
import { INVOICE_UPLOADABLE_STATUSES } from "../vendor-payment-constants";
import { userName } from "./claimant";
import {
  costCentreAfterRecharge,
  pickRequestCostCentreId,
} from "./cost-centre-pick";
import { assertNewRecord } from "./creation-invariant";
import {
  assertCanChangeCharge,
  chargeChangeNote,
  expenseChargeArgs,
  resolveExpenseCharge,
  POSTED_CHARGE_MESSAGE,
  setChargedToSchema,
} from "./expense-charge";
import {
  assertIsWaitingLead,
  assertNotOwnRequest,
  chargeChanges,
  financeLeadStep,
  LEAD_APPROVAL_CLEARED_NOTE,
  LEAD_SKIPPED_NOTE,
  leadApproverFor,
  leadSkipReasonArg,
  linesChange,
  notifyIfLeadNowWaiting,
  programmeChanges,
} from "./lead-approval";
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
import { lockVendorPayment } from "./vendor-payment-lock";
import {
  recalculateParentStatus,
  transactionAttachmentKeyPrefixes,
} from "./vendor-payment-transaction";
import {
  assertDeletable,
  assertNotMatchedToBank,
  assertNotVoided,
  voidSchema,
} from "./void";

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

/**
 * At invoice approval, finance may charge lines to a provision (the audit
 * fee payable) instead of their category's expense: only a head in
 * `PROVISION_HEADS`, only lines of this request. Every other line goes
 * back to its category. Lines whose choice doesn't change are not touched,
 * so the books see no change for them.
 */
async function chargeLinesToProvision(
  tx: Transaction<Schema>,
  args: { id: string; provisionHeadId?: string; provisionLineIds?: string[] },
  now: number
) {
  const chosen = new Set(args.provisionLineIds ?? []);
  const provision =
    chosen.size > 0 ? provisionHeadOf(args.provisionHeadId) : null;
  if (chosen.size > 0 && !provision) {
    throw new Error("A line can only be charged to a provision");
  }
  const lines = await tx.run(
    zql.vendorPaymentLineItem.where("vendorPaymentId", args.id)
  );
  const ids = new Set(lines.map((l) => l.id));
  if ([...chosen].some((lineId) => !ids.has(lineId))) {
    throw new Error("That line isn't on this vendor payment");
  }
  for (const line of lines) {
    const provisionHeadId = chosen.has(line.id)
      ? (provision?.id ?? null)
      : null;
    if ((line.provisionHeadId ?? null) !== provisionHeadId) {
      await tx.mutate.vendorPaymentLineItem.update({
        id: line.id,
        provisionHeadId,
        updatedAt: now,
      });
    }
  }
}

const createSchema = z.object({
  attachments: z.array(attachmentSchema),
  ...expenseChargeArgs,
  costCentreId: z.string().optional(),
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
      ...leadSkipReasonArg,
      note: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;
      await lockVendorPayment(tx, args.id);
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertNotVoided(entity);
      // Review applies only to pending requests, even for admins who can edit
      // any status; they reset a request to pending to review it again.
      assertPending(entity, "vendor payment", "approved");
      assertNotOwnRequest(ctx, entity);
      const leadStep = await financeLeadStep(
        tx,
        ctx,
        entity,
        args.leadSkipReason
      );

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
        ...leadStep,
        rejectionReason: null,
        reviewedAt: now,
        reviewedBy: userId,
        status: "approved",
        updatedAt: now,
      });
      if (leadStep.leadSkipReason) {
        await tx.mutate.vendorPaymentHistory.insert({
          ...buildHistoryInsert(
            userId,
            "updated",
            now,
            LEAD_SKIPPED_NOTE(leadStep.leadSkipReason)
          ),
          vendorPaymentId: args.id,
        });
      }

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
                reviewedAt: now,
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
                  approvedAt: now,
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
                  paidAt: now,
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

  /**
   * The programme lead approves a pending vendor payment charged to their
   * programme; finance then approves the payment. Finance is told only now
   * (or at submission when there is no lead step).
   */
  approveAsLead: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      await lockVendorPayment(tx, args.id);
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertNotVoided(entity);
      if (!(await assertIsWaitingLead(tx, ctx, entity))) {
        return;
      }
      if (entity.leadApprovedAt) {
        throw new Error("You've already approved this as the programme lead");
      }
      const now = Date.now();
      await tx.mutate.vendorPayment.update({
        id: args.id,
        leadApprovedAt: now,
        leadApprovedBy: ctx.userId,
        updatedAt: now,
      });
      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(
          ctx.userId,
          "updated",
          now,
          "Approved as programme lead"
        ),
        vendorPaymentId: args.id,
      });
      if (tx.location !== "server") {
        return;
      }
      const { title } = entity;
      const [leadName, submitterName] = await Promise.all([
        userName(tx, ctx.userId),
        userName(tx, entity.userId),
      ]);
      ctx.asyncTasks?.push({
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs/enqueue");
          await enqueue(
            "notify-vendor-payment-submitted",
            {
              leadApproval: { at: now, leadName },
              submitterName,
              title,
              vendorPaymentId: args.id,
            },
            { traceId: ctx.traceId }
          );
        },
        meta: {
          mutator: "vendorPayment.approveAsLead",
          vendorPaymentId: args.id,
        },
      });
    }
  ),

  approveInvoice: defineMutator(
    z.object({
      id: z.string(),
      note: z.string().optional(),
      /**
       * The provision the lines in `provisionLineIds` pay instead of their
       * category's expense (`PROVISION_HEADS`, the audit fee). Every other
       * line is charged to its category, as before.
       */
      provisionHeadId: z.string().optional(),
      provisionLineIds: z.array(z.string()).max(100).optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;
      await lockVendorPayment(tx, args.id);
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      // Nobody approves the invoice of a request they raised.
      assertNotOwnRequest(ctx, entity);
      assertNotVoided(entity);

      if (entity.status !== "invoice_pending") {
        throw new Error(
          "Can only approve invoice when status is invoice_pending"
        );
      }

      const now = Date.now();
      await chargeLinesToProvision(tx, args, now);

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
                approvedAt: now,
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
    await assertNewRecord(tx, "vendorPayment", args.id, () =>
      tx.run(zql.vendorPayment.where("id", args.id).one())
    );
    const { userId } = ctx;

    const vendor = await tx.run(zql.vendor.where("id", args.vendorId).one());
    if (!vendor) {
      throw new Error("Vendor not found");
    }
    assertVendorUsable(vendor, userId);

    const now = Date.now();
    const vpFk = { vendorPaymentId: args.id };
    const charge = await resolveExpenseCharge(tx, args, undefined, ctx);

    await tx.mutate.vendorPayment.insert({
      approvalScreenshotKey: null,
      ...CLEARED_LEAD_APPROVAL,
      ...charge,
      costCentreId: await pickRequestCostCentreId(tx, {
        costCentreId: args.costCentreId,
        eventId: charge.eventId,
      }),
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
      // The programme lead reviews first; finance hears once they approve.
      const leadUserId = await leadApproverFor(tx, { ...charge, userId });
      ctx.asyncTasks?.push({
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs/enqueue");
          await enqueue(
            "notify-vendor-payment-submitted",
            {
              leadUserId: leadUserId ?? undefined,
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
      await lockVendorPayment(tx, args.id);
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertCanDelete(
        entity,
        userId,
        can(ctx, "requests.delete_all"),
        can(ctx, "requests.delete_own")
      );
      // Neither the request nor any of its payments may stand in the books.
      await assertDeletable(tx, entity, [
        ledgerSource(args.id),
        ...(
          await tx.run(
            zql.vendorPaymentTransaction.where("vendorPaymentId", args.id)
          )
        ).map((t) => ({
          sourceId: t.id,
          sourceType: "vendor_payment_transaction" as const,
        })),
      ]);
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
      assertIsLoggedIn(ctx);
      const { userId } = ctx;
      await lockVendorPayment(tx, args.id);
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertNotVoided(entity);
      // The programme lead rejects a pending request waiting for them.
      if (
        !(
          can(ctx, "requests.approve") ||
          (await assertIsWaitingLead(tx, ctx, entity))
        )
      ) {
        return;
      }
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
                reviewedAt: now,
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
      await lockVendorPayment(tx, args.id);
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertNotVoided(entity);

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
      await lockVendorPayment(tx, args.id);
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertNotVoided(entity);
      // As it was, to tell whether it now waits for a lead.
      const entityBefore = { ...entity };

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
        // The lead looks at it again.
        ...CLEARED_LEAD_APPROVAL,
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
      await notifyIfLeadNowWaiting(tx, ctx, "vendorPayment", {
        after: { ...entity, ...CLEARED_LEAD_APPROVAL, status: "pending" },
        before: entityBefore,
        now,
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
      await lockVendorPayment(tx, args.id);
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertNotVoided(entity);

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
    await lockVendorPayment(tx, args.id);
    const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
    assertEntityExists(entity, "Vendor payment");
    assertNotVoided(entity);
    // As it was, to tell whether it now waits for a lead.
    const entityBefore = { ...entity };
    assertCanChangeCharge(ctx, entity);
    if (await isPostedInBooks(tx, ledgerSource(args.id))) {
      throw new Error(POSTED_CHARGE_MESSAGE);
    }
    const charge = await resolveExpenseCharge(tx, args, entity, ctx);
    const note = await chargeChangeNote(tx, entity, charge);
    // The lead approved it for their programme; another programme's lead
    // looks at it afresh.
    const clearsLead =
      entity.status === "pending" &&
      Boolean(entity.leadApprovedAt) &&
      (await programmeChanges(tx, entity, charge));
    const now = Date.now();
    await tx.mutate.vendorPayment.update({
      id: args.id,
      updatedAt: now,
      ...charge,
      costCentreId: await costCentreAfterRecharge(tx, entity, charge.eventId),
      ...(clearsLead ? CLEARED_LEAD_APPROVAL : {}),
    });
    await tx.mutate.vendorPaymentHistory.insert({
      ...buildHistoryInsert(ctx.userId, "updated", now, note),
      vendorPaymentId: args.id,
    });
    if (clearsLead) {
      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(
          ctx.userId,
          "updated",
          now,
          LEAD_APPROVAL_CLEARED_NOTE
        ),
        vendorPaymentId: args.id,
      });
    }
    await notifyIfLeadNowWaiting(tx, ctx, "vendorPayment", {
      after: {
        ...entity,
        ...charge,
        ...(clearsLead ? CLEARED_LEAD_APPROVAL : {}),
      },
      before: entityBefore,
      now,
    });
    queueLedgerPosting(
      ctx,
      tx,
      [ledgerSource(args.id)],
      "vendorPayment.setChargedTo"
    );
  }),

  /**
   * Voids the request and its payments (finance Option B): they stay, with
   * their attachments and history, and take no further change; the posting
   * run reverses the expense and each payment on the void day. Voiding
   * twice changes nothing.
   */
  void: defineMutator(voidSchema, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "requests.void");
    await lockVendorPayment(tx, args.id);
    const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
    assertEntityExists(entity, "Vendor payment");
    if (entity.voidedAt) {
      return;
    }
    const transactions = await tx.run(
      zql.vendorPaymentTransaction.where("vendorPaymentId", args.id)
    );
    await assertNotMatchedToBank(
      tx,
      transactions.map((t) => ({
        sourceId: t.id,
        sourceType: "vendor_payment_transaction" as const,
      }))
    );
    const now = Date.now();
    const voided = {
      updatedAt: now,
      voidedAt: now,
      voidedBy: ctx.userId,
      voidReason: args.reason,
    };
    await tx.mutate.vendorPayment.update({ id: args.id, ...voided });
    await tx.mutate.vendorPaymentHistory.insert({
      ...buildHistoryInsert(ctx.userId, "voided", now, args.reason),
      vendorPaymentId: args.id,
    });
    for (const t of transactions) {
      if (t.voidedAt) {
        continue;
      }
      await tx.mutate.vendorPaymentTransaction.update({ id: t.id, ...voided });
      await tx.mutate.vendorPaymentTransactionHistory.insert({
        ...buildHistoryInsert(ctx.userId, "voided", now, args.reason),
        vendorPaymentTransactionId: t.id,
      });
    }
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
      "vendorPayment.void"
    );
  }),

  update: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const { userId } = ctx;
    const hasEditOwn = can(ctx, "requests.edit_own");
    const hasEditAll = can(ctx, "requests.edit_all");
    const canEditAnyStatus = can(ctx, "requests.edit_all_statuses");
    await lockVendorPayment(tx, args.id);
    const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
    assertEntityExists(entity, "Vendor payment");
    assertNotVoided(entity);
    // As it was, to tell whether it now waits for a lead.
    const entityBefore = { ...entity };
    assertCanModify(
      entity,
      userId,
      hasEditAll || canEditAnyStatus,
      "vendor payment",
      canEditAnyStatus,
      hasEditOwn
    );

    const vendor = await tx.run(zql.vendor.where("id", args.vendorId).one());
    if (!vendor) {
      throw new Error("Vendor not found");
    }
    assertVendorUsable(vendor, userId, canEditAnyStatus);

    const now = Date.now();
    const vpFk = { vendorPaymentId: args.id };
    const charge = await resolveExpenseCharge(tx, args, entity, ctx);
    // Lines finance charged to a provision, as they were.
    const provisionByLine = new Map(
      (
        await tx.run(
          zql.vendorPaymentLineItem.where("vendorPaymentId", args.id)
        )
      ).flatMap((l) => (l.provisionHeadId ? [[l.id, l] as const] : []))
    );
    const provisionCleared = new Set<string>();
    const provisionKeptResized = new Set<string>();
    // What the lead approved changed: they look at it again.
    const clearsLead =
      entity.status === "pending" &&
      Boolean(entity.leadApprovedAt) &&
      (chargeChanges(entity, charge) ||
        linesChange(
          await tx.run(
            zql.vendorPaymentLineItem.where("vendorPaymentId", args.id)
          ),
          args.lineItems
        ));

    await tx.mutate.vendorPayment.update({
      ...charge,
      ...(clearsLead ? CLEARED_LEAD_APPROVAL : {}),
      costCentreId: await pickRequestCostCentreId(
        tx,
        { costCentreId: args.costCentreId, eventId: charge.eventId },
        entity
      ),
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
        // A line finance charged to a provision keeps that choice when
        // the request is edited (lines keep their IDs), also when only its
        // amount changes (the invoice can't be approved again to put it
        // back). A new category is a different cost: the choice goes.
        insertLineItem: (data) => {
          const before = provisionByLine.get(data.id);
          const kept = before?.categoryId === data.categoryId;
          if (before && !kept) {
            provisionCleared.add(data.id);
          } else if (before && before.amountPaise !== data.amountPaise) {
            provisionKeptResized.add(data.id);
          }
          return tx.mutate.vendorPaymentLineItem.insert({
            ...data,
            provisionHeadId: kept ? (before.provisionHeadId ?? null) : null,
          });
        },
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

    if (clearsLead) {
      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(
          userId,
          "updated",
          now,
          LEAD_APPROVAL_CLEARED_NOTE
        ),
        vendorPaymentId: args.id,
      });
    }
    await notifyIfLeadNowWaiting(tx, ctx, "vendorPayment", {
      after: {
        ...entity,
        ...charge,
        ...(clearsLead ? CLEARED_LEAD_APPROVAL : {}),
        title: args.title,
      },
      before: entityBefore,
      now,
    });
    if (provisionKeptResized.size > 0) {
      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(
          userId,
          "updated",
          now,
          provisionKeptResized.size === 1
            ? "The line's amount changed; it is still charged to the provision"
            : `${provisionKeptResized.size} lines' amounts changed; they are still charged to the provision`
        ),
        vendorPaymentId: args.id,
      });
    }
    // A line that was removed loses its charge too.
    for (const lineId of provisionByLine.keys()) {
      if (!args.lineItems.some((l) => l.id === lineId)) {
        provisionCleared.add(lineId);
      }
    }
    if (provisionCleared.size > 0) {
      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(
          userId,
          "updated",
          now,
          provisionCleared.size === 1
            ? "Provision charge cleared: the line charged to a provision changed category or was removed"
            : `Provision charge cleared: ${provisionCleared.size} lines charged to a provision changed category or were removed`
        ),
        vendorPaymentId: args.id,
      });
    }

    // Recalculate payment status when finance edits line items after approval.
    if (canEditAnyStatus && entity.status !== "pending") {
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
      await lockVendorPayment(tx, args.id);
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertNotVoided(entity);

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
