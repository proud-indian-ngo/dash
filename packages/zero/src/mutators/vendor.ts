import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import { requireEnqueue } from "../context";
import { assertHasPermission, can } from "../permissions";
import { zql } from "../schema";
import { GST_REGEX, IFSC_REGEX, PAN_REGEX } from "../vendor-patterns";

export const vendorMutators = {
  approve: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "vendors.approve");
      const vendor = await tx.run(zql.vendor.where("id", args.id).one());
      if (!vendor) {
        throw new Error("Vendor not found");
      }
      if (vendor.status !== "pending") {
        throw new Error("Only pending vendors can be approved");
      }

      await tx.mutate.vendor.update({
        id: args.id,
        status: "approved",
        updatedAt: Date.now(),
      });

      if (tx.location === "server") {
        const vendorId = args.id;
        const vendorName = vendor.name;
        const creatorId = vendor.createdBy as string;
        ctx.asyncTasks?.push({
          fn: async () => {
            const enqueue = requireEnqueue(ctx);
            await enqueue(
              "notify-vendor-approved",
              {
                creatorId,
                vendorId,
                vendorName,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: { creatorId, mutator: "approveVendor", vendorId },
        });
      }
    }
  ),
  create: defineMutator(
    z.object({
      address: z.string().optional(),
      bankAccountIfscCode: z.string().regex(IFSC_REGEX),
      bankAccountName: z.string().min(1),
      bankAccountNumber: z.string().min(1),
      contactEmail: z.email().optional(),
      contactPhone: z.string().min(1),
      gstNumber: z
        .union([z.literal(""), z.string().regex(GST_REGEX)])
        .optional(),
      id: z.string(),
      name: z.string().min(1),
      panNumber: z
        .union([z.literal(""), z.string().regex(PAN_REGEX)])
        .optional(),
      status: z.enum(["pending", "approved"]).optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "vendors.create");
      const { userId } = ctx;
      const canAutoApprove = can(ctx, "vendors.approve");
      const status = canAutoApprove ? args.status : "pending";
      const now = Date.now();

      await tx.mutate.vendor.insert({
        address: args.address,
        bankAccountIfscCode: args.bankAccountIfscCode,
        bankAccountName: args.bankAccountName,
        bankAccountNumber: args.bankAccountNumber,
        contactEmail: args.contactEmail || null,
        contactPhone: args.contactPhone,
        createdAt: now,
        createdBy: userId,
        gstNumber: args.gstNumber || null,
        id: args.id,
        name: args.name,
        panNumber: args.panNumber || null,
        status,
        updatedAt: now,
      });
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "vendors.delete");
      const vendor = await tx.run(zql.vendor.where("id", args.id).one());
      if (!vendor) {
        throw new Error("Vendor not found");
      }

      const payments = await tx.run(
        zql.vendorPayment.where("vendorId", args.id)
      );
      if (payments.length > 0) {
        throw new Error("Cannot delete vendor with existing payment requests");
      }

      await tx.mutate.vendor.delete({ id: args.id });
    }
  ),

  unapprove: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "vendors.approve");
      const vendor = await tx.run(zql.vendor.where("id", args.id).one());
      if (!vendor) {
        throw new Error("Vendor not found");
      }
      if (vendor.status !== "approved") {
        throw new Error("Only approved vendors can be unapproved");
      }

      const payments = await tx.run(
        zql.vendorPayment.where("vendorId", args.id)
      );
      if (payments.length > 0) {
        throw new Error(
          "Cannot unapprove vendor with existing payment requests"
        );
      }

      await tx.mutate.vendor.update({
        id: args.id,
        status: "pending",
        updatedAt: Date.now(),
      });

      if (tx.location === "server") {
        const vendorId = args.id;
        const vendorName = vendor.name;
        const creatorId = vendor.createdBy as string;
        ctx.asyncTasks?.push({
          fn: async () => {
            const enqueue = requireEnqueue(ctx);
            await enqueue(
              "notify-vendor-unapproved",
              {
                creatorId,
                vendorId,
                vendorName,
              },
              { traceId: ctx.traceId }
            );
          },
          meta: { creatorId, mutator: "unapproveVendor", vendorId },
        });
      }
    }
  ),

  update: defineMutator(
    z.object({
      address: z.string().optional(),
      bankAccountIfscCode: z.string().regex(IFSC_REGEX),
      bankAccountName: z.string().min(1),
      bankAccountNumber: z.string().min(1),
      contactEmail: z.email().optional(),
      contactPhone: z.string().min(1),
      gstNumber: z
        .union([z.literal(""), z.string().regex(GST_REGEX)])
        .optional(),
      id: z.string(),
      name: z.string().min(1),
      panNumber: z
        .union([z.literal(""), z.string().regex(PAN_REGEX)])
        .optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "vendors.edit");
      const vendor = await tx.run(zql.vendor.where("id", args.id).one());
      if (!vendor) {
        throw new Error("Vendor not found");
      }

      const now = Date.now();

      await tx.mutate.vendor.update({
        address: args.address,
        bankAccountIfscCode: args.bankAccountIfscCode,
        bankAccountName: args.bankAccountName,
        bankAccountNumber: args.bankAccountNumber,
        contactEmail: args.contactEmail || null,
        contactPhone: args.contactPhone,
        gstNumber: args.gstNumber || null,
        id: args.id,
        name: args.name,
        panNumber: args.panNumber || null,
        updatedAt: now,
      });
    }
  ),
};
