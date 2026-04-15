import { cityValues } from "@pi-dash/shared/constants";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import type { Context } from "../context";
import { assertHasPermission, assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";

const userGenderValues = ["male", "female"] as const;

/**
 * Check if the user can manage students at a specific center.
 * Allowed: students.manage (global), center coordinator, or team lead with class events at the center.
 */
async function assertCanManageStudentsAtCenter(
  // biome-ignore lint/suspicious/noExplicitAny: Zero's Transaction type is deeply generic
  tx: { run: (q: any) => Promise<any> },
  ctx: Context,
  centerId: string | null | undefined
): Promise<void> {
  if (can(ctx, "students.manage")) {
    return;
  }
  if (!centerId) {
    throw new Error(
      "Unauthorized: centerId required for non-admin student management"
    );
  }
  // Check if user is a coordinator at this center
  const isCoordinator = !!(await tx.run(
    zql.centerCoordinator
      .where("centerId", centerId)
      .where("userId", ctx.userId)
      .one()
  ));
  if (isCoordinator) {
    return;
  }
  // Check if user is a team lead of a team with class events at this center
  const classEventAtCenter = await tx.run(
    zql.teamEvent.where("centerId", centerId).where("type", "class").limit(1)
  );
  if ((classEventAtCenter as { teamId: string }[]).length > 0) {
    const teamIds = [
      ...new Set(
        (classEventAtCenter as { teamId: string }[]).map((e) => e.teamId)
      ),
    ];
    for (const teamId of teamIds) {
      const isLead = !!(await tx.run(
        zql.teamMember
          .where("teamId", teamId)
          .where("userId", ctx.userId)
          .where("role", "lead")
          .one()
      ));
      if (isLead) {
        return;
      }
    }
  }
  throw new Error("Unauthorized");
}

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
      await assertCanManageStudentsAtCenter(tx, ctx, args.centerId);
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
      const existing = (await tx.run(zql.student.where("id", args.id).one())) as
        | { centerId: string | null }
        | undefined;
      if (!existing) {
        throw new Error("Student not found");
      }
      await assertCanManageStudentsAtCenter(
        tx,
        ctx,
        args.centerId ?? existing.centerId
      );

      // Non-admin users can only edit DOB once the student has attended a class
      if (!can(ctx, "students.manage")) {
        const attendanceRecords = (await tx.run(
          zql.classEventStudent.where("studentId", args.id).limit(1)
        )) as { attendance: string | null }[];
        const hasAttended = attendanceRecords.some(
          (r) => r.attendance !== null
        );
        if (hasAttended) {
          const hasNonDobChanges =
            args.name !== undefined ||
            args.gender !== undefined ||
            args.centerId !== undefined ||
            args.city !== undefined ||
            args.notes !== undefined ||
            args.isActive !== undefined;
          if (hasNonDobChanges) {
            throw new Error(
              "Only date of birth can be edited after the student has attended a class"
            );
          }
        }
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
      const existing = (await tx.run(zql.student.where("id", args.id).one())) as
        | { centerId: string | null }
        | undefined;
      if (!existing) {
        throw new Error("Student not found");
      }
      await assertCanManageStudentsAtCenter(tx, ctx, existing.centerId);
      await tx.mutate.student.update({
        id: args.id,
        isActive: false,
        updatedAt: args.now,
      });
    }
  ),

  delete: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      assertHasPermission(ctx, "students.manage");
      const existing = await tx.run(zql.student.where("id", args.id).one());
      if (!existing) {
        throw new Error("Student not found");
      }
      await tx.mutate.student.delete({ id: args.id });
    }
  ),
};
