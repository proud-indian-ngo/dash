import { cityValues } from "@pi-dash/shared/constants";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertHasPermission, assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";

const userGenderValues = ["male", "female"] as const;

export const studentMutators = {
  create: defineMutator(
    z.object({
      id: z.string(),
      name: z.string().min(1),
      dateOfBirth: z.number().nullable().optional(),
      gender: z.enum(userGenderValues).nullable().optional(),
      centerId: z.string().nullable().optional(),
      city: z.enum(cityValues).optional(),
      notes: z.string().optional(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      assertHasPermission(ctx, "students.manage");
      await tx.mutate.student.insert({
        id: args.id,
        name: args.name,
        dateOfBirth: args.dateOfBirth ?? null,
        gender: args.gender ?? null,
        centerId: args.centerId ?? null,
        city: args.city ?? "bangalore",
        notes: args.notes ?? null,
        isActive: true,
        createdBy: ctx.userId,
        createdAt: args.now,
        updatedAt: args.now,
      });
    }
  ),

  update: defineMutator(
    z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      dateOfBirth: z.number().nullable().optional(),
      gender: z.enum(userGenderValues).nullable().optional(),
      centerId: z.string().nullable().optional(),
      city: z.enum(cityValues).optional(),
      notes: z.string().optional(),
      isActive: z.boolean().optional(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      assertHasPermission(ctx, "students.manage");
      const existing = await tx.run(zql.student.where("id", args.id).one());
      if (!existing) {
        throw new Error("Student not found");
      }
      await tx.mutate.student.update({
        id: args.id,
        ...(args.name !== undefined && { name: args.name }),
        ...(args.dateOfBirth !== undefined && {
          dateOfBirth: args.dateOfBirth ?? null,
        }),
        ...(args.gender !== undefined && { gender: args.gender ?? null }),
        ...(args.centerId !== undefined && { centerId: args.centerId ?? null }),
        ...(args.city !== undefined && { city: args.city }),
        ...(args.notes !== undefined && { notes: args.notes || null }),
        ...(args.isActive !== undefined && { isActive: args.isActive }),
        updatedAt: args.now,
      });
    }
  ),

  deactivate: defineMutator(
    z.object({ id: z.string(), now: z.number() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      assertHasPermission(ctx, "students.manage");
      const existing = await tx.run(zql.student.where("id", args.id).one());
      if (!existing) {
        throw new Error("Student not found");
      }
      await tx.mutate.student.update({
        id: args.id,
        isActive: false,
        updatedAt: args.now,
      });
    }
  ),
};
