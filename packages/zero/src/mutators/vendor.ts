import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import "../context";
import { assertHasPermission } from "../permissions";
import { zql } from "../schema";

/**
 * Only approval moves through Zero. Creating, editing and deleting a vendor
 * write private party tables the browser never sees, so they go through the
 * audited server functions in `apps/web/src/functions/vendors.ts`.
 */
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
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
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
            const { enqueue } = await import("@pi-dash/jobs/enqueue");
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
};
