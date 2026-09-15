import { defineMutator } from "@rocicorp/zero";
import { uuidv7 } from "uuidv7";
import z from "zod";

import type { Context } from "../context";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import {
  getEditionForUpdate,
  type LockableKalakritiTx,
} from "./kalakriti-row-locks";

const base = z.object({
  id: z.uuid(),
  editionId: z.uuid(),
  now: z.number().int().nonnegative().max(8_640_000_000_000_000),
  auditEntryId: z.uuid(),
});
const fields = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Enter a phone number in international format"),
  email: z.email().max(254).nullable().optional(),
});
export const kalakritiAttendeeCreateSchema = base
  .extend(fields.shape)
  .extend({ kind: z.enum(["guest", "judge"]) });
export const kalakritiAttendeeUpdateSchema = base.extend(
  fields.partial().shape
);
export const kalakritiAttendeeArchiveSchema = base;
export const kalakritiAttendeeSetCompetitionsSchema = base.extend({
  competitionIds: z.array(z.uuid()).max(500),
});

async function authorize(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string,
  allowEventsLead = false
): Promise<"admin" | "events_lead"> {
  assertIsLoggedIn(ctx);
  const edition = await getEditionForUpdate(tx, editionId);
  if (!edition || edition.lifecycle === "archived")
    throw new Error("Edition is unavailable");
  if (!can(ctx, "kalakriti.admin")) {
    const membership = await tx.run(
      zql.kalakritiEditionMembership
        .where("editionId", editionId)
        .where("userId", ctx.userId)
        .where("state", "active")
        .where("kind", "volunteer")
        .whereExists("assignments", (assignment) =>
          assignment
            .where("editionId", editionId)
            .where("responsibility", "edition_admin")
        )
        .one()
    );
    if (membership) return "admin";
    if (allowEventsLead) {
      const eventsLead = await tx.run(
        zql.kalakritiEditionMembership
          .where("editionId", editionId)
          .where("userId", ctx.userId)
          .where("state", "active")
          .where("kind", "volunteer")
          .whereExists("assignments", (assignment) =>
            assignment
              .where("editionId", editionId)
              .where("responsibility", "overall_events_lead")
          )
          .one()
      );
      if (eventsLead) return "events_lead";
    }
    throw new Error("Unauthorized");
  }
  return "admin";
}

function audit(
  args: z.infer<typeof base>,
  userId: string,
  action: string,
  metadata: Record<string, string[] | number> = {}
) {
  return {
    id: args.auditEntryId,
    editionId: args.editionId,
    actorUserId: userId,
    createdAt: args.now,
    action,
    domain: "attendee",
    targetId: args.id,
    targetType: "attendee",
    reason: null,
    metadata,
  };
}

export const kalakritiAttendeeMutators = {
  create: defineMutator(
    kalakritiAttendeeCreateSchema,
    async ({ tx, ctx, args }) => {
      if (tx.location !== "server") return;
      await authorize(tx, ctx, args.editionId);
      assertIsLoggedIn(ctx);
      const existing = await tx.run(
        zql.kalakritiAttendee.where("id", args.id).one()
      );
      if (existing) {
        if (
          existing.editionId !== args.editionId ||
          existing.kind !== args.kind
        )
          throw new Error("Attendee ID already exists");
        return;
      }
      const edition = await tx.run(
        zql.kalakritiEdition.where("id", args.editionId).one()
      );
      if (!edition) throw new Error("Edition not found");
      const prefix = `${args.kind === "guest" ? "KALGT" : "KALJ"}-${edition.year}-`;
      const attendees = await tx.run(
        zql.kalakritiAttendee
          .where("editionId", args.editionId)
          .where("kind", args.kind)
      );
      let sequence = 1;
      for (const attendee of attendees) {
        if (attendee.humanId.startsWith(prefix)) {
          const value = Number(attendee.humanId.slice(prefix.length));
          if (Number.isSafeInteger(value))
            sequence = Math.max(sequence, value + 1);
        }
      }
      await tx.mutate.kalakritiAttendee.insert({
        id: args.id,
        editionId: args.editionId,
        kind: args.kind,
        humanId: `${prefix}${String(sequence).padStart(4, "0")}`,
        name: args.name,
        phone: args.phone,
        email: args.email ?? null,
        archivedAt: null,
        createdAt: args.now,
        updatedAt: args.now,
        createdBy: ctx.userId,
      });
      await tx.mutate.kalakritiAuditEntry.insert(
        audit(args, ctx.userId, "created")
      );
    }
  ),
  update: defineMutator(
    kalakritiAttendeeUpdateSchema,
    async ({ tx, ctx, args }) => {
      if (tx.location !== "server") return;
      const authority = await authorize(tx, ctx, args.editionId, true);
      assertIsLoggedIn(ctx);
      const attendee = await tx.run(
        zql.kalakritiAttendee
          .where("id", args.id)
          .where("editionId", args.editionId)
          .where("archivedAt", "IS", null)
          .one()
      );
      if (!attendee) throw new Error("Active attendee not found");
      if (authority === "events_lead" && attendee.kind !== "judge")
        throw new Error("Unauthorized");
      const changes = Object.fromEntries(
        Object.entries({
          name: args.name,
          phone: args.phone,
          email: args.email,
        }).filter(
          ([key, value]) =>
            value !== undefined &&
            attendee[key as "name" | "phone" | "email"] !== value
        )
      );
      if (!Object.keys(changes).length) return;
      await tx.mutate.kalakritiAttendee.update({
        id: args.id,
        ...changes,
        updatedAt: args.now,
      });
      await tx.mutate.kalakritiAuditEntry.insert(
        audit(args, ctx.userId, "updated", {
          changedFields: Object.keys(changes),
        })
      );
    }
  ),
  archive: defineMutator(
    kalakritiAttendeeArchiveSchema,
    async ({ tx, ctx, args }) => {
      if (tx.location !== "server") return;
      await authorize(tx, ctx, args.editionId);
      assertIsLoggedIn(ctx);
      const attendee = await tx.run(
        zql.kalakritiAttendee
          .where("id", args.id)
          .where("editionId", args.editionId)
          .one()
      );
      if (!attendee) throw new Error("Attendee not found");
      if (attendee.archivedAt !== null) return;
      await tx.mutate.kalakritiAttendee.update({
        id: args.id,
        archivedAt: args.now,
        updatedAt: args.now,
      });
      await tx.mutate.kalakritiAuditEntry.insert(
        audit(args, ctx.userId, "archived")
      );
    }
  ),
  setCompetitions: defineMutator(
    kalakritiAttendeeSetCompetitionsSchema,
    async ({ tx, ctx, args }) => {
      if (tx.location !== "server") return;
      await authorize(tx, ctx, args.editionId, true);
      assertIsLoggedIn(ctx);
      const attendee = await tx.run(
        zql.kalakritiAttendee
          .where("id", args.id)
          .where("editionId", args.editionId)
          .where("archivedAt", "IS", null)
          .one()
      );
      if (!attendee || attendee.kind !== "judge")
        throw new Error("Active judge not found");
      const ids = [...new Set(args.competitionIds)];
      for (const id of ids) {
        const competition = await tx.run(
          zql.kalakritiCompetition
            .where("id", id)
            .where("editionId", args.editionId)
            .where("retiredAt", "IS", null)
            .one()
        );
        if (!competition)
          throw new Error("Active competition not found in this Edition");
      }
      const existing = await tx.run(
        zql.kalakritiJudgeAssignment
          .where("editionId", args.editionId)
          .where("attendeeId", args.id)
      );
      const removed = existing.filter(
        (row) => !ids.includes(row.competitionId)
      );
      const added = ids.filter(
        (id) => !existing.some((row) => row.competitionId === id)
      );
      if (!(removed.length || added.length)) return;
      for (const row of removed)
        await tx.mutate.kalakritiJudgeAssignment.delete({ id: row.id });
      for (const competitionId of added)
        await tx.mutate.kalakritiJudgeAssignment.insert({
          id: uuidv7(),
          editionId: args.editionId,
          attendeeId: args.id,
          competitionId,
          createdAt: args.now,
          createdBy: ctx.userId,
        });
      await tx.mutate.kalakritiAuditEntry.insert(
        audit(args, ctx.userId, "competitions_updated", {
          addedCount: added.length,
          removedCount: removed.length,
        })
      );
    }
  ),
};
