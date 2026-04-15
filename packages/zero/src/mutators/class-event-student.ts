import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import type { PermissionId } from "@pi-dash/db/permissions";
import type { Context } from "../context";
import {
  assertHasPermissionOrTeamLead,
  assertIsLoggedIn,
} from "../permissions";
import type { TeamEvent } from "../schema";
import { zql } from "../schema";

async function assertEventAccess(
  // biome-ignore lint/suspicious/noExplicitAny: Zero's Transaction type is deeply generic
  tx: { run: (q: any) => Promise<any> },
  ctx: Context,
  eventId: string,
  permission: PermissionId
) {
  const event = (await tx.run(zql.teamEvent.where("id", eventId).one())) as
    | TeamEvent
    | undefined;
  if (!event) {
    throw new Error("Event not found");
  }
  const isTeamLead = !!(await tx.run(
    zql.teamMember
      .where("teamId", event.teamId)
      .where("userId", ctx.userId)
      .where("role", "lead")
      .one()
  ));
  assertHasPermissionOrTeamLead(ctx, permission, isTeamLead);
  return event;
}

export const classEventStudentMutators = {
  enroll: defineMutator(
    z.object({
      id: z.string(),
      eventId: z.string(),
      studentId: z.string(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      await assertEventAccess(tx, ctx, args.eventId, "events.manage_members");
      // Unique constraint prevents duplicates
      await tx.mutate.classEventStudent.insert({
        id: args.id,
        eventId: args.eventId,
        studentId: args.studentId,
        attendance: null,
        attendanceMarkedAt: null,
        attendanceMarkedBy: null,
      });
    }
  ),

  remove: defineMutator(
    z.object({ id: z.string(), eventId: z.string() }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      await assertEventAccess(tx, ctx, args.eventId, "events.manage_members");
      await tx.mutate.classEventStudent.delete({ id: args.id });
    }
  ),

  markAttendance: defineMutator(
    z.object({
      id: z.string(),
      eventId: z.string(),
      attendance: z.enum(["present", "absent"]).nullable(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const event = await assertEventAccess(
        tx,
        ctx,
        args.eventId,
        "events.manage_attendance"
      );
      if (tx.location === "server" && event.startTime > Date.now()) {
        throw new Error("Cannot mark attendance before event starts");
      }
      await tx.mutate.classEventStudent.update({
        id: args.id,
        attendance: args.attendance,
        // Only update marker/timestamp when setting a status; clearing keeps the last audit trail
        ...(args.attendance !== null && {
          attendanceMarkedAt: args.now,
          attendanceMarkedBy: ctx.userId,
        }),
      });
    }
  ),

  markAllPresent: defineMutator(
    z.object({
      eventId: z.string(),
      now: z.number(),
    }),
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const event = await assertEventAccess(
        tx,
        ctx,
        args.eventId,
        "events.manage_attendance"
      );
      if (tx.location === "server" && event.startTime > Date.now()) {
        throw new Error("Cannot mark attendance before event starts");
      }
      const students = (await tx.run(
        zql.classEventStudent.where("eventId", args.eventId)
      )) as { id: string }[];
      for (const s of students) {
        try {
          await tx.mutate.classEventStudent.update({
            id: s.id,
            attendance: "present",
            attendanceMarkedAt: args.now,
            attendanceMarkedBy: ctx.userId,
          });
        } catch (err) {
          throw new Error(
            `Failed to mark student ${s.id} present: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  ),
};
