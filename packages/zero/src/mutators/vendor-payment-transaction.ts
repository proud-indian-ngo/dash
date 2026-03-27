import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { computePaymentStatus } from "../lib/compute-payment-status";
import { assertHasPermission, assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import { mutatorAttachmentSchema as attachmentSchema } from "../shared-schemas";
import { PAYABLE_STATUSES } from "../vendor-payment-constants";
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

async function recalculateParentStatus(
  // biome-ignore lint/suspicious/noExplicitAny: tx type is complex and varies by context
  tx: any,
  vendorPaymentId: string,
  now: number
) {
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
    current.status !== "rejected"
  ) {
    await tx.mutate.vendorPayment.update({
      id: vendorPaymentId,
      status: newStatus,
      updatedAt: now,
    });
  }
}

export const vendorPaymentTransactionMutators = {
  create: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    assertHasPermission(ctx, "requests.record_payment");
    const userId = ctx.userId;

    const vendorPayment = await tx.run(
      zql.vendorPayment.where("id", args.vendorPaymentId).one()
    );
    assertEntityExists(vendorPayment, "Vendor payment");

    if (!PAYABLE_STATUSES.has(vendorPayment.status as string)) {
      throw new Error(
        "Can only record payments against approved vendor payments"
      );
    }

    // Must be VP submitter or have approve permission
    if (vendorPayment.userId !== userId && !can(ctx, "requests.approve")) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();

    await tx.mutate.vendorPaymentTransaction.insert({
      id: args.id,
      vendorPaymentId: args.vendorPaymentId,
      userId,
      amount: args.amount,
      description: args.description ?? null,
      transactionDate: args.transactionDate,
      paymentMethod: args.paymentMethod ?? null,
      paymentReference: args.paymentReference ?? null,
      status: "pending",
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
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

    if (tx.location === "server") {
      const transactionId = args.id;
      const vpId = args.vendorPaymentId;
      const vpTitle = vendorPayment.title;
      ctx.asyncTasks?.push({
        meta: {
          mutator: "createVendorPaymentTransaction",
          userId,
          transactionId,
          vendorPaymentId: vpId,
        },
        fn: async () => {
          const { getUserName, notifyVendorPaymentTransactionSubmitted } =
            await import("@pi-dash/notifications");
          const submitterName = (await getUserName(userId)) ?? "Unknown";
          await notifyVendorPaymentTransactionSubmitted({
            transactionId,
            vendorPaymentId: vpId,
            vendorPaymentTitle: vpTitle,
            amount: args.amount,
            submitterName,
          });
        },
      });
    }
  }),

  update: defineMutator(
    createSchema.omit({ vendorPaymentId: true }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const userId = ctx.userId;
      const entity = await tx.run(
        zql.vendorPaymentTransaction.where("id", args.id).one()
      );
      assertEntityExists(entity, "Transaction");
      assertCanModify(
        entity,
        userId,
        can(ctx, "requests.edit_all"),
        "transaction"
      );

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
      await recalculateParentStatus(tx, vpId, now);

      if (tx.location === "server") {
        const transactionId = args.id;
        const submitterId = entity.userId as string;
        const vpTitle = vendorPayment.title as string;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "approveVendorPaymentTransaction",
            transactionId,
            vendorPaymentId: vpId,
          },
          fn: async () => {
            const { notifyVendorPaymentTransactionApproved } = await import(
              "@pi-dash/notifications"
            );
            await notifyVendorPaymentTransactionApproved({
              transactionId,
              vendorPaymentId: vpId,
              vendorPaymentTitle: vpTitle,
              amount: Number(entity.amount),
              submitterId,
              note: args.note,
            });
          },
        });
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
            const { notifyVendorPaymentTransactionRejected } = await import(
              "@pi-dash/notifications"
            );
            await notifyVendorPaymentTransactionRejected({
              transactionId,
              vendorPaymentId: vpId,
              vendorPaymentTitle: vpTitle,
              amount: Number(entity.amount),
              submitterId,
              reason: args.reason,
            });
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
    }
  ),
};
