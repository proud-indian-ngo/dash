import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import type { Context } from "../context";
import {
  getKalakritiRegistrationReadiness,
  type KalakritiRegistrationReadinessSnapshot,
} from "../kalakriti-registration-readiness";
import { assertHasPermission, assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";
import { assertCanManageKalakritiConfiguration } from "./kalakriti-config-access";
import {
  getEditionForUpdate,
  type LockableKalakritiTx,
} from "./kalakriti-row-locks";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

interface EditionTx extends LockableKalakritiTx {
  mutate: {
    kalakritiAgeCategory: { insert: ZeroMutationFn };
    kalakritiAuditEntry: { insert: ZeroMutationFn };
    kalakritiCompetition: { insert: ZeroMutationFn };
    kalakritiCompetitionCategory: { insert: ZeroMutationFn };
    kalakritiEdition: { insert: ZeroMutationFn; update: ZeroMutationFn };
    kalakritiVenue: { insert: ZeroMutationFn };
    teamEvent: { insert: ZeroMutationFn; update: ZeroMutationFn };
  };
}

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

export const kalakritiEditionUpdateMetadataSchema = z.object({
  ageCutoffDate: z.iso.date(),
  auditEntryId: z.string(),
  brandingKey: z.string().trim().min(1),
  editionId: z.string(),
  eventDate: z.iso.date(),
  name: z.string().trim().min(1),
  now: z.number(),
  plannedRegistrationCloseAt: z.number(),
});

export const kalakritiEditionTransitionSchema = z.object({
  auditEntryId: z.string(),
  confirmed: z.literal(true),
  editionId: z.string(),
  now: z.number(),
  targetLifecycle: z.enum(["registration_open", "registration_locked"]),
});

const cloneMapSchema = z.array(
  z.object({ sourceId: z.string(), targetId: z.string() })
);

export const kalakritiEditionCloneConfigurationSchema = z.object({
  ageCategoryIds: cloneMapSchema,
  auditEntryId: z.string(),
  competitionCategoryIds: cloneMapSchema,
  competitionIds: cloneMapSchema,
  confirmed: z.literal(true),
  now: z.number(),
  sourceEditionId: z.string(),
  targetEditionId: z.string(),
  venueIds: cloneMapSchema,
});

function parseEditionDates(args: {
  ageCutoffDate: string;
  eventDate: string;
  plannedRegistrationCloseAt: number;
}) {
  const eventStart = new Date(`${args.eventDate}T00:00:00+05:30`).getTime();
  const eventDate = new Date(`${args.eventDate}T00:00:00Z`).getTime();
  const ageCutoffDate = new Date(`${args.ageCutoffDate}T00:00:00Z`).getTime();
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
  return { ageCutoffDate, eventDate, eventStart };
}

function assertExactMaps(
  maps: readonly { sourceId: string; targetId: string }[],
  sourceIds: readonly string[],
  label: string
) {
  const mappedSources = maps.map((map) => map.sourceId);
  const mappedTargets = maps.map((map) => map.targetId);
  if (
    new Set(mappedSources).size !== mappedSources.length ||
    new Set(mappedTargets).size !== mappedTargets.length ||
    mappedSources.length !== sourceIds.length ||
    mappedSources.some((id) => !sourceIds.includes(id))
  ) {
    throw new Error(`${label} ID map must cover each source row exactly once`);
  }
}

function getMappedId(
  ids: ReadonlyMap<string, string>,
  sourceId: string,
  label: string
): string {
  const targetId = ids.get(sourceId);
  if (!targetId) {
    throw new Error(`${label} ID map is incomplete`);
  }
  return targetId;
}

function pushRegistrationNotificationTasks(
  tx: EditionTx,
  ctx: Context | undefined,
  args: z.infer<typeof kalakritiEditionTransitionSchema>,
  plannedRegistrationCloseAt: number
) {
  if (tx.location !== "server") {
    return;
  }
  const { editionId } = args;
  const { auditEntryId: transitionId } = args;
  const queueName =
    args.targetLifecycle === "registration_open"
      ? "notify-kalakriti-registration-open"
      : "notify-kalakriti-registration-closed";
  const lifecycleSingletonKey = `kalakriti-registration-${editionId}-${transitionId}`;
  ctx?.asyncTasks?.push({
    fn: async () => {
      const { enqueue } = await import("@pi-dash/jobs/enqueue");
      await enqueue(
        queueName,
        { editionId, transitionId },
        {
          singletonKey: lifecycleSingletonKey,
          traceId: ctx.traceId,
        }
      );
    },
    meta: {
      editionId,
      mutator: "transitionKalakritiEdition",
      queueName,
      singletonKey: lifecycleSingletonKey,
      targetLifecycle: args.targetLifecycle,
      transitionId,
    },
  });

  if (args.targetLifecycle !== "registration_open") {
    return;
  }
  const reminderSingletonKey = `kalakriti-registration-reminder-${editionId}-${plannedRegistrationCloseAt}`;
  const startAfter = new Date(
    plannedRegistrationCloseAt - 24 * 60 * 60 * 1000
  ).toISOString();
  ctx?.asyncTasks?.push({
    fn: async () => {
      const { enqueue } = await import("@pi-dash/jobs/enqueue");
      await enqueue(
        "remind-kalakriti-registration-close",
        { editionId, plannedRegistrationCloseAt },
        {
          singletonKey: reminderSingletonKey,
          startAfter,
          traceId: ctx.traceId,
        }
      );
    },
    meta: {
      editionId,
      mutator: "transitionKalakritiEdition",
      plannedRegistrationCloseAt,
      queueName: "remind-kalakriti-registration-close",
      singletonKey: reminderSingletonKey,
      startAfter,
    },
  });
}

async function getReadinessSnapshot(
  tx: EditionTx,
  editionId: string
): Promise<KalakritiRegistrationReadinessSnapshot> {
  const [
    edition,
    centers,
    ageCategories,
    quotas,
    competitionCategories,
    competitions,
    sessions,
    venues,
  ] = await Promise.all([
    tx.run(zql.kalakritiEdition.where("id", editionId).one()),
    tx.run(zql.kalakritiCenter.where("editionId", editionId)),
    tx.run(zql.kalakritiAgeCategory.where("editionId", editionId)),
    tx.run(zql.kalakritiCenterAgeQuota.where("editionId", editionId)),
    tx.run(zql.kalakritiCompetitionCategory.where("editionId", editionId)),
    tx.run(zql.kalakritiCompetition.where("editionId", editionId)),
    tx.run(zql.kalakritiCompetitionSession.where("editionId", editionId)),
    tx.run(zql.kalakritiVenue.where("editionId", editionId)),
  ]);
  if (!edition) {
    throw new Error("Edition not found");
  }
  return {
    ageCategories:
      ageCategories as KalakritiRegistrationReadinessSnapshot["ageCategories"],
    centers: centers as KalakritiRegistrationReadinessSnapshot["centers"],
    competitionCategories:
      competitionCategories as KalakritiRegistrationReadinessSnapshot["competitionCategories"],
    competitions:
      competitions as KalakritiRegistrationReadinessSnapshot["competitions"],
    edition: edition as KalakritiRegistrationReadinessSnapshot["edition"],
    quotas: quotas as KalakritiRegistrationReadinessSnapshot["quotas"],
    sessions: sessions as KalakritiRegistrationReadinessSnapshot["sessions"],
    venues: venues as KalakritiRegistrationReadinessSnapshot["venues"],
  };
}

export const kalakritiEditionMutators = {
  cloneConfiguration: defineMutator(
    kalakritiEditionCloneConfigurationSchema,
    async ({ tx, ctx, args }) => {
      if (args.sourceEditionId === args.targetEditionId) {
        throw new Error("Source and target Editions must differ");
      }
      for (const editionId of [
        args.sourceEditionId,
        args.targetEditionId,
      ].sort()) {
        // Edition locks must be acquired sequentially in stable ID order.
        // biome-ignore lint/performance/noAwaitInLoops: parallel locking can deadlock competing clones
        const edition = await getEditionForUpdate(tx as EditionTx, editionId);
        if (!edition) {
          throw new Error("Edition not found");
        }
      }
      await assertCanManageKalakritiConfiguration(
        tx as EditionTx,
        ctx,
        args.sourceEditionId
      );
      await assertCanManageKalakritiConfiguration(
        tx as EditionTx,
        ctx,
        args.targetEditionId
      );
      assertIsLoggedIn(ctx);
      const target = await tx.run(
        zql.kalakritiEdition.where("id", args.targetEditionId).one()
      );
      if (target?.lifecycle !== "draft") {
        throw new Error("Target Edition must be a draft");
      }
      const [
        targetAgeCategories,
        targetCategories,
        targetCompetitions,
        targetVenues,
      ] = await Promise.all([
        tx.run(
          zql.kalakritiAgeCategory.where("editionId", args.targetEditionId)
        ),
        tx.run(
          zql.kalakritiCompetitionCategory.where(
            "editionId",
            args.targetEditionId
          )
        ),
        tx.run(
          zql.kalakritiCompetition.where("editionId", args.targetEditionId)
        ),
        tx.run(zql.kalakritiVenue.where("editionId", args.targetEditionId)),
      ]);
      if (
        [
          targetAgeCategories,
          targetCategories,
          targetCompetitions,
          targetVenues,
        ].some((rows) => rows.length > 0)
      ) {
        throw new Error("Target Edition must have no structural configuration");
      }

      const [ageCategories, categories, competitions, venues] =
        await Promise.all([
          tx.run(
            zql.kalakritiAgeCategory.where("editionId", args.sourceEditionId)
          ),
          tx.run(
            zql.kalakritiCompetitionCategory.where(
              "editionId",
              args.sourceEditionId
            )
          ),
          tx.run(
            zql.kalakritiCompetition.where("editionId", args.sourceEditionId)
          ),
          tx.run(zql.kalakritiVenue.where("editionId", args.sourceEditionId)),
        ]);
      assertExactMaps(
        args.ageCategoryIds,
        ageCategories.map((row) => row.id),
        "Age Category"
      );
      const activeCategories = categories.filter(
        (row) => row.retiredAt === null
      );
      const activeCategoryIds = new Set(activeCategories.map((row) => row.id));
      const activeCompetitions = competitions.filter(
        (row) =>
          row.retiredAt === null &&
          row.cancelledAt === null &&
          activeCategoryIds.has(row.competitionCategoryId)
      );
      const activeVenues = venues.filter((row) => row.retiredAt === null);
      if (
        ageCategories.length === 0 &&
        activeCategories.length === 0 &&
        activeCompetitions.length === 0 &&
        activeVenues.length === 0
      ) {
        throw new Error(
          "Source Edition has no active structural configuration"
        );
      }
      assertExactMaps(
        args.competitionCategoryIds,
        activeCategories.map((row) => row.id),
        "Competition Category"
      );
      assertExactMaps(
        args.competitionIds,
        activeCompetitions.map((row) => row.id),
        "Competition"
      );
      assertExactMaps(
        args.venueIds,
        activeVenues.map((row) => row.id),
        "Venue"
      );
      const ageMap = new Map(
        args.ageCategoryIds.map((map) => [map.sourceId, map.targetId])
      );
      const categoryMap = new Map(
        args.competitionCategoryIds.map((map) => [map.sourceId, map.targetId])
      );
      const competitionMap = new Map(
        args.competitionIds.map((map) => [map.sourceId, map.targetId])
      );
      const venueMap = new Map(
        args.venueIds.map((map) => [map.sourceId, map.targetId])
      );
      await Promise.all(
        ageCategories.map((row) =>
          (tx as EditionTx).mutate.kalakritiAgeCategory.insert({
            createdAt: args.now,
            createdBy: ctx.userId,
            editionId: args.targetEditionId,
            id: getMappedId(ageMap, row.id, "Age Category"),
            maxCompetitionsPerCategory: row.maxCompetitionsPerCategory,
            maximumAge: row.maximumAge,
            maxTotalCompetitions: row.maxTotalCompetitions,
            minimumAge: row.minimumAge,
            name: row.name,
            normalizedName: row.normalizedName,
            sortOrder: row.sortOrder,
            updatedAt: args.now,
          })
        )
      );
      await Promise.all(
        activeCategories.map((row) =>
          (tx as EditionTx).mutate.kalakritiCompetitionCategory.insert({
            createdAt: args.now,
            createdBy: ctx.userId,
            editionId: args.targetEditionId,
            id: getMappedId(categoryMap, row.id, "Competition Category"),
            name: row.name,
            normalizedName: row.normalizedName,
            retiredAt: null,
            sortOrder: row.sortOrder,
            updatedAt: args.now,
          })
        )
      );
      await Promise.all(
        activeCompetitions.map((row) =>
          (tx as EditionTx).mutate.kalakritiCompetition.insert({
            cancelledAt: null,
            competitionCategoryId: getMappedId(
              categoryMap,
              row.competitionCategoryId,
              "Competition Category"
            ),
            createdAt: args.now,
            createdBy: ctx.userId,
            editionId: args.targetEditionId,
            genderEligibility: row.genderEligibility,
            id: getMappedId(competitionMap, row.id, "Competition"),
            maximumGroupSize: row.maximumGroupSize,
            minimumGroupSize: row.minimumGroupSize,
            name: row.name,
            normalizedName: row.normalizedName,
            participationMode: row.participationMode,
            retiredAt: null,
            updatedAt: args.now,
          })
        )
      );
      await Promise.all(
        activeVenues.map((row) =>
          (tx as EditionTx).mutate.kalakritiVenue.insert({
            createdAt: args.now,
            createdBy: ctx.userId,
            editionId: args.targetEditionId,
            id: getMappedId(venueMap, row.id, "Venue"),
            name: row.name,
            normalizedName: row.normalizedName,
            retiredAt: null,
            updatedAt: args.now,
          })
        )
      );
      await (tx as EditionTx).mutate.kalakritiAuditEntry.insert({
        action: "configuration_cloned",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "edition",
        editionId: args.targetEditionId,
        id: args.auditEntryId,
        metadata: {
          copied: {
            ageCategories: ageCategories.length,
            competitionCategories: activeCategories.length,
            competitions: activeCompetitions.length,
            venues: activeVenues.length,
          },
          sourceEditionId: args.sourceEditionId,
        },
        reason: null,
        targetId: args.targetEditionId,
        targetType: "edition",
      });
    }
  ),
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

      const { ageCutoffDate, eventDate, eventStart } = parseEditionDates(args);

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
        nextStudentSequence: 1,
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

  transition: defineMutator(
    kalakritiEditionTransitionSchema,
    async ({ tx, ctx, args }) => {
      const edition = await getEditionForUpdate(
        tx as EditionTx,
        args.editionId
      );
      if (!edition) {
        throw new Error("Edition not found");
      }
      await assertCanManageKalakritiConfiguration(
        tx as EditionTx,
        ctx,
        args.editionId
      );
      assertIsLoggedIn(ctx);
      const allowed =
        (edition.lifecycle === "draft" &&
          args.targetLifecycle === "registration_open") ||
        (edition.lifecycle === "registration_open" &&
          args.targetLifecycle === "registration_locked") ||
        (edition.lifecycle === "registration_locked" &&
          args.targetLifecycle === "registration_open");
      if (!allowed) {
        throw new Error("Invalid Edition lifecycle transition");
      }

      const readinessSnapshot = await getReadinessSnapshot(
        tx as EditionTx,
        args.editionId
      );
      const { plannedRegistrationCloseAt } = readinessSnapshot.edition;
      if (
        args.targetLifecycle === "registration_open" ||
        args.targetLifecycle === "registration_locked"
      ) {
        const blockers = getKalakritiRegistrationReadiness(readinessSnapshot);
        if (blockers.length > 0) {
          throw new Error(
            `Edition is not ready: ${blockers.map((blocker) => blocker.code).join(", ")}`
          );
        }
      }

      await (tx as EditionTx).mutate.kalakritiEdition.update({
        id: args.editionId,
        lifecycle: args.targetLifecycle,
        updatedAt: args.now,
      });
      await (tx as EditionTx).mutate.kalakritiAuditEntry.insert({
        action: "lifecycle_transitioned",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "edition",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: { from: edition.lifecycle, to: args.targetLifecycle },
        reason: null,
        targetId: args.editionId,
        targetType: "edition",
      });
      pushRegistrationNotificationTasks(
        tx as EditionTx,
        ctx,
        args,
        plannedRegistrationCloseAt
      );
    }
  ),

  updateMetadata: defineMutator(
    kalakritiEditionUpdateMetadataSchema,
    async ({ tx, ctx, args }) => {
      const lockedEdition = await getEditionForUpdate(
        tx as EditionTx,
        args.editionId
      );
      if (!lockedEdition) {
        throw new Error("Edition not found");
      }
      await assertCanManageKalakritiConfiguration(
        tx as EditionTx,
        ctx,
        args.editionId
      );
      assertIsLoggedIn(ctx);
      if (lockedEdition.lifecycle !== "draft") {
        throw new Error("Edition metadata can only be changed while draft");
      }

      const { ageCutoffDate, eventDate, eventStart } = parseEditionDates(args);
      const edition = await tx.run(
        zql.kalakritiEdition.where("id", args.editionId).one()
      );
      if (!edition) {
        throw new Error("Edition not found");
      }

      await (tx as EditionTx).mutate.teamEvent.update({
        id: edition.teamEventId,
        name: args.name,
        startTime: eventStart,
        updatedAt: args.now,
      });
      await (tx as EditionTx).mutate.kalakritiEdition.update({
        ageCutoffDate,
        brandingKey: args.brandingKey,
        eventDate,
        id: args.editionId,
        name: args.name,
        plannedRegistrationCloseAt: args.plannedRegistrationCloseAt,
        updatedAt: args.now,
      });
      await (tx as EditionTx).mutate.kalakritiAuditEntry.insert({
        action: "updated",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "edition",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: {
          fields: [
            "name",
            "eventDate",
            "ageCutoffDate",
            "plannedRegistrationCloseAt",
            "brandingKey",
          ],
          teamEventId: edition.teamEventId,
        },
        reason: null,
        targetId: args.editionId,
        targetType: "edition",
      });
    }
  ),
};
