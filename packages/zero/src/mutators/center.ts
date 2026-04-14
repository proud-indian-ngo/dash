import { cityValues } from "@pi-dash/shared/constants";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertHasPermission } from "../permissions";
import { zql } from "../schema";

export const centerMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      city: z.enum(cityValues).optional(),
      address: z.string().optional(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "centers.manage");
      await tx.mutate.center.insert({
        id: args.id,
        name: args.name,
        city: args.city ?? "bangalore",
        address: args.address ?? null,
        isActive: true,
        createdAt: args.now,
        updatedAt: args.now,
      });
    }
  ),

  update: defineMutator(
    z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      city: z.enum(cityValues).optional(),
      address: z.string().optional(),
      isActive: z.boolean().optional(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "centers.manage");
      const existing = await tx.run(zql.center.where("id", args.id).one());
      if (!existing) {
        throw new Error("Center not found");
      }
      await tx.mutate.center.update({
        id: args.id,
        ...(args.name !== undefined && { name: args.name }),
        ...(args.city !== undefined && { city: args.city }),
        ...(args.address !== undefined && { address: args.address || null }),
        ...(args.isActive !== undefined && { isActive: args.isActive }),
        updatedAt: args.now,
      });
    }
  ),

  assignCoordinator: defineMutator(
    z.object({
      id: z.string(),
      centerId: z.string(),
      userId: z.string(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "centers.manage");
      const center = await tx.run(zql.center.where("id", args.centerId).one());
      if (!center) {
        throw new Error("Center not found");
      }
      // Unique constraint will prevent duplicates
      await tx.mutate.centerCoordinator.insert({
        id: args.id,
        centerId: args.centerId,
        userId: args.userId,
        assignedAt: args.now,
      });
    }
  ),

  removeCoordinator: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "centers.manage");
      await tx.mutate.centerCoordinator.delete({ id: args.id });
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "centers.manage");
      await tx.mutate.center.delete({ id: args.id });
    }
  ),
};
