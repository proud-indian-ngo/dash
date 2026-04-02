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
  deleteAllRelations,
  insertRelations,
  replaceRelations,
} from "./submission-helpers";

export const createSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  city: z.enum(cityValues).optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountIfscCode: z.string().optional(),
  lineItems: z.array(lineItemSchema),
  attachments: z.array(attachmentSchema),
});

const fk = (id: string) => ({ advancePaymentId: id });

const entityFields = (args: z.infer<typeof createSchema>) => ({
  city: args.city ?? null,
  bankAccountName: args.bankAccountName ?? null,
  bankAccountNumber: args.bankAccountNumber ?? null,
  bankAccountIfscCode: args.bankAccountIfscCode ?? null,
});

export const advancePaymentMutators = {
  create: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const userId = ctx.userId;
    const now = Date.now();

    await tx.mutate.advancePayment.insert({
      id: args.id,
      userId,
      title: args.title,
      status: "pending",
      rejectionReason: null,
      approvalScreenshotKey: null,
      reviewedBy: null,
      reviewedAt: null,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
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
        insertLineItem: (data) => tx.mutate.advancePaymentLineItem.insert(data),
        insertAttachment: (data) =>
          tx.mutate.advancePaymentAttachment.insert(data),
        insertHistory: (data) => tx.mutate.advancePaymentHistory.insert(data),
      }
    );

    if (tx.location === "server") {
      const advancePaymentId = args.id;
      const title = args.title;
      const submitter = await tx.run(zql.user.where("id", userId).one());
      const submitterName = submitter?.name ?? "Unknown";
      ctx.asyncTasks?.push({
        meta: {
          mutator: "createAdvancePayment",
          userId,
          advancePaymentId,
          title,
        },
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs/enqueue");
          await enqueue("notify-advance-payment-submitted", {
            advancePaymentId,
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
    const entity = await tx.run(zql.advancePayment.where("id", args.id).one());
    assertEntityExists(entity, "Advance payment");
    assertCanModify(
      entity,
      userId,
      can(ctx, "requests.edit_all"),
      "advance payment"
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
        insertLineItem: (data) => tx.mutate.advancePaymentLineItem.insert(data),
        insertAttachment: (data) =>
          tx.mutate.advancePaymentAttachment.insert(data),
        insertHistory: (data) => tx.mutate.advancePaymentHistory.insert(data),
        queryLineItems: () =>
          tx.run(zql.advancePaymentLineItem.where("advancePaymentId", args.id)),
        queryAttachments: () =>
          tx.run(
            zql.advancePaymentAttachment.where("advancePaymentId", args.id)
          ),
        deleteLineItem: (data) => tx.mutate.advancePaymentLineItem.delete(data),
        deleteAttachment: (data) =>
          tx.mutate.advancePaymentAttachment.delete(data),
      }
    );
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
      const entity = await tx.run(
        zql.advancePayment.where("id", args.id).one()
      );
      assertEntityExists(entity, "Advance payment");
      assertPending(entity, "advance payment", "approved");

      const now = Date.now();

      await tx.mutate.advancePayment.update({
        id: args.id,
        status: "approved",
        approvalScreenshotKey: args.approvalScreenshotKey ?? null,
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });

      await tx.mutate.advancePaymentHistory.insert({
        ...buildHistoryInsert(userId, "approved", now, args.note),
        advancePaymentId: args.id,
      });

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const id = args.id;
        const note = args.note;
        const approvalScreenshotKey = args.approvalScreenshotKey;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "approveAdvancePayment",
            advancePaymentId: id,
            title,
            submitterId: ownerId,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue("notify-advance-payment-approved", {
              advancePaymentId: id,
              title,
              submitterId: ownerId,
              note,
              approvalScreenshotKey,
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
        zql.advancePayment.where("id", args.id).one()
      );
      assertEntityExists(entity, "Advance payment");
      assertCanDelete(entity, userId, can(ctx, "requests.delete_all"));

      await deleteAllRelations({
        queryLineItems: () =>
          tx.run(zql.advancePaymentLineItem.where("advancePaymentId", args.id)),
        queryAttachments: () =>
          tx.run(
            zql.advancePaymentAttachment.where("advancePaymentId", args.id)
          ),
        queryHistory: () =>
          tx.run(zql.advancePaymentHistory.where("advancePaymentId", args.id)),
        deleteLineItem: (data) => tx.mutate.advancePaymentLineItem.delete(data),
        deleteAttachment: (data) =>
          tx.mutate.advancePaymentAttachment.delete(data),
        deleteHistory: (data) => tx.mutate.advancePaymentHistory.delete(data),
      });

      await tx.mutate.advancePayment.delete({ id: args.id });
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const userId = ctx.userId;
      const entity = await tx.run(
        zql.advancePayment.where("id", args.id).one()
      );
      assertEntityExists(entity, "Advance payment");
      assertPending(entity, "advance payment", "rejected");

      const now = Date.now();

      await tx.mutate.advancePayment.update({
        id: args.id,
        status: "rejected",
        rejectionReason: args.reason,
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });

      await tx.mutate.advancePaymentHistory.insert({
        ...buildHistoryInsert(userId, "rejected", now, args.reason),
        advancePaymentId: args.id,
      });

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const id = args.id;
        const reason = args.reason;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "rejectAdvancePayment",
            advancePaymentId: id,
            title,
            submitterId: ownerId,
            reason,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
            await enqueue("notify-advance-payment-rejected", {
              advancePaymentId: id,
              title,
              submitterId: ownerId,
              reason,
            });
          },
        });
      }
    }
  ),
};
