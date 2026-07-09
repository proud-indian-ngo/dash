import {
  cityValues,
  VOUCHER_AMOUNT_THRESHOLD,
} from "@pi-dash/shared/constants";
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
  assertCanDelete,
  assertCanModify,
  assertEntityExists,
  assertPending,
  buildHistoryInsert,
  claimUploadedR2ObjectKey,
  deleteAllRelations,
  enqueueDeleteR2Object,
  insertRelations,
  replaceRelations,
} from "./submission-helpers";

export const createSchema = z.object({
  attachments: z.array(attachmentSchema),
  bankAccountIfscCode: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  city: z.enum(cityValues).optional(),
  eventId: z.string().optional(),
  expenseDate: z
    .number()
    .refine((n) => n <= Date.now(), "Expense date cannot be in the future"),
  id: z.string(),
  lineItems: z.array(lineItemSchema),
  title: z.string().min(1),
});

type LineItems = z.infer<typeof createSchema>["lineItems"];

const fk = (id: string) => ({ reimbursementId: id });

function withVoucherFields<T extends { id: string }>(
  lineItems: LineItems,
  insertFn: (data: T) => Promise<unknown>
) {
  const byId = new Map(lineItems.map((li) => [li.id, li]));
  return (data: T) => {
    const src = byId.get(data.id);
    return insertFn({
      ...data,
      generateVoucher: src?.generateVoucher,
      voucherAttachmentId: null,
    });
  };
}

const entityFields = (args: z.infer<typeof createSchema>) => ({
  bankAccountIfscCode: args.bankAccountIfscCode,
  bankAccountName: args.bankAccountName,
  bankAccountNumber: args.bankAccountNumber,
  city: args.city,
  eventId: args.eventId,
  expenseDate: args.expenseDate,
});

export const reimbursementMutators = {
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
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");
      assertPending(entity, "reimbursement", "approved", canEditAnyStatus);

      const now = Date.now();
      const approvalScreenshotKey = args.approvalScreenshotKey
        ? await claimUploadedR2ObjectKey(args.approvalScreenshotKey, {
            durablePrefix: `reimbursements/${args.id}/approval-screenshots`,
            subfolder: "approval-screenshots",
            txLocation: tx.location,
            userId,
          })
        : undefined;

      await tx.mutate.reimbursement.update({
        approvalScreenshotKey,
        id: args.id,
        rejectionReason: null,
        reviewedAt: now,
        reviewedBy: userId,
        status: "approved",
        updatedAt: now,
      });

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(userId, "approved", now, args.note),
        reimbursementId: args.id,
      });

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const { id } = args;
        const { note } = args;
        const approverUserId = userId;

        const lineItems = await tx.run(
          zql.reimbursementLineItem.where("reimbursementId", args.id)
        );
        const voucherLineItems = lineItems.filter(
          (li) =>
            li.generateVoucher && Number(li.amount) <= VOUCHER_AMOUNT_THRESHOLD
        );

        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-reimbursement-approved",
              {
                approvalScreenshotKey,
                note,
                reimbursementId: id,
                submitterId: ownerId,
                title,
              },
              { traceId: ctx.traceId }
            );
            await Promise.all(
              voucherLineItems.map(async (li) => {
                await enqueue(
                  "generate-cash-voucher",
                  {
                    approverUserId,
                    lineItemId: li.id,
                    reimbursementId: id,
                  },
                  {
                    singletonKey: `voucher-${li.id}`,
                    traceId: ctx.traceId,
                  }
                );
              })
            );
          },
          meta: {
            mutator: "approveReimbursement",
            reimbursementId: id,
            submitterId: ownerId,
            title,
          },
        });
      }
    }
  ),
  create: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const { userId } = ctx;
    const now = Date.now();

    await tx.mutate.reimbursement.insert({
      approvalScreenshotKey: null,
      createdAt: now,
      id: args.id,
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
      status: "pending",
      submittedAt: now,
      title: args.title,
      updatedAt: now,
      userId,
      ...entityFields(args),
    });

    await insertRelations(
      fk(args.id),
      args.lineItems,
      args.attachments,
      userId,
      "created",
      now,
      {
        insertAttachment: (data) =>
          tx.mutate.reimbursementAttachment.insert(data),
        insertHistory: (data) => tx.mutate.reimbursementHistory.insert(data),
        insertLineItem: withVoucherFields(args.lineItems, (data) =>
          tx.mutate.reimbursementLineItem.insert(data)
        ),
      },
      {
        durablePrefix: `reimbursements/${args.id}`,
        subfolder: "attachments",
        txLocation: tx.location,
        userId,
      }
    );

    if (tx.location === "server") {
      const reimbursementId = args.id;
      const { title } = args;
      const submitter = await tx.run(zql.user.where("id", userId).one());
      const submitterName = submitter?.name;
      ctx.asyncTasks?.push({
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs/enqueue");
          await enqueue(
            "notify-reimbursement-submitted",
            {
              reimbursementId,
              submitterName: submitterName ?? "Someone",
              title,
            },
            { traceId: ctx.traceId }
          );
        },
        meta: {
          mutator: "createReimbursement",
          reimbursementId,
          title,
          userId,
        },
      });
    }
  }),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const { userId } = ctx;
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");
      assertCanDelete(entity, userId, can(ctx, "requests.delete_all"));

      await deleteAllRelations({
        deleteAttachment: (data) =>
          tx.mutate.reimbursementAttachment.delete(data),
        deleteHistory: (data) => tx.mutate.reimbursementHistory.delete(data),
        deleteLineItem: (data) => tx.mutate.reimbursementLineItem.delete(data),
        onDeleteAttachmentObjectKey: (key) =>
          enqueueDeleteR2Object(ctx, tx.location, key, {
            mutator: "reimbursement.delete",
            reimbursementId: args.id,
          }),
        queryAttachments: () =>
          tx.run(zql.reimbursementAttachment.where("reimbursementId", args.id)),
        queryHistory: () =>
          tx.run(zql.reimbursementHistory.where("reimbursementId", args.id)),
        queryLineItems: () =>
          tx.run(zql.reimbursementLineItem.where("reimbursementId", args.id)),
      });

      await tx.mutate.reimbursement.delete({ id: args.id });
    }
  ),

  generateVoucher: defineMutator(
    z.object({ lineItemId: z.string(), reimbursementId: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;

      const entity = await tx.run(
        zql.reimbursement.where("id", args.reimbursementId).one()
      );
      assertEntityExists(entity, "Reimbursement");
      if (entity.status !== "approved") {
        throw new Error("Only approved reimbursements can have vouchers");
      }

      const lineItem = await tx.run(
        zql.reimbursementLineItem.where("id", args.lineItemId).one()
      );
      assertEntityExists(lineItem, "Line item");
      if (Number(lineItem.amount) > VOUCHER_AMOUNT_THRESHOLD) {
        throw new Error(
          `Vouchers can only be generated for items ≤ ₹${VOUCHER_AMOUNT_THRESHOLD}`
        );
      }

      if (tx.location === "server") {
        const { lineItemId } = args;
        const { reimbursementId } = args;
        const approverUserId = userId;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "generate-cash-voucher",
              {
                approverUserId,
                lineItemId,
                reimbursementId,
              },
              {
                singletonKey: `voucher-${lineItemId}`,
                traceId: ctx.traceId,
              }
            );
          },
          meta: {
            lineItemId,
            mutator: "generateVoucher",
            reimbursementId,
          },
        });
      }
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;
      const canEditAnyStatus = can(ctx, "requests.edit_all_statuses");
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");
      assertPending(entity, "reimbursement", "rejected", canEditAnyStatus);

      const now = Date.now();

      await tx.mutate.reimbursement.update({
        id: args.id,
        rejectionReason: args.reason,
        reviewedAt: now,
        reviewedBy: userId,
        status: "rejected",
        updatedAt: now,
      });

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(userId, "rejected", now, args.reason),
        reimbursementId: args.id,
      });

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const { id } = args;
        const { reason } = args;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-reimbursement-rejected",
              {
                reason,
                reimbursementId: id,
                submitterId: ownerId,
                title,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            mutator: "rejectReimbursement",
            reason,
            reimbursementId: id,
            submitterId: ownerId,
            title,
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
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");

      if (entity.status === "pending") {
        throw new Error("Reimbursement is already pending");
      }

      const now = Date.now();

      await tx.mutate.reimbursement.update({
        approvalScreenshotKey: null,
        id: args.id,
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        status: "pending",
        updatedAt: now,
      });

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(userId, "submitted", now, "Reset to pending"),
        reimbursementId: args.id,
      });
    }
  ),

  update: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const { userId } = ctx;
    const canEditAnyStatus = can(ctx, "requests.edit_all_statuses");
    const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
    assertEntityExists(entity, "Reimbursement");
    assertCanModify(
      entity,
      userId,
      can(ctx, "requests.edit_all") || canEditAnyStatus,
      "reimbursement",
      canEditAnyStatus,
      can(ctx, "requests.edit_own")
    );

    const now = Date.now();

    await tx.mutate.reimbursement.update({
      id: args.id,
      title: args.title,
      updatedAt: now,
      ...entityFields(args),
    });

    await replaceRelations(
      fk(args.id),
      args.lineItems,
      args.attachments,
      userId,
      now,
      {
        deleteAttachment: (data) =>
          tx.mutate.reimbursementAttachment.delete(data),
        deleteLineItem: (data) => tx.mutate.reimbursementLineItem.delete(data),
        insertAttachment: (data) =>
          tx.mutate.reimbursementAttachment.insert(data),
        insertHistory: (data) => tx.mutate.reimbursementHistory.insert(data),
        insertLineItem: withVoucherFields(args.lineItems, (data) =>
          tx.mutate.reimbursementLineItem.insert(data)
        ),
        onDeleteAttachmentObjectKey: (key) =>
          enqueueDeleteR2Object(ctx, tx.location, key, {
            mutator: "reimbursement.update",
            reimbursementId: args.id,
          }),
        queryAttachments: () =>
          tx.run(zql.reimbursementAttachment.where("reimbursementId", args.id)),
        queryLineItems: () =>
          tx.run(zql.reimbursementLineItem.where("reimbursementId", args.id)),
      },
      {
        durablePrefix: `reimbursements/${args.id}`,
        subfolder: "attachments",
        txLocation: tx.location,
        userId,
      }
    );
  }),
};
