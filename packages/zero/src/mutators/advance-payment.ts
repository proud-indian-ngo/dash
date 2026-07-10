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
  assertCanDelete,
  assertCanModify,
  assertEntityExists,
  assertPending,
  buildHistoryInsert,
  claimUploadedR2ObjectKey,
  createR2ClaimOptions,
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
  id: z.string(),
  lineItems: z.array(lineItemSchema),
  title: z.string().min(1),
});

const fk = (id: string) => ({ advancePaymentId: id });

const entityFields = (args: z.infer<typeof createSchema>) => ({
  bankAccountIfscCode: args.bankAccountIfscCode,
  bankAccountName: args.bankAccountName,
  bankAccountNumber: args.bankAccountNumber,
  city: args.city,
});

export const advancePaymentMutators = {
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
      const entity = await tx.run(
        zql.advancePayment.where("id", args.id).one()
      );
      assertEntityExists(entity, "Advance payment");
      assertPending(entity, "advance payment", "approved", canEditAnyStatus);

      const now = Date.now();
      const approvalScreenshotKey = args.approvalScreenshotKey
        ? claimUploadedR2ObjectKey(
            args.approvalScreenshotKey,
            createR2ClaimOptions(ctx, tx.location, {
              durablePrefix: `advance-payments/${args.id}/approval-screenshots`,
              subfolder: "approval-screenshots",
            })
          )
        : undefined;

      if (
        entity.approvalScreenshotKey &&
        entity.approvalScreenshotKey !== approvalScreenshotKey
      ) {
        enqueueDeleteR2Object(ctx, tx.location, entity.approvalScreenshotKey, {
          advancePaymentId: args.id,
          mutator: "advancePayment.approve:replaceApprovalScreenshot",
        });
      }

      await tx.mutate.advancePayment.update({
        approvalScreenshotKey,
        id: args.id,
        rejectionReason: null,
        reviewedAt: now,
        reviewedBy: userId,
        status: "approved",
        updatedAt: now,
      });

      await tx.mutate.advancePaymentHistory.insert({
        ...buildHistoryInsert(userId, "approved", now, args.note),
        advancePaymentId: args.id,
      });

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const { id } = args;
        const { note } = args;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-advance-payment-approved",
              {
                advancePaymentId: id,
                note,
                submitterId: ownerId,
                title,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            advancePaymentId: id,
            mutator: "approveAdvancePayment",
            submitterId: ownerId,
            title,
          },
        });
      }
    }
  ),
  create: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    assertHasPermission(ctx, "requests.create");
    const { userId } = ctx;
    const now = Date.now();

    await tx.mutate.advancePayment.insert({
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
          tx.mutate.advancePaymentAttachment.insert(data),
        insertHistory: (data) => tx.mutate.advancePaymentHistory.insert(data),
        insertLineItem: (data) => tx.mutate.advancePaymentLineItem.insert(data),
      },
      createR2ClaimOptions(ctx, tx.location, {
        durablePrefix: `advance-payments/${args.id}`,
        subfolder: "attachments",
      })
    );

    if (tx.location === "server") {
      const advancePaymentId = args.id;
      const { title } = args;
      const submitter = await tx.run(zql.user.where("id", userId).one());
      const submitterName = submitter?.name ?? "Someone";
      ctx.asyncTasks?.push({
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs/enqueue");
          await enqueue(
            "notify-advance-payment-submitted",
            {
              advancePaymentId,
              submitterName,
              title,
            },
            { traceId: ctx.traceId }
          );
        },
        meta: {
          advancePaymentId,
          mutator: "createAdvancePayment",
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
      const entity = await tx.run(
        zql.advancePayment.where("id", args.id).one()
      );
      assertEntityExists(entity, "Advance payment");
      assertCanDelete(entity, userId, can(ctx, "requests.delete_all"));
      enqueueDeleteR2Object(ctx, tx.location, entity.approvalScreenshotKey, {
        advancePaymentId: args.id,
        mutator: "advancePayment.delete:approvalScreenshot",
      });

      await deleteAllRelations({
        deleteAttachment: (data) =>
          tx.mutate.advancePaymentAttachment.delete(data),
        deleteHistory: (data) => tx.mutate.advancePaymentHistory.delete(data),
        deleteLineItem: (data) => tx.mutate.advancePaymentLineItem.delete(data),
        onDeleteAttachmentObjectKey: (key) =>
          enqueueDeleteR2Object(ctx, tx.location, key, {
            advancePaymentId: args.id,
            mutator: "advancePayment.delete",
          }),
        queryAttachments: () =>
          tx.run(
            zql.advancePaymentAttachment.where("advancePaymentId", args.id)
          ),
        queryHistory: () =>
          tx.run(zql.advancePaymentHistory.where("advancePaymentId", args.id)),
        queryLineItems: () =>
          tx.run(zql.advancePaymentLineItem.where("advancePaymentId", args.id)),
      });

      await tx.mutate.advancePayment.delete({ id: args.id });
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const { userId } = ctx;
      const canEditAnyStatus = can(ctx, "requests.edit_all_statuses");
      const entity = await tx.run(
        zql.advancePayment.where("id", args.id).one()
      );
      assertEntityExists(entity, "Advance payment");
      assertPending(entity, "advance payment", "rejected", canEditAnyStatus);

      const now = Date.now();
      await tx.mutate.advancePayment.update({
        id: args.id,
        rejectionReason: args.reason,
        reviewedAt: now,
        reviewedBy: userId,
        status: "rejected",
        updatedAt: now,
      });

      await tx.mutate.advancePaymentHistory.insert({
        ...buildHistoryInsert(userId, "rejected", now, args.reason),
        advancePaymentId: args.id,
      });

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const { id } = args;
        const { reason } = args;
        ctx.asyncTasks?.push({
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue(
              "notify-advance-payment-rejected",
              {
                advancePaymentId: id,
                reason,
                submitterId: ownerId,
                title,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: {
            advancePaymentId: id,
            mutator: "rejectAdvancePayment",
            reason,
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
      const entity = await tx.run(
        zql.advancePayment.where("id", args.id).one()
      );
      assertEntityExists(entity, "Advance payment");

      if (entity.status === "pending") {
        throw new Error("Advance payment is already pending");
      }

      const now = Date.now();
      enqueueDeleteR2Object(ctx, tx.location, entity.approvalScreenshotKey, {
        advancePaymentId: args.id,
        mutator: "advancePayment.resetToPending",
      });

      await tx.mutate.advancePayment.update({
        approvalScreenshotKey: null,
        id: args.id,
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        status: "pending",
        updatedAt: now,
      });

      await tx.mutate.advancePaymentHistory.insert({
        ...buildHistoryInsert(userId, "submitted", now, "Reset to pending"),
        advancePaymentId: args.id,
      });
    }
  ),

  update: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const { userId } = ctx;
    const canEditAnyStatus = can(ctx, "requests.edit_all_statuses");
    const entity = await tx.run(zql.advancePayment.where("id", args.id).one());
    assertEntityExists(entity, "Advance payment");
    assertCanModify(
      entity,
      userId,
      can(ctx, "requests.edit_all") || canEditAnyStatus,
      "advance payment",
      canEditAnyStatus,
      can(ctx, "requests.edit_own")
    );

    const now = Date.now();

    await tx.mutate.advancePayment.update({
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
          tx.mutate.advancePaymentAttachment.delete(data),
        deleteLineItem: (data) => tx.mutate.advancePaymentLineItem.delete(data),
        insertAttachment: (data) =>
          tx.mutate.advancePaymentAttachment.insert(data),
        insertHistory: (data) => tx.mutate.advancePaymentHistory.insert(data),
        insertLineItem: (data) => tx.mutate.advancePaymentLineItem.insert(data),
        onDeleteAttachmentObjectKey: (key) =>
          enqueueDeleteR2Object(ctx, tx.location, key, {
            advancePaymentId: args.id,
            mutator: "advancePayment.update",
          }),
        queryAttachments: () =>
          tx.run(
            zql.advancePaymentAttachment.where("advancePaymentId", args.id)
          ),
        queryLineItems: () =>
          tx.run(zql.advancePaymentLineItem.where("advancePaymentId", args.id)),
      },
      createR2ClaimOptions(ctx, tx.location, {
        durablePrefix: `advance-payments/${args.id}`,
        subfolder: "attachments",
      })
    );
  }),
};
