import { cityValues } from "@pi-dash/db/schema/shared";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsAdmin, assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";
import {
  mutatorAttachmentSchema as attachmentSchema,
  mutatorLineItemSchema as lineItemSchema,
} from "../shared-schemas";
import { isDateOnOrBeforeToday } from "../validation";
import {
  buildAttachmentInsert,
  buildHistoryInsert,
  buildLineItemInsert,
} from "./submission-helpers";

export const reimbursementMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      title: z.string().min(1),
      city: z.enum(cityValues).optional(),
      expenseDate: z.string().refine(isDateOnOrBeforeToday),
      bankAccountName: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankAccountIfscCode: z.string().optional(),
      lineItems: z.array(lineItemSchema),
      attachments: z.array(attachmentSchema),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const userId = ctx.userId;
      const now = Date.now();

      await tx.mutate.reimbursement.insert({
        id: args.id,
        userId,
        title: args.title,
        city: args.city ?? null,
        expenseDate: args.expenseDate,
        status: "pending",
        rejectionReason: null,
        bankAccountName: args.bankAccountName ?? null,
        bankAccountNumber: args.bankAccountNumber ?? null,
        bankAccountIfscCode: args.bankAccountIfscCode ?? null,
        reviewedBy: null,
        reviewedAt: null,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      for (const item of args.lineItems) {
        await tx.mutate.reimbursementLineItem.insert({
          ...buildLineItemInsert(item, now),
          reimbursementId: args.id,
        });
      }

      for (const att of args.attachments) {
        await tx.mutate.reimbursementAttachment.insert({
          ...buildAttachmentInsert(att, now),
          reimbursementId: args.id,
        });
      }

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(userId, "created", now),
        reimbursementId: args.id,
      });

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
            const { getUserName, notifyReimbursementSubmitted } = await import(
              "@pi-dash/notifications"
            );
            const submitterName = (await getUserName(userId)) ?? "Unknown";
            await notifyReimbursementSubmitted({
              reimbursementId,
              title,
              submitterName,
            });
          },
        });
      }
    }
  ),

  update: defineMutator(
    z.object({
      id: z.string(),
      title: z.string().min(1),
      city: z.enum(cityValues).optional(),
      expenseDate: z.string().refine(isDateOnOrBeforeToday),
      bankAccountName: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankAccountIfscCode: z.string().optional(),
      lineItems: z.array(lineItemSchema),
      attachments: z.array(attachmentSchema),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const userId = ctx.userId;
      const reimbursement = await tx.run(
        zql.reimbursement.where("id", args.id).one()
      );

      if (!reimbursement) {
        throw new Error("Reimbursement not found");
      }

      const isAdmin = ctx.role === "admin";
      const isOwner = reimbursement.userId === userId;
      if (!(isAdmin || isOwner)) {
        throw new Error("Unauthorized");
      }

      if (reimbursement.status !== "pending") {
        throw new Error("Only pending reimbursements can be updated");
      }

      const now = Date.now();

      await tx.mutate.reimbursement.update({
        id: args.id,
        title: args.title,
        city: args.city ?? null,
        expenseDate: args.expenseDate,
        bankAccountName: args.bankAccountName ?? null,
        bankAccountNumber: args.bankAccountNumber ?? null,
        bankAccountIfscCode: args.bankAccountIfscCode ?? null,
        updatedAt: now,
      });

      const existingItems = await tx.run(
        zql.reimbursementLineItem.where("reimbursementId", args.id)
      );
      for (const item of existingItems) {
        await tx.mutate.reimbursementLineItem.delete({ id: item.id });
      }
      for (const item of args.lineItems) {
        await tx.mutate.reimbursementLineItem.insert({
          ...buildLineItemInsert(item, now),
          reimbursementId: args.id,
        });
      }

      const existingAtts = await tx.run(
        zql.reimbursementAttachment.where("reimbursementId", args.id)
      );
      for (const att of existingAtts) {
        await tx.mutate.reimbursementAttachment.delete({ id: att.id });
      }
      for (const att of args.attachments) {
        await tx.mutate.reimbursementAttachment.insert({
          ...buildAttachmentInsert(att, now),
          reimbursementId: args.id,
        });
      }

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(userId, "updated", now),
        reimbursementId: args.id,
      });
    }
  ),

  approve: defineMutator(
    z.object({ id: z.string(), note: z.string().optional() }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      const userId = ctx.userId;
      const reimbursement = await tx.run(
        zql.reimbursement.where("id", args.id).one()
      );
      if (!reimbursement) {
        throw new Error("Reimbursement not found");
      }
      if (reimbursement.status !== "pending") {
        throw new Error("Only pending reimbursements can be approved");
      }

      const now = Date.now();

      await tx.mutate.reimbursement.update({
        id: args.id,
        status: "approved",
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });

      await tx.mutate.reimbursementHistory.insert({
        ...buildHistoryInsert(userId, "approved", now, args.note),
        reimbursementId: args.id,
      });

      if (tx.location === "server") {
        const { title, userId: ownerId } = reimbursement;
        const id = args.id;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "approveReimbursement",
            reimbursementId: id,
            title,
            submitterId: ownerId,
          },
          fn: async () => {
            const { notifyReimbursementApproved } = await import(
              "@pi-dash/notifications"
            );
            await notifyReimbursementApproved({
              reimbursementId: id,
              title,
              submitterId: ownerId,
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
      const reimbursement = await tx.run(
        zql.reimbursement.where("id", args.id).one()
      );
      if (!reimbursement) {
        throw new Error("Reimbursement not found");
      }

      const isAdmin = ctx.role === "admin";
      const isOwner = reimbursement.userId === userId;
      if (!(isAdmin || (isOwner && reimbursement.status === "pending"))) {
        throw new Error("Unauthorized");
      }

      const lineItems = await tx.run(
        zql.reimbursementLineItem.where("reimbursementId", args.id)
      );
      for (const item of lineItems) {
        await tx.mutate.reimbursementLineItem.delete({ id: item.id });
      }

      const attachments = await tx.run(
        zql.reimbursementAttachment.where("reimbursementId", args.id)
      );
      for (const att of attachments) {
        await tx.mutate.reimbursementAttachment.delete({ id: att.id });
      }

      const history = await tx.run(
        zql.reimbursementHistory.where("reimbursementId", args.id)
      );
      for (const h of history) {
        await tx.mutate.reimbursementHistory.delete({ id: h.id });
      }

      await tx.mutate.reimbursement.delete({ id: args.id });
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      const userId = ctx.userId;
      const reimbursement = await tx.run(
        zql.reimbursement.where("id", args.id).one()
      );
      if (!reimbursement) {
        throw new Error("Reimbursement not found");
      }
      if (reimbursement.status !== "pending") {
        throw new Error("Only pending reimbursements can be rejected");
      }

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
        const { title, userId: ownerId } = reimbursement;
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
            const { notifyReimbursementRejected } = await import(
              "@pi-dash/notifications"
            );
            await notifyReimbursementRejected({
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
