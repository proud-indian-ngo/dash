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

export const vendorPaymentMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      vendorId: z.string(),
      title: z.string().min(1),
      invoiceNumber: z.string().optional(),
      invoiceDate: z.string().min(1),
      lineItems: z.array(lineItemSchema),
      attachments: z.array(attachmentSchema),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const userId = ctx.userId;

      const vendor = await tx.run(zql.vendor.where("id", args.vendorId).one());
      if (!vendor) {
        throw new Error("Vendor not found");
      }
      if (vendor.status !== "approved") {
        throw new Error("Vendor is not approved");
      }

      const now = Date.now();

      await tx.mutate.vendorPayment.insert({
        id: args.id,
        userId,
        vendorId: args.vendorId,
        title: args.title,
        invoiceNumber: args.invoiceNumber ?? null,
        invoiceDate: args.invoiceDate,
        status: "pending",
        rejectionReason: null,
        approvalScreenshotKey: null,
        reviewedBy: null,
        reviewedAt: null,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      for (const item of args.lineItems) {
        await tx.mutate.vendorPaymentLineItem.insert({
          ...buildLineItemInsert(item, now),
          vendorPaymentId: args.id,
        });
      }

      for (const att of args.attachments) {
        await tx.mutate.vendorPaymentAttachment.insert({
          ...buildAttachmentInsert(att, now),
          vendorPaymentId: args.id,
        });
      }

      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "created", now),
        vendorPaymentId: args.id,
      });

      if (tx.location === "server") {
        const vendorPaymentId = args.id;
        const title = args.title;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "createVendorPayment",
            userId,
            vendorPaymentId,
            title,
          },
          fn: async () => {
            const { getUserName, notifyVendorPaymentSubmitted } = await import(
              "@pi-dash/notifications"
            );
            const submitterName = (await getUserName(userId)) ?? "Unknown";
            await notifyVendorPaymentSubmitted({
              vendorPaymentId,
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
      vendorId: z.string(),
      title: z.string().min(1),
      invoiceNumber: z.string().optional(),
      invoiceDate: z.string().min(1),
      lineItems: z.array(lineItemSchema),
      attachments: z.array(attachmentSchema),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const userId = ctx.userId;
      const vendorPayment = await tx.run(
        zql.vendorPayment.where("id", args.id).one()
      );

      if (!vendorPayment) {
        throw new Error("Vendor payment not found");
      }

      const isAdmin = ctx.role === "admin";
      const isOwner = vendorPayment.userId === userId;
      if (!(isAdmin || isOwner)) {
        throw new Error("Unauthorized");
      }

      if (vendorPayment.status !== "pending") {
        throw new Error("Only pending vendor payments can be updated");
      }

      const vendor = await tx.run(zql.vendor.where("id", args.vendorId).one());
      if (!vendor) {
        throw new Error("Vendor not found");
      }
      if (vendor.status !== "approved") {
        throw new Error("Vendor is not approved");
      }

      const now = Date.now();

      await tx.mutate.vendorPayment.update({
        id: args.id,
        vendorId: args.vendorId,
        title: args.title,
        invoiceNumber: args.invoiceNumber ?? null,
        invoiceDate: args.invoiceDate,
        updatedAt: now,
      });

      const existingItems = await tx.run(
        zql.vendorPaymentLineItem.where("vendorPaymentId", args.id)
      );
      for (const item of existingItems) {
        await tx.mutate.vendorPaymentLineItem.delete({ id: item.id });
      }
      for (const item of args.lineItems) {
        await tx.mutate.vendorPaymentLineItem.insert({
          ...buildLineItemInsert(item, now),
          vendorPaymentId: args.id,
        });
      }

      const existingAtts = await tx.run(
        zql.vendorPaymentAttachment.where("vendorPaymentId", args.id)
      );
      for (const att of existingAtts) {
        await tx.mutate.vendorPaymentAttachment.delete({ id: att.id });
      }
      for (const att of args.attachments) {
        await tx.mutate.vendorPaymentAttachment.insert({
          ...buildAttachmentInsert(att, now),
          vendorPaymentId: args.id,
        });
      }

      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "updated", now),
        vendorPaymentId: args.id,
      });
    }
  ),

  approve: defineMutator(
    z.object({
      id: z.string(),
      note: z.string().optional(),
      approvalScreenshotKey: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      const userId = ctx.userId;
      const vendorPayment = await tx.run(
        zql.vendorPayment.where("id", args.id).one()
      );
      if (!vendorPayment) {
        throw new Error("Vendor payment not found");
      }
      if (vendorPayment.status !== "pending") {
        throw new Error("Only pending vendor payments can be approved");
      }

      const now = Date.now();

      await tx.mutate.vendorPayment.update({
        id: args.id,
        status: "approved",
        approvalScreenshotKey: args.approvalScreenshotKey ?? null,
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });

      // Auto-approve the linked vendor if it's still pending
      const vendor = await tx.run(
        zql.vendor.where("id", vendorPayment.vendorId).one()
      );
      if (vendor && vendor.status === "pending") {
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

      if (tx.location === "server") {
        const { title, userId: ownerId } = vendorPayment;
        const id = args.id;
        const note = args.note;
        const approvalScreenshotKey = args.approvalScreenshotKey;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "approveVendorPayment",
            vendorPaymentId: id,
            title,
            submitterId: ownerId,
          },
          fn: async () => {
            const { notifyVendorPaymentApproved } = await import(
              "@pi-dash/notifications"
            );
            await notifyVendorPaymentApproved({
              vendorPaymentId: id,
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
      const vendorPayment = await tx.run(
        zql.vendorPayment.where("id", args.id).one()
      );
      if (!vendorPayment) {
        throw new Error("Vendor payment not found");
      }

      const isAdmin = ctx.role === "admin";
      const isOwner = vendorPayment.userId === userId;
      if (!(isAdmin || (isOwner && vendorPayment.status === "pending"))) {
        throw new Error("Unauthorized");
      }

      const lineItems = await tx.run(
        zql.vendorPaymentLineItem.where("vendorPaymentId", args.id)
      );
      for (const item of lineItems) {
        await tx.mutate.vendorPaymentLineItem.delete({ id: item.id });
      }

      const attachments = await tx.run(
        zql.vendorPaymentAttachment.where("vendorPaymentId", args.id)
      );
      for (const att of attachments) {
        await tx.mutate.vendorPaymentAttachment.delete({ id: att.id });
      }

      const history = await tx.run(
        zql.vendorPaymentHistory.where("vendorPaymentId", args.id)
      );
      for (const h of history) {
        await tx.mutate.vendorPaymentHistory.delete({ id: h.id });
      }

      await tx.mutate.vendorPayment.delete({ id: args.id });
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      const userId = ctx.userId;
      const vendorPayment = await tx.run(
        zql.vendorPayment.where("id", args.id).one()
      );
      if (!vendorPayment) {
        throw new Error("Vendor payment not found");
      }
      if (vendorPayment.status !== "pending") {
        throw new Error("Only pending vendor payments can be rejected");
      }

      const now = Date.now();

      await tx.mutate.vendorPayment.update({
        id: args.id,
        status: "rejected",
        rejectionReason: args.reason,
        reviewedBy: userId,
        reviewedAt: now,
        updatedAt: now,
      });

      await tx.mutate.vendorPaymentHistory.insert({
        ...buildHistoryInsert(userId, "rejected", now, args.reason),
        vendorPaymentId: args.id,
      });

      if (tx.location === "server") {
        const { title, userId: ownerId } = vendorPayment;
        const id = args.id;
        const reason = args.reason;
        ctx.asyncTasks?.push({
          meta: {
            mutator: "rejectVendorPayment",
            vendorPaymentId: id,
            title,
            submitterId: ownerId,
            reason,
          },
          fn: async () => {
            const { notifyVendorPaymentRejected } = await import(
              "@pi-dash/notifications"
            );
            await notifyVendorPaymentRejected({
              vendorPaymentId: id,
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
