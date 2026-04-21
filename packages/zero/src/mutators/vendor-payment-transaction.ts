import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { computePaymentStatus } from "../lib/compute-payment-status";
import { assertHasPermission, assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import { mutatorAttachmentSchema as attachmentSchema } from "../shared-schemas";
import {
  INVOICE_LOCKED_STATUSES,
  PAYABLE_STATUSES,
} from "../vendor-payment-constants";
import {
  assertCanDelete,
  assertCanModify,
  assertEntityExists,
  assertPending,
  buildAttachmentInsert,
  buildHistoryInsert,
} from "./submission-helpers";

const createSchema = z.object({
  id: z.string(),
  vendorPaymentId: z.string(),
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .multipleOf(0.01, "Amount must have at most 2 decimal places"),
  description: z.string().trim().optional(),
  transactionDate: z.number(),
  paymentMethod: z.string().trim().optional(),
  paymentReference: z.string().trim().optional(),
  attachments: z.array(attachmentSchema),
});

const fk = (id: string) => ({ vendorPaymentTransactionId: id });
const toCents = (v: number | string) => Math.round(Number(v) * 100);

async function assertWithinPaymentCap(
  // biome-ignore lint/suspicious/noExplicitAny: tx type is complex and varies by context
  tx: any,
  vendorPaymentId: string,
  newAmountCents: number,
  excludeTransactionId?: string
): Promise<void> {
  const allTransactions = await tx.run(
    zql.vendorPaymentTransaction.where("vendorPaymentId", vendorPaymentId)
  );
  const lineItems = await tx.run(
    zql.vendorPaymentLineItem.where("vendorPaymentId", vendorPaymentId)
  );

  const otherTotalCents = (
    allTransactions as Array<{
      id: string;
      status: string;
      amount: number | string;
    }>
  )
    .filter((t) => t.status !== "rejected" && t.id !== excludeTransactionId)
    .reduce((sum: number, t) => sum + toCents(t.amount), 0);
  const totalOwedCents = (
    lineItems as Array<{ amount: number | string }>
  ).reduce((sum: number, li) => sum + toCents(li.amount), 0);

  if (otherTotalCents + newAmountCents > totalOwedCents) {
    throw new Error("Payment amount exceeds remaining balance");
  }
}

export async function recalculateParentStatus(
  // biome-ignore lint/suspicious/noExplicitAny: tx type is complex and varies by context
  tx: any,
  vendorPaymentId: string,
  now: number
): Promise<string | null> {
  const transactions = await tx.run(
    zql.vendorPaymentTransaction.where("vendorPaymentId", vendorPaymentId)
  );
  const approvedAmounts = (
    transactions as Array<{ status: string; amount: number | string }>
  )
    .filter((t) => t.status === "approved")
    .map((t) => t.amount);

  const lineItems = await tx.run(
    zql.vendorPaymentLineItem.where("vendorPaymentId", vendorPaymentId)
  );
  const lineItemAmounts = (lineItems as Array<{ amount: number | string }>).map(
    (li) => li.amount
  );

  const newStatus = computePaymentStatus(approvedAmounts, lineItemAmounts);

  const current = await tx.run(
    zql.vendorPayment.where("id", vendorPaymentId).one()
  );
  if (
    current &&
    current.status !== newStatus &&
    current.status !== "pending" &&
    current.status !== "rejected" &&
    !INVOICE_LOCKED_STATUSES.has(current.status as string)
  ) {
    await tx.mutate.vendorPayment.update({
      id: vendorPaymentId,
      status: newStatus,
      updatedAt: now,
    });
    return newStatus;
  }
  return null;
}

export const vendorPaymentTransactionMutators = {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: notification branching after tx.run adds 1 point over limit
  create: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    assertHasPermission(ctx, "requests.record_payment");
    const userId = ctx.userId;

    const vendorPayment = await tx.run(
      zql.vendorPayment.where("id", args.vendorPaymentId).one()
    );
    assertEntityExists(vendorPayment, "Vendor payment");

    // Must be VP submitter or have approve permission
    const isVpOwner = vendorPayment.userId === userId;
    const isAdmin = can(ctx, "requests.approve");
    if (!(isVpOwner || isAdmin)) {
      throw new Error("Unauthorized");
    }

    const vpStatus = vendorPayment.status as string;
    // Pending VPs allow transactions from submitter or admin;
    // approved/partially_paid/paid always allow transactions
    if (vpStatus === "rejected") {
      throw new Error(
        "Cannot record payments against rejected vendor payments"
      );
    }
    if (!PAYABLE_STATUSES.has(vpStatus) && vpStatus !== "pending") {
      throw new Error("Cannot record payments against this vendor payment");
    }

    await assertWithinPaymentCap(
      tx,
      args.vendorPaymentId,
      toCents(args.amount)
    );

    const now = Date.now();

    const isApprover = can(ctx, "requests.approve");

    await tx.mutate.vendorPaymentTransaction.insert({
      id: args.id,
      vendorPaymentId: args.vendorPaymentId,
      userId,
      amount: args.amount,
      description: args.description ?? null,
      transactionDate: args.transactionDate,
      paymentMethod: args.paymentMethod ?? null,
      paymentReference: args.paymentReference ?? null,
      status: isApprover ? "approved" : "pending",
      rejectionReason: null,
      reviewedBy: isApprover ? userId : null,
      reviewedAt: isApprover ? now : null,
      createdAt: now,
      updatedAt: now,
    });

    for (const att of args.attachments) {
      await tx.mutate.vendorPaymentTransactionAttachment.insert({
        ...buildAttachmentInsert(att, now),
        ...fk(args.id),
      });
    }

    await tx.mutate.vendorPaymentTransactionHistory.insert({
      ...buildHistoryInsert(userId, "created", now),
      ...fk(args.id),
    });

    let newVpStatus: string | null = null;
    if (isApprover) {
      await tx.mutate.vendorPaymentTransactionHistory.insert({
        ...buildHistoryInsert(userId, "approved", now),
        ...fk(args.id),
      });
      newVpStatus = await recalculateParentStatus(
        tx,
        args.vendorPaymentId,
        now
      );
    }

    if (tx.location === "server") {
      const transactionId = args.id;
      const vpId = args.vendorPaymentId;
      const vpTitle = vendorPayment.title;
      const vpOwnerId = vendorPayment.userId as string;

      if (isApprover) {
        if (newVpStatus === "paid") {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "createVendorPaymentTransaction:vpFullyPaid",
              vendorPaymentId: vpId,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-vp-fully-paid",
                {
                  vendorPaymentId: vpId,
                  title: vpTitle,
                  submitterId: vpOwnerId,
                },
                { traceId: ctx.traceId }
              );
            },
          });
        }
      } else {
        const submitter = await tx.run(zql.user.where("id", userId).one());
        const submitterName = submitter?.name ?? "Unknown";
        ctx.asyncTasks?.push({
          meta: {
            mutator: "createVendorPaymentTransaction",
            userId,
            transactionId,
            vendorPaymentId: vpId,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-vpt-submitted",
              {
                transactionId,
                vendorPaymentId: vpId,
                vendorPaymentTitle: vpTitle,
                amount: args.amount,
                submitterName,
              },
              { traceId: ctx.traceId }
            );
          },
        });
      }
    }
  }),

  update: defineMutator(
    createSchema.omit({ vendorPaymentId: true }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const userId = ctx.userId;
      const hasEditAll = can(ctx, "requests.edit_all");
      const entity = await tx.run(
        zql.vendorPaymentTransaction.where("id", args.id).one()
      );
      assertEntityExists(entity, "Transaction");

      // Block edits when parent VP invoice is locked (applies to all users)
      const parentVp = await tx.run(
        zql.vendorPayment.where("id", entity.vendorPaymentId as string).one()
      );
      if (parentVp && INVOICE_LOCKED_STATUSES.has(parentVp.status as string)) {
        throw new Error(
          "Cannot edit transaction while invoice is pending or completed"
        );
      }

      if (!hasEditAll) {
        assertCanModify(entity, userId, false, "transaction");
      }

      // Rejected transactions don't contribute to the balance, so the cap
      // doesn't apply — skip to allow admin corrections on rejected records.
      if (entity.status !== "rejected") {
        await assertWithinPaymentCap(
          tx,
          entity.vendorPaymentId as string,
          toCents(args.amount),
          args.id
        );
      }

      const now = Date.now();

      await tx.mutate.vendorPaymentTransaction.update({
        id: args.id,
        amount: args.amount,
        description: args.description ?? null,
        transactionDate: args.transactionDate,
        paymentMethod: args.paymentMethod ?? null,
        paymentReference: args.paymentReference ?? null,
        updatedAt: now,
      });

      // Replace attachments
      const existingAtts = await tx.run(
        zql.vendorPaymentTransactionAttachment.where(
          "vendorPaymentTransactionId",
          args.id
        )
      );
      for (const att of existingAtts) {
        await tx.mutate.vendorPaymentTransactionAttachment.delete({
          id: att.id,
        });
      }
      for (const att of args.attachments) {
        await tx.mutate.vendorPaymentTransactionAttachment.insert({
          ...buildAttachmentInsert(att, now),
          ...fk(args.id),
        });
      }

      await tx.mutate.vendorPaymentTransactionHistory.insert({
        ...buildHistoryInsert(userId, "updated", now),
        ...fk(args.id),
      });

      // Recalculate parent VP status when an approved transaction is edited
      if (entity.status === "approved") {
        await recalculateParentStatus(
          tx,
          entity.vendorPaymentId as string,
          now
        );
      }
    }
  ),

  approve: defineMutator(
    z.object({
      id: z.string(),
      note: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const userId = ctx.userId;
      const entity = await tx.run(
        zql.vendorPaymentTransaction.where("id", args.id).one()
      );
      assertEntityExists(entity, "Transaction");
      assertPending(entity, "transaction", "approved");
      const vpId = entity.vendorPaymentId as string;

      const vendorPayment = await tx.run(
        zql.vendorPayment.where("id", vpId).one()
      );
      if (
        !(vendorPayment && PAYABLE_STATUSES.has(vendorPayment.status as string))
      ) {
        throw new Error(
          "Cannot approve transaction: parent vendor payment is not approved"
        );
      }

      await assertWithinPaymentCap(
        tx,
        vpId,
        toCents(entity.amount as number | string),
        args.id
      );

      const now = Date.now();

      await tx.mutate.vendorPaymentTransaction.update({
        id: args.id,
        status: "approved",
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });

      await tx.mutate.vendorPaymentTransactionHistory.insert({
        ...buildHistoryInsert(userId, "approved", now, args.note),
        ...fk(args.id),
      });

      // Recalculate parent VP payment status
      const newVpStatus = await recalculateParentStatus(tx, vpId, now);

      if (tx.location === "server") {
        const transactionId = args.id;
        const submitterId = entity.userId as string;
        const vpTitle = vendorPayment.title as string;
        const vpOwnerId = vendorPayment.userId as string;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "approveVendorPaymentTransaction",
            transactionId,
            vendorPaymentId: vpId,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-vpt-approved",
              {
                transactionId,
                vendorPaymentId: vpId,
                vendorPaymentTitle: vpTitle,
                amount: Number(entity.amount),
                submitterId,
                note: args.note,
              },
              { traceId: ctx.traceId }
            );
          },
        });

        // Notify VP submitter when all payments are received
        if (newVpStatus === "paid") {
          ctx.asyncTasks?.push({
            meta: {
              mutator: "approveVendorPaymentTransaction:vpFullyPaid",
              vendorPaymentId: vpId,
            },
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-vp-fully-paid",
                {
                  vendorPaymentId: vpId,
                  title: vpTitle,
                  submitterId: vpOwnerId,
                },
                { traceId: ctx.traceId }
              );
            },
          });
        }
      }
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const userId = ctx.userId;
      const entity = await tx.run(
        zql.vendorPaymentTransaction.where("id", args.id).one()
      );
      assertEntityExists(entity, "Transaction");
      assertPending(entity, "transaction", "rejected");
      const vpId = entity.vendorPaymentId as string;

      const now = Date.now();

      await tx.mutate.vendorPaymentTransaction.update({
        id: args.id,
        status: "rejected",
        rejectionReason: args.reason,
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });

      await tx.mutate.vendorPaymentTransactionHistory.insert({
        ...buildHistoryInsert(userId, "rejected", now, args.reason),
        ...fk(args.id),
      });

      // Defensively recalculate parent status in case constraints are loosened later
      await recalculateParentStatus(tx, vpId, now);

      if (tx.location === "server") {
        const vendorPayment = await tx.run(
          zql.vendorPayment.where("id", vpId).one()
        );
        const transactionId = args.id;
        const submitterId = entity.userId as string;
        const vpTitle = (vendorPayment?.title as string) ?? "";
        ctx.asyncTasks?.push({
          meta: {
            mutator: "rejectVendorPaymentTransaction",
            transactionId,
            vendorPaymentId: vpId,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-vpt-rejected",
              {
                transactionId,
                vendorPaymentId: vpId,
                vendorPaymentTitle: vpTitle,
                amount: Number(entity.amount),
                submitterId,
                reason: args.reason,
              },
              { traceId: ctx.traceId }
            );
          },
        });
      }
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const userId = ctx.userId;
      const entity = await tx.run(
        zql.vendorPaymentTransaction.where("id", args.id).one()
      );
      assertEntityExists(entity, "Transaction");
      const vpId = entity.vendorPaymentId as string;

      // Block deletion when parent VP invoice is locked (applies to all users)
      const parentVp = await tx.run(zql.vendorPayment.where("id", vpId).one());
      if (parentVp && INVOICE_LOCKED_STATUSES.has(parentVp.status as string)) {
        throw new Error(
          "Cannot delete transaction while invoice is pending or completed"
        );
      }

      assertCanDelete(entity, userId, can(ctx, "requests.delete_all"));

      // Delete attachments
      const attachments = await tx.run(
        zql.vendorPaymentTransactionAttachment.where(
          "vendorPaymentTransactionId",
          args.id
        )
      );
      for (const att of attachments) {
        await tx.mutate.vendorPaymentTransactionAttachment.delete({
          id: att.id,
        });
      }

      // Delete history
      const history = await tx.run(
        zql.vendorPaymentTransactionHistory.where(
          "vendorPaymentTransactionId",
          args.id
        )
      );
      for (const h of history) {
        await tx.mutate.vendorPaymentTransactionHistory.delete({ id: h.id });
      }

      await tx.mutate.vendorPaymentTransaction.delete({ id: args.id });

      // Recalculate parent VP status after deletion
      await recalculateParentStatus(tx, vpId, Date.now());
    }
  ),
};
