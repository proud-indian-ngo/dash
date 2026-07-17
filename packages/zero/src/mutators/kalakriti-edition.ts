import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import "../context";
import { assertHasPermission } from "../permissions";
import { zql } from "../schema";

export const kalakritiEditionCreateSchema = z.object({
  ageCutoffDate: z.iso.date(),
  auditEntryId: z.string(),
  brandingKey: z.string().min(1),
  editionId: z.string(),
  eventDate: z.iso.date(),
  name: z.string().trim().min(1),
  now: z.number(),
  plannedRegistrationCloseAt: z.number(),
  teamEventId: z.string(),
  teamId: z.string(),
  year: z.number().int().min(2000).max(2200),
});

export const kalakritiEditionMutators = {
  create: defineMutator(
    kalakritiEditionCreateSchema,
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "kalakriti.admin");

      const existingYear = await tx.run(
        zql.kalakritiEdition.where("year", args.year).one()
      );
      if (existingYear) {
        throw new Error(`Kalakriti ${args.year} already exists`);
      }

      const team = await tx.run(zql.team.where("id", args.teamId).one());
      if (!team) {
        throw new Error("Owning team not found");
      }

      const eventStart = new Date(`${args.eventDate}T00:00:00+05:30`).getTime();
      const eventDate = new Date(`${args.eventDate}T00:00:00Z`).getTime();
      const ageCutoffDate = new Date(
        `${args.ageCutoffDate}T00:00:00Z`
      ).getTime();
      if (
        !(
          Number.isFinite(eventStart) &&
          Number.isFinite(eventDate) &&
          Number.isFinite(ageCutoffDate)
        )
      ) {
        throw new Error("Invalid event date");
      }
      if (args.plannedRegistrationCloseAt >= eventStart) {
        throw new Error("Registration must close before the event date");
      }

      await tx.mutate.teamEvent.insert({
        cancelledAt: null,
        city: "bangalore",
        createdAt: args.now,
        createdBy: ctx.userId,
        description: "Technical event record managed by the Kalakriti module.",
        endTime: null,
        feedbackDeadline: null,
        feedbackEnabled: false,
        id: args.teamEventId,
        inheritVolunteers: false,
        isPublic: false,
        location: null,
        managementDomain: "kalakriti",
        name: args.name,
        originalDate: null,
        postEventNudgesEnabled: false,
        postRsvpPoll: false,
        recurrenceRule: null,
        reminderIntervals: null,
        reminderTarget: "group",
        rsvpPollLeadMinutes: 60,
        seriesId: null,
        startTime: eventStart,
        teamId: args.teamId,
        updatedAt: args.now,
        whatsappGroupId: null,
      });

      await tx.mutate.kalakritiEdition.insert({
        ageCutoffDate,
        brandingKey: args.brandingKey,
        createdAt: args.now,
        createdBy: ctx.userId,
        eventDate,
        id: args.editionId,
        lifecycle: "draft",
        name: args.name,
        plannedRegistrationCloseAt: args.plannedRegistrationCloseAt,
        runnerUpPoints: 5,
        teamEventId: args.teamEventId,
        timezone: "Asia/Kolkata",
        updatedAt: args.now,
        winnerPoints: 10,
        year: args.year,
      });

      await tx.mutate.kalakritiAuditEntry.insert({
        action: "created",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "edition",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: { teamEventId: args.teamEventId, teamId: args.teamId },
        reason: null,
        targetId: args.editionId,
        targetType: "edition",
      });
    }
  ),
};
