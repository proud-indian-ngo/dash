import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertIsAdmin, assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";

export const vendorMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      contactPhone: z.string().min(1),
      contactEmail: z.string().optional(),
      bankAccountName: z.string().min(1),
      bankAccountNumber: z.string().min(1),
      bankAccountIfscCode: z.string().min(1),
      address: z.string().optional(),
      gstNumber: z.string().optional(),
      panNumber: z.string().optional(),
      status: z.enum(["pending", "approved"]).optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const userId = ctx.userId;
      const isAdmin = ctx.role === "admin";
      const status = isAdmin ? (args.status ?? "approved") : "pending";
      const now = Date.now();

      await tx.mutate.vendor.insert({
        id: args.id,
        name: args.name,
        contactEmail: args.contactEmail ?? null,
        contactPhone: args.contactPhone,
        bankAccountName: args.bankAccountName,
        bankAccountNumber: args.bankAccountNumber,
        bankAccountIfscCode: args.bankAccountIfscCode,
        address: args.address ?? null,
        gstNumber: args.gstNumber ?? null,
        panNumber: args.panNumber ?? null,
        status,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }
  ),

  update: defineMutator(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      contactPhone: z.string().min(1),
      contactEmail: z.string().optional(),
      bankAccountName: z.string().min(1),
      bankAccountNumber: z.string().min(1),
      bankAccountIfscCode: z.string().min(1),
      address: z.string().optional(),
      gstNumber: z.string().optional(),
      panNumber: z.string().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
      const vendor = await tx.run(zql.vendor.where("id", args.id).one());
      if (!vendor) {
        throw new Error("Vendor not found");
      }

      const now = Date.now();

      await tx.mutate.vendor.update({
        id: args.id,
        name: args.name,
        contactEmail: args.contactEmail ?? null,
        contactPhone: args.contactPhone,
        bankAccountName: args.bankAccountName,
        bankAccountNumber: args.bankAccountNumber,
        bankAccountIfscCode: args.bankAccountIfscCode,
        address: args.address ?? null,
        gstNumber: args.gstNumber ?? null,
        panNumber: args.panNumber ?? null,
        updatedAt: now,
      });
    }
  ),

  approve: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
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
    }
  ),

  unapprove: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
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
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsAdmin(ctx);
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
};
