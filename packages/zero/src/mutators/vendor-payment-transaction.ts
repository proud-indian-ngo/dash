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
  buildClaimedAttachmentInsert,
  buildHistoryInsert,
  createR2ClaimOptions,
  enqueueDeleteR2Object,
} from "./submission-helpers";

const createSchema = z.object({
  amount: z
    .number()
    .positive("Amount must be greater than 0")
    .multipleOf(0.01, "Amount must have at most 2 decimal places"),
  attachments: z.array(attachmentSchema),
  description: z.string().trim().optional(),
  id: z.string(),
  paymentMethod: z.string().trim().optional(),
  paymentReference: z.string().trim().optional(),
  transactionDate: z.number(),
  vendorPaymentId: z.string(),
});

const fk = (id: string) => ({ vendorPaymentTransactionId: id });
const toCents = (v: number | string) => Math.round(Number(v) * 100);

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}
type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];
abstract class BivariantZeroRun {
  abstract bivarianceHack(query: unknown): Promise<unknown>;
}
type ZeroRunFn = BivariantZeroRun["bivarianceHack"];

interface VendorPaymentTransactionTx {
  mutate: {
    vendorPayment: {
      update: ZeroMutationFn;
    };
  };
  run: ZeroRunFn;
}

async function assertWithinPaymentCap(
  tx: VendorPaymentTransactionTx,
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
  tx: VendorPaymentTransactionTx,
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
  const currentStatus = (current as { status?: string } | undefined)?.status;
  if (
    current &&
    currentStatus !== newStatus &&
    currentStatus !== "pending" &&
    currentStatus !== "rejected" &&
    !INVOICE_LOCKED_STATUSES.has(currentStatus ?? "")
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
  approve: defineMutator(
    z.object({
      id: z.string(),
      note: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;
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
        reviewedAt: now,
        reviewedBy: userId,
        status: "approved",
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
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-vpt-approved",
              {
                amount: Number(entity.amount),
                note: args.note,
                submitterId,
                transactionId,
                vendorPaymentId: vpId,
                vendorPaymentTitle: vpTitle,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            mutator: "approveVendorPaymentTransaction",
            transactionId,
            vendorPaymentId: vpId,
          },
        });

        // Notify VP submitter when all payments are received
        if (newVpStatus === "paid") {
          ctx.asyncTasks?.push({
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-vp-fully-paid",
                {
                  submitterId: vpOwnerId,
                  title: vpTitle,
                  vendorPaymentId: vpId,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              mutator: "approveVendorPaymentTransaction:vpFullyPaid",
              vendorPaymentId: vpId,
            },
          });
        }
      }
    }
  ),
  create: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    assertHasPermission(ctx, "requests.record_payment");
    const { userId } = ctx;

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
      amount: args.amount,
      createdAt: now,
      description: args.description,
      id: args.id,
      paymentMethod: args.paymentMethod,
      paymentReference: args.paymentReference,
      rejectionReason: null,
      reviewedAt: isApprover ? now : null,
      reviewedBy: isApprover ? userId : null,
      status: isApprover ? "approved" : "pending",
      transactionDate: args.transactionDate,
      updatedAt: now,
      userId,
      vendorPaymentId: args.vendorPaymentId,
    });

    await Promise.all(
      args.attachments.map(async (att) => {
        await tx.mutate.vendorPaymentTransactionAttachment.insert({
          ...buildClaimedAttachmentInsert(
            att,
            now,
            createR2ClaimOptions(ctx, tx.location, {
              durablePrefix: `vendor-payment-transactions/${args.id}`,
              subfolder: "attachments",
            })
          ),
          ...fk(args.id),
        });
      })
    );

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
            fn: async () => {
              const { enqueue } = await import("@pi-dash/jobs/enqueue");
              await enqueue(
                "notify-vp-fully-paid",
                {
                  submitterId: vpOwnerId,
                  title: vpTitle,
                  vendorPaymentId: vpId,
                },
                { traceId: ctx.traceId }
              );
            },
            meta: {
              mutator: "createVendorPaymentTransaction:vpFullyPaid",
              vendorPaymentId: vpId,
            },
          });
        }
      } else {
        const submitter = await tx.run(zql.user.where("id", userId).one());
        const submitterName = submitter?.name;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-vpt-submitted",
              {
                amount: args.amount,
                submitterName: submitterName ?? "Someone",
                transactionId,
                vendorPaymentId: vpId,
                vendorPaymentTitle: vpTitle,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            mutator: "createVendorPaymentTransaction",
            transactionId,
            userId,
            vendorPaymentId: vpId,
          },
        });
      }
    }
  }),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const { userId } = ctx;
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
      await Promise.all(
        attachments.map(async (att) => {
          enqueueDeleteR2Object(ctx, tx.location, att.objectKey, {
            mutator: "vendorPaymentTransaction.delete",
            transactionId: args.id,
          });
          await tx.mutate.vendorPaymentTransactionAttachment.delete({
            id: att.id,
          });
        })
      );

      // Delete history
      const history = await tx.run(
        zql.vendorPaymentTransactionHistory.where(
          "vendorPaymentTransactionId",
          args.id
        )
      );
      await Promise.all(
        history.map(async (h) => {
          await tx.mutate.vendorPaymentTransactionHistory.delete({ id: h.id });
        })
      );

      await tx.mutate.vendorPaymentTransaction.delete({ id: args.id });

      // Recalculate parent VP status after deletion
      await recalculateParentStatus(tx, vpId, Date.now());
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;
      const entity = await tx.run(
        zql.vendorPaymentTransaction.where("id", args.id).one()
      );
      assertEntityExists(entity, "Transaction");
      assertPending(entity, "transaction", "rejected");
      const vpId = entity.vendorPaymentId as string;

      const now = Date.now();

      await tx.mutate.vendorPaymentTransaction.update({
        id: args.id,
        rejectionReason: args.reason,
        reviewedAt: now,
        reviewedBy: userId,
        status: "rejected",
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
        const vpTitle = vendorPayment?.title as string;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-vpt-rejected",
              {
                amount: Number(entity.amount),
                reason: args.reason,
                submitterId,
                transactionId,
                vendorPaymentId: vpId,
                vendorPaymentTitle: vpTitle,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            mutator: "rejectVendorPaymentTransaction",
            transactionId,
            vendorPaymentId: vpId,
          },
        });
      }
    }
  ),

  update: defineMutator(
    createSchema.omit({ vendorPaymentId: true }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const { userId } = ctx;
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
        amount: args.amount,
        description: args.description,
        id: args.id,
        paymentMethod: args.paymentMethod,
        paymentReference: args.paymentReference,
        transactionDate: args.transactionDate,
        updatedAt: now,
      });

      // Replace attachments
      const existingAtts = await tx.run(
        zql.vendorPaymentTransactionAttachment.where(
          "vendorPaymentTransactionId",
          args.id
        )
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
              mutator: "vendorPaymentTransaction.update",
              transactionId: args.id,
            });
          }
          await tx.mutate.vendorPaymentTransactionAttachment.delete({
            id: att.id,
          });
        })
      );
      await Promise.all(
        args.attachments.map(async (att) => {
          await tx.mutate.vendorPaymentTransactionAttachment.insert({
            ...buildClaimedAttachmentInsert(
              att,
              now,
              createR2ClaimOptions(ctx, tx.location, {
                durablePrefix: `vendor-payment-transactions/${args.id}`,
                existingObjectKeys,
                subfolder: "attachments",
              })
            ),
            ...fk(args.id),
          });
        })
      );

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
};
