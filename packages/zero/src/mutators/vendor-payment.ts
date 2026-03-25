import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertHasPermission, assertIsLoggedIn } from "../permissions";
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
  assertVendorUsable,
  buildHistoryInsert,
  deleteAllRelations,
  insertRelations,
  replaceRelations,
} from "./submission-helpers";

const createSchema = z.object({
  id: z.string(),
  vendorId: z.string(),
  title: z.string().min(1),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().min(1),
  lineItems: z.array(lineItemSchema),
  attachments: z.array(attachmentSchema),
});

const fk = (id: string) => ({ vendorPaymentId: id });

const entityFields = (args: z.infer<typeof createSchema>) => ({
  vendorId: args.vendorId,
  invoiceNumber: args.invoiceNumber ?? null,
  invoiceDate: args.invoiceDate,
});

export const vendorPaymentMutators = {
  create: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const userId = ctx.userId;

    const vendor = await tx.run(zql.vendor.where("id", args.vendorId).one());
    if (!vendor) {
      throw new Error("Vendor not found");
    }
    assertVendorUsable(vendor, userId);

    const now = Date.now();

    await tx.mutate.vendorPayment.insert({
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
        insertLineItem: (data) => tx.mutate.vendorPaymentLineItem.insert(data),
        insertAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.insert(data),
        insertHistory: (data) => tx.mutate.vendorPaymentHistory.insert(data),
      }
    );

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
  }),

  update: defineMutator(createSchema, async ({ tx, ctx, args }) => {
    assertIsLoggedIn(ctx);
    const userId = ctx.userId;
    const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
    assertEntityExists(entity, "Vendor payment");
    assertCanModify(entity, userId, ctx.role === "admin", "vendor payment");

    const vendor = await tx.run(zql.vendor.where("id", args.vendorId).one());
    if (!vendor) {
      throw new Error("Vendor not found");
    }
    assertVendorUsable(vendor, userId);

    const now = Date.now();

    await tx.mutate.vendorPayment.update({
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
        insertLineItem: (data) => tx.mutate.vendorPaymentLineItem.insert(data),
        insertAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.insert(data),
        insertHistory: (data) => tx.mutate.vendorPaymentHistory.insert(data),
        queryLineItems: () =>
          tx.run(zql.vendorPaymentLineItem.where("vendorPaymentId", args.id)),
        queryAttachments: () =>
          tx.run(zql.vendorPaymentAttachment.where("vendorPaymentId", args.id)),
        deleteLineItem: (data) => tx.mutate.vendorPaymentLineItem.delete(data),
        deleteAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.delete(data),
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
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertPending(entity, "vendor payment", "approved");

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
        zql.vendor.where("id", entity.vendorId).one()
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
        const { title, userId: ownerId } = entity;
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
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertCanDelete(entity, userId, ctx.role === "admin");

      await deleteAllRelations({
        queryLineItems: () =>
          tx.run(zql.vendorPaymentLineItem.where("vendorPaymentId", args.id)),
        queryAttachments: () =>
          tx.run(zql.vendorPaymentAttachment.where("vendorPaymentId", args.id)),
        queryHistory: () =>
          tx.run(zql.vendorPaymentHistory.where("vendorPaymentId", args.id)),
        deleteLineItem: (data) => tx.mutate.vendorPaymentLineItem.delete(data),
        deleteAttachment: (data) =>
          tx.mutate.vendorPaymentAttachment.delete(data),
        deleteHistory: (data) => tx.mutate.vendorPaymentHistory.delete(data),
      });

      await tx.mutate.vendorPayment.delete({ id: args.id });
    }
  ),

  reject: defineMutator(
    z.object({ id: z.string(), reason: z.string().trim().min(1) }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "requests.approve");
      const userId = ctx.userId;
      const entity = await tx.run(zql.vendorPayment.where("id", args.id).one());
      assertEntityExists(entity, "Vendor payment");
      assertPending(entity, "vendor payment", "rejected");

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
        const { title, userId: ownerId } = entity;
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
