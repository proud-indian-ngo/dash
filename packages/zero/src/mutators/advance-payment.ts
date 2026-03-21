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
import {
  buildAttachmentInsert,
  buildHistoryInsert,
  buildLineItemInsert,
} from "./submission-helpers";

export const advancePaymentMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      title: z.string().min(1),
      city: z.enum(cityValues).optional(),
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

      await tx.mutate.advancePayment.insert({
        id: args.id,
        userId,
        title: args.title,
        city: args.city ?? null,
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
        await tx.mutate.advancePaymentLineItem.insert({
          ...buildLineItemInsert(item, now),
          advancePaymentId: args.id,
        });
      }

      for (const att of args.attachments) {
        await tx.mutate.advancePaymentAttachment.insert({
          ...buildAttachmentInsert(att, now),
          advancePaymentId: args.id,
        });
      }

      await tx.mutate.advancePaymentHistory.insert({
        ...buildHistoryInsert(userId, "created", now),
        advancePaymentId: args.id,
      });

      if (tx.location === "server") {
        const advancePaymentId = args.id;
        const title = args.title;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "createAdvancePayment",
            userId,
            advancePaymentId,
            title,
          },
          fn: async () => {
            const { getUserName, notifyAdvancePaymentSubmitted } = await import(
              "@pi-dash/notifications"
            );
            const submitterName = (await getUserName(userId)) ?? "Unknown";
            await notifyAdvancePaymentSubmitted({
              advancePaymentId,
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
      bankAccountName: z.string().optional(),
      bankAccountNumber: z.string().optional(),
      bankAccountIfscCode: z.string().optional(),
      lineItems: z.array(lineItemSchema),
      attachments: z.array(attachmentSchema),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const userId = ctx.userId;
      const advancePayment = await tx.run(
        zql.advancePayment.where("id", args.id).one()
      );

      if (!advancePayment) {
        throw new Error("Advance payment not found");
      }

      const isAdmin = ctx.role === "admin";
      const isOwner = advancePayment.userId === userId;
      if (!(isAdmin || isOwner)) {
        throw new Error("Unauthorized");
      }

      if (advancePayment.status !== "pending") {
        throw new Error("Only pending advance payments can be updated");
      }

      const now = Date.now();

      await tx.mutate.advancePayment.update({
        id: args.id,
        title: args.title,
        city: args.city ?? null,
        bankAccountName: args.bankAccountName ?? null,
        bankAccountNumber: args.bankAccountNumber ?? null,
        bankAccountIfscCode: args.bankAccountIfscCode ?? null,
        updatedAt: now,
      });

      const existingItems = await tx.run(
        zql.advancePaymentLineItem.where("advancePaymentId", args.id)
      );
      for (const item of existingItems) {
        await tx.mutate.advancePaymentLineItem.delete({ id: item.id });
      }
      for (const item of args.lineItems) {
        await tx.mutate.advancePaymentLineItem.insert({
          ...buildLineItemInsert(item, now),
          advancePaymentId: args.id,
        });
      }

      const existingAtts = await tx.run(
        zql.advancePaymentAttachment.where("advancePaymentId", args.id)
      );
      for (const att of existingAtts) {
        await tx.mutate.advancePaymentAttachment.delete({ id: att.id });
      }
      for (const att of args.attachments) {
        await tx.mutate.advancePaymentAttachment.insert({
          ...buildAttachmentInsert(att, now),
          advancePaymentId: args.id,
        });
      }

      await tx.mutate.advancePaymentHistory.insert({
        ...buildHistoryInsert(userId, "updated", now),
        advancePaymentId: args.id,
      });
    }
  ),

  approve: defineMutator(
    z.object({ id: z.string(), note: z.string().optional() }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      const userId = ctx.userId;
      const advancePayment = await tx.run(
        zql.advancePayment.where("id", args.id).one()
      );
      if (!advancePayment) {
        throw new Error("Advance payment not found");
      }
      if (advancePayment.status !== "pending") {
        throw new Error("Only pending advance payments can be approved");
      }

      const now = Date.now();

      await tx.mutate.advancePayment.update({
        id: args.id,
        status: "approved",
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });

      await tx.mutate.advancePaymentHistory.insert({
        ...buildHistoryInsert(userId, "approved", now, args.note),
        advancePaymentId: args.id,
      });

      if (tx.location === "server") {
        const { title, userId: ownerId } = advancePayment;
        const id = args.id;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "approveAdvancePayment",
            advancePaymentId: id,
            title,
            submitterId: ownerId,
          },
          fn: async () => {
            const { notifyAdvancePaymentApproved } = await import(
              "@pi-dash/notifications"
            );
            await notifyAdvancePaymentApproved({
              advancePaymentId: id,
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
      const advancePayment = await tx.run(
        zql.advancePayment.where("id", args.id).one()
      );
      if (!advancePayment) {
        throw new Error("Advance payment not found");
      }

      const isAdmin = ctx.role === "admin";
      const isOwner = advancePayment.userId === userId;
      if (!(isAdmin || (isOwner && advancePayment.status === "pending"))) {
        throw new Error("Unauthorized");
      }

      const lineItems = await tx.run(
        zql.advancePaymentLineItem.where("advancePaymentId", args.id)
      );
      for (const item of lineItems) {
        await tx.mutate.advancePaymentLineItem.delete({ id: item.id });
      }

      const attachments = await tx.run(
        zql.advancePaymentAttachment.where("advancePaymentId", args.id)
      );
      for (const att of attachments) {
        await tx.mutate.advancePaymentAttachment.delete({ id: att.id });
      }

      const history = await tx.run(
        zql.advancePaymentHistory.where("advancePaymentId", args.id)
      );
      for (const h of history) {
        await tx.mutate.advancePaymentHistory.delete({ id: h.id });
      }

      await tx.mutate.advancePayment.delete({ id: args.id });
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      const userId = ctx.userId;
      const advancePayment = await tx.run(
        zql.advancePayment.where("id", args.id).one()
      );
      if (!advancePayment) {
        throw new Error("Advance payment not found");
      }
      if (advancePayment.status !== "pending") {
        throw new Error("Only pending advance payments can be rejected");
      }

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
        const { title, userId: ownerId } = advancePayment;
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
            const { notifyAdvancePaymentRejected } = await import(
              "@pi-dash/notifications"
            );
            await notifyAdvancePaymentRejected({
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
