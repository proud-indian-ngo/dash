import { cityValues } from "@pi-dash/db/schema/shared";
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
  expenseDate: z
    .number()
    .refine((n) => n <= Date.now(), "Expense date cannot be in the future"),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankAccountIfscCode: z.string().optional(),
  lineItems: z.array(lineItemSchema),
  attachments: z.array(attachmentSchema),
});

const fk = (id: string) => ({ reimbursementId: id });

const entityFields = (args: z.infer<typeof createSchema>) => ({
  city: args.city ?? null,
  expenseDate: args.expenseDate,
  bankAccountName: args.bankAccountName ?? null,
  bankAccountNumber: args.bankAccountNumber ?? null,
  bankAccountIfscCode: args.bankAccountIfscCode ?? null,
});

export const reimbursementMutators = {
  create: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const userId = ctx.userId;
    const now = Date.now();

    await tx.mutate.reimbursement.insert({
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
        insertLineItem: (data) => tx.mutate.reimbursementLineItem.insert(data),
        insertAttachment: (data) =>
          tx.mutate.reimbursementAttachment.insert(data),
        insertHistory: (data) => tx.mutate.reimbursementHistory.insert(data),
      }
    );

    if (tx.location === "server") {
      const reimbursementId = args.id;
      const title = args.title;
      ctx.asyncTasks?.push({
        meta: {
          mutator: "createReimbursement",
          userId,
          reimbursementId,
          title,
        },
        fn: async () => {
          const { enqueue } = await import("@pi-dash/jobs");
          const { getUserName } = await import("@pi-dash/notifications");
          const submitterName = (await getUserName(userId)) ?? "Unknown";
          await enqueue("notify-reimbursement-submitted", {
            reimbursementId,
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
    const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
    assertEntityExists(entity, "Reimbursement");
    assertCanModify(
      entity,
      userId,
      can(ctx, "requests.edit_all"),
      "reimbursement"
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
        insertLineItem: (data) => tx.mutate.reimbursementLineItem.insert(data),
        insertAttachment: (data) =>
          tx.mutate.reimbursementAttachment.insert(data),
        insertHistory: (data) => tx.mutate.reimbursementHistory.insert(data),
        queryLineItems: () =>
          tx.run(zql.reimbursementLineItem.where("reimbursementId", args.id)),
        queryAttachments: () =>
          tx.run(zql.reimbursementAttachment.where("reimbursementId", args.id)),
        deleteLineItem: (data) => tx.mutate.reimbursementLineItem.delete(data),
        deleteAttachment: (data) =>
          tx.mutate.reimbursementAttachment.delete(data),
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
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");
      assertPending(entity, "reimbursement", "approved");

      const now = Date.now();

      await tx.mutate.reimbursement.update({
        id: args.id,
        status: "approved",
        approvalScreenshotKey: args.approvalScreenshotKey ?? null,
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(userId, "approved", now, args.note),
        reimbursementId: args.id,
      });

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const id = args.id;
        const note = args.note;
        const approvalScreenshotKey = args.approvalScreenshotKey;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "approveReimbursement",
            reimbursementId: id,
            title,
            submitterId: ownerId,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs");
            await enqueue("notify-reimbursement-approved", {
              reimbursementId: id,
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
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");
      assertCanDelete(entity, userId, can(ctx, "requests.delete_all"));

      await deleteAllRelations({
        queryLineItems: () =>
          tx.run(zql.reimbursementLineItem.where("reimbursementId", args.id)),
        queryAttachments: () =>
          tx.run(zql.reimbursementAttachment.where("reimbursementId", args.id)),
        queryHistory: () =>
          tx.run(zql.reimbursementHistory.where("reimbursementId", args.id)),
        deleteLineItem: (data) => tx.mutate.reimbursementLineItem.delete(data),
        deleteAttachment: (data) =>
          tx.mutate.reimbursementAttachment.delete(data),
        deleteHistory: (data) => tx.mutate.reimbursementHistory.delete(data),
      });

      await tx.mutate.reimbursement.delete({ id: args.id });
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const userId = ctx.userId;
      const entity = await tx.run(zql.reimbursement.where("id", args.id).one());
      assertEntityExists(entity, "Reimbursement");
      assertPending(entity, "reimbursement", "rejected");

      const now = Date.now();

      await tx.mutate.reimbursement.update({
        id: args.id,
        status: "rejected",
        rejectionReason: args.reason,
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(userId, "rejected", now, args.reason),
        reimbursementId: args.id,
      });

      if (tx.location === "server") {
        const { title, userId: ownerId } = entity;
        const id = args.id;
        const reason = args.reason;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "rejectReimbursement",
            reimbursementId: id,
            title,
            submitterId: ownerId,
            reason,
          },
          fn: async () => {
            const { enqueue } = await import("@pi-dash/jobs");
            await enqueue("notify-reimbursement-rejected", {
              reimbursementId: id,
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
