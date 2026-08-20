import {
  hasValidKalakritiGroupRules,
  normalizeKalakritiConfigurationName,
  validateKalakritiSessionSchedule,
} from "@pi-dash/shared/kalakriti";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import type { Context } from "../context";
import { assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";
import {
  assertCanManageKalakritiCompetitionConfiguration,
  assertKalakritiEditionConfigurable,
  assertKalakritiEditionStructurallyConfigurable,
} from "./kalakriti-config-access";
import {
  getEditionForUpdate,
  type LockableKalakritiTx,
} from "./kalakriti-row-locks";
import {
  getCompetitionScheduleImpact,
  getDivisionScheduleImpact,
  getSessionScheduleImpact,
  getVenueScheduleImpact,
  pushKalakritiScheduleChangedTask,
} from "./kalakriti-schedule-notification";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

interface CompetitionTx extends LockableKalakritiTx {
  mutate: {
    kalakritiAuditEntry: { insert: ZeroMutationFn };
    kalakritiCompetition: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    kalakritiCompetitionDivision: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    kalakritiCompetitionCategory: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    kalakritiCompetitionSession: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    kalakritiVenue: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
  };
}

const namedConfigurationSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export const kalakritiCompetitionCategoryCreateSchema =
  namedConfigurationSchema.extend({
    auditEntryId: z.string(),
    categoryId: z.string(),
    editionId: z.string(),
    now: z.number(),
    sortOrder: z.number().int().min(0),
  });

export const kalakritiCompetitionCategoryUpdateSchema =
  namedConfigurationSchema.extend({
    auditEntryId: z.string(),
    categoryId: z.string(),
    now: z.number(),
    sortOrder: z.number().int().min(0),
  });

const competitionValuesSchema = namedConfigurationSchema
  .extend({
    competitionCategoryId: z.string(),
    divisions: z
      .array(
        z.object({
          ageCategoryId: z.string(),
          divisionId: z.string(),
        })
      )
      .min(1, "Select at least one Age Category")
      .refine(
        (divisions) =>
          new Set(divisions.map((division) => division.ageCategoryId)).size ===
          divisions.length,
        "Age Categories must be unique"
      ),
    genderEligibility: z.enum(["male", "female", "both"]),
    maximumGroupSize: z.number().int().min(1).max(100),
    minimumGroupSize: z.number().int().min(1).max(100),
    musicUploadEnabled: z.boolean(),
    participationMode: z.enum(["individual", "group"]),
  })
  .refine(
    (value) =>
      hasValidKalakritiGroupRules(
        value.participationMode,
        value.minimumGroupSize,
        value.maximumGroupSize
      ),
    { message: "Invalid group size rules" }
  );

export const kalakritiCompetitionCreateSchema = competitionValuesSchema.extend({
  auditEntryId: z.string(),
  competitionId: z.string(),
  editionId: z.string(),
  now: z.number(),
});

export const kalakritiCompetitionUpdateSchema = competitionValuesSchema.extend({
  auditEntryId: z.string(),
  competitionId: z.string(),
  now: z.number(),
});

export const kalakritiVenueCreateSchema = namedConfigurationSchema.extend({
  auditEntryId: z.string(),
  editionId: z.string(),
  now: z.number(),
  venueId: z.string(),
});

export const kalakritiVenueUpdateSchema = namedConfigurationSchema.extend({
  auditEntryId: z.string(),
  now: z.number(),
  venueId: z.string(),
});

const sessionValuesSchema = z.object({
  divisionId: z.string(),
  endAt: z.number().int(),
  startAt: z.number().int(),
  venueId: z.string(),
});

export const kalakritiCompetitionSessionCreateSchema =
  sessionValuesSchema.extend({
    auditEntryId: z.string(),
    editionId: z.string(),
    now: z.number(),
    sessionId: z.string(),
  });

export const kalakritiCompetitionSessionUpdateSchema =
  sessionValuesSchema.extend({
    auditEntryId: z.string(),
    now: z.number(),
    sessionId: z.string(),
  });

export const kalakritiCompetitionActionSchema = z.object({
  auditEntryId: z.string(),
  id: z.string(),
  now: z.number(),
});

export const kalakritiCompetitionStateSchema =
  kalakritiCompetitionActionSchema.extend({ enabled: z.boolean() });

async function lockCompetitionEdition(
  tx: CompetitionTx,
  ctx: Context | undefined,
  editionId: string
) {
  const edition = await getEditionForUpdate(tx, editionId);
  if (!edition) {
    throw new Error("Edition not found");
  }
  await assertCanManageKalakritiCompetitionConfiguration(tx, ctx, editionId);
  assertKalakritiEditionConfigurable(edition.lifecycle);
  assertIsLoggedIn(ctx);
  return edition;
}

async function lockStructurallyConfigurableCompetitionEdition(
  tx: CompetitionTx,
  ctx: Context | undefined,
  editionId: string
) {
  const edition = await getEditionForUpdate(tx, editionId);
  if (!edition) {
    throw new Error("Edition not found");
  }
  await assertCanManageKalakritiCompetitionConfiguration(tx, ctx, editionId);
  assertKalakritiEditionStructurallyConfigurable(edition.lifecycle);
  assertIsLoggedIn(ctx);
  return edition;
}

async function insertAudit(
  tx: CompetitionTx,
  ctx: Context,
  values: {
    action: string;
    auditEntryId: string;
    domain: string;
    editionId: string;
    metadata?: Record<string, unknown> | null;
    now: number;
    targetId: string;
    targetType: string;
  }
) {
  await tx.mutate.kalakritiAuditEntry.insert({
    action: values.action,
    actorUserId: ctx.userId,
    createdAt: values.now,
    domain: values.domain,
    editionId: values.editionId,
    id: values.auditEntryId,
    metadata: values.metadata ?? null,
    reason: null,
    targetId: values.targetId,
    targetType: values.targetType,
  });
}

async function getCategory(tx: CompetitionTx, id: string) {
  return (await tx.run(
    zql.kalakritiCompetitionCategory.where("id", id).one()
  )) as
    | { editionId: string; id: string; name: string; retiredAt: number | null }
    | undefined;
}

async function getCompetition(tx: CompetitionTx, id: string) {
  return (await tx.run(zql.kalakritiCompetition.where("id", id).one())) as
    | {
        cancelledAt: number | null;
        competitionCategoryId: string;
        editionId: string;
        genderEligibility: "both" | "female" | "male";
        id: string;
        maximumGroupSize: number;
        minimumGroupSize: number;
        musicUploadEnabled: boolean;
        name: string;
        participationMode: "group" | "individual";
        retiredAt: number | null;
      }
    | undefined;
}

async function getCompetitionCategoryIds(
  tx: CompetitionTx,
  competitionIds: string[]
) {
  const competitions = await Promise.all(
    competitionIds.map((competitionId) => getCompetition(tx, competitionId))
  );
  return [
    ...new Set(
      competitions.flatMap((competition) =>
        competition ? [competition.competitionCategoryId] : []
      )
    ),
  ].sort();
}

async function competitionHasEntries(
  tx: CompetitionTx,
  competitionId: string
): Promise<boolean> {
  const entry = await tx.run(
    zql.kalakritiCompetitionEntry
      .whereExists("division", (division) =>
        division.where("competitionId", competitionId)
      )
      .one()
  );
  return Boolean(entry);
}

interface DivisionEntrySnapshot {
  members: readonly {
    student?: {
      entryMemberships: readonly {
        entry?: {
          division?: {
            sessions: readonly {
              cancelledAt: number | null;
              endAt: number;
              id: string;
              startAt: number;
            }[];
          };
        };
      }[];
    };
  }[];
}

async function assertDivisionEntriesDoNotConflict(
  tx: CompetitionTx,
  values: {
    divisionId: string;
    endAt: number;
    excludedSessionId?: string;
    startAt: number;
  }
): Promise<number> {
  const entries = (await tx.run(
    zql.kalakritiCompetitionEntry
      .where("divisionId", values.divisionId)
      .related("members", (member) =>
        member.related("student", (student) =>
          student.related("entryMemberships", (membership) =>
            membership.related("entry", (entry) =>
              entry.related("division", (division) =>
                division.related("sessions", (session) =>
                  session.where("cancelledAt", "IS", null)
                )
              )
            )
          )
        )
      )
  )) as readonly DivisionEntrySnapshot[];
  const createsConflict = entries.some((entry) =>
    entry.members.some((member) =>
      member.student?.entryMemberships.some(({ entry: otherEntry }) =>
        otherEntry?.division?.sessions.some(
          (otherSession) =>
            otherSession.cancelledAt === null &&
            otherSession.id !== values.excludedSessionId &&
            otherSession.startAt < values.endAt &&
            otherSession.endAt > values.startAt
        )
      )
    )
  );
  if (createsConflict) {
    throw new Error(
      "Session time would overlap another Entry for a registered Student"
    );
  }
  return entries.length;
}

async function assertSessionUpdatePreservesEntries(
  tx: CompetitionTx,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  values: {
    divisionId: string;
    endAt: number;
    startAt: number;
  }
): Promise<void> {
  const sourceEntryCount = await assertDivisionEntriesDoNotConflict(tx, {
    divisionId: session.divisionId,
    endAt: values.endAt,
    excludedSessionId: session.id,
    startAt: values.startAt,
  });
  if (sourceEntryCount > 0 && values.divisionId !== session.divisionId) {
    throw new Error("Session Division cannot change while Entries exist");
  }
  if (values.divisionId !== session.divisionId) {
    await assertDivisionEntriesDoNotConflict(tx, {
      divisionId: values.divisionId,
      endAt: values.endAt,
      excludedSessionId: session.id,
      startAt: values.startAt,
    });
  }
}

async function getVenue(tx: CompetitionTx, id: string) {
  return (await tx.run(zql.kalakritiVenue.where("id", id).one())) as
    | { editionId: string; id: string; name: string; retiredAt: number | null }
    | undefined;
}

async function getSession(tx: CompetitionTx, id: string) {
  return (await tx.run(
    zql.kalakritiCompetitionSession.where("id", id).one()
  )) as
    | {
        cancelledAt: number | null;
        divisionId: string;
        editionId: string;
        endAt: number;
        id: string;
        startAt: number;
        venueId: string;
      }
    | undefined;
}

async function getDivision(tx: CompetitionTx, id: string) {
  return (await tx.run(
    zql.kalakritiCompetitionDivision.where("id", id).one()
  )) as
    | {
        ageCategoryId: string;
        competitionId: string;
        editionId: string;
        id: string;
      }
    | undefined;
}

function requireSameEdition(
  entity: { editionId: string } | undefined,
  editionId: string,
  label: string
): asserts entity is { editionId: string } {
  if (!entity || entity.editionId !== editionId) {
    throw new Error(`${label} not found in this Edition`);
  }
}

async function validateSessionValues(
  tx: CompetitionTx,
  edition: { eventDate: string; id: string; timezone: string },
  values: {
    divisionId: string;
    endAt: number;
    sessionId: string;
    startAt: number;
    venueId: string;
  }
) {
  const [division, venue, sessions] = await Promise.all([
    getDivision(tx, values.divisionId),
    getVenue(tx, values.venueId),
    tx.run(
      zql.kalakritiCompetitionSession.where("editionId", edition.id)
    ) as Promise<
      Array<{
        cancelledAt: number | null;
        endAt: number;
        id: string;
        startAt: number;
        venueId: string;
      }>
    >,
  ]);
  requireSameEdition(division, edition.id, "Competition Division");
  const competition = division
    ? await getCompetition(tx, division.competitionId)
    : undefined;
  requireSameEdition(competition, edition.id, "Competition");
  requireSameEdition(venue, edition.id, "Venue");
  if (competition?.retiredAt !== null || competition.cancelledAt !== null) {
    throw new Error("Competition is not active");
  }
  if (venue?.retiredAt !== null) {
    throw new Error("Venue is retired");
  }
  const validation = validateKalakritiSessionSchedule(
    {
      cancelledAt: null,
      endAt: values.endAt,
      id: values.sessionId,
      startAt: values.startAt,
      venueId: values.venueId,
    },
    edition.eventDate,
    edition.timezone,
    sessions
  );
  if (!validation.valid) {
    if (validation.reason === "venue_overlap") {
      throw new Error("Venue already has an overlapping Session");
    }
    if (validation.reason === "outside_event_date") {
      throw new Error("Session must fall on the Edition event date");
    }
    throw new Error("Session end time must be after its start time");
  }
  return competition;
}

async function validateDivisionAgeCategories(
  tx: CompetitionTx,
  editionId: string,
  divisions: readonly { ageCategoryId: string }[]
) {
  const ageCategories = await Promise.all(
    divisions.map((division) =>
      tx.run(zql.kalakritiAgeCategory.where("id", division.ageCategoryId).one())
    )
  );
  for (const ageCategory of ageCategories) {
    requireSameEdition(
      ageCategory as { editionId: string } | undefined,
      editionId,
      "Age Category"
    );
  }
}

async function insertCompetitionDivisions(
  tx: CompetitionTx,
  ctx: Context,
  values: {
    competitionId: string;
    divisions: readonly {
      ageCategoryId: string;
      divisionId: string;
    }[];
    editionId: string;
    now: number;
  }
) {
  await validateDivisionAgeCategories(tx, values.editionId, values.divisions);
  await Promise.all(
    values.divisions.map((division) =>
      tx.mutate.kalakritiCompetitionDivision.insert({
        ageCategoryId: division.ageCategoryId,
        competitionId: values.competitionId,
        createdAt: values.now,
        createdBy: ctx.userId,
        editionId: values.editionId,
        id: division.divisionId,
        updatedAt: values.now,
      })
    )
  );
}

async function syncCompetitionDivisions(
  tx: CompetitionTx,
  ctx: Context,
  values: {
    competitionId: string;
    divisions: readonly {
      ageCategoryId: string;
      divisionId: string;
    }[];
    editionId: string;
    now: number;
  }
) {
  await validateDivisionAgeCategories(tx, values.editionId, values.divisions);
  const existing = (await tx.run(
    zql.kalakritiCompetitionDivision.where(
      "competitionId",
      values.competitionId
    )
  )) as readonly {
    ageCategoryId: string;
    id: string;
  }[];
  const nextById = new Map(
    values.divisions.map((division) => [division.divisionId, division])
  );

  await Promise.all(
    existing.map(async (division) => {
      const next = nextById.get(division.id);
      if (!next) {
        const [entry, session] = await Promise.all([
          tx.run(
            zql.kalakritiCompetitionEntry.where("divisionId", division.id).one()
          ),
          tx.run(
            zql.kalakritiCompetitionSession
              .where("divisionId", division.id)
              .one()
          ),
        ]);
        if (entry || session) {
          throw new Error(
            "Age Category cannot be removed while its Division has Entries or a Session"
          );
        }
        await tx.mutate.kalakritiCompetitionDivision.delete({
          id: division.id,
        });
        return;
      }
      if (next.ageCategoryId !== division.ageCategoryId) {
        throw new Error("Competition Division Age Category cannot change");
      }
      nextById.delete(division.id);
    })
  );

  await insertCompetitionDivisions(tx, ctx, {
    ...values,
    divisions: [...nextById.values()],
  });
}

export const kalakritiCompetitionMutators = {
  createCategory: defineMutator(
    kalakritiCompetitionCategoryCreateSchema,
    async ({ tx, ctx, args }) => {
      await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        args.editionId
      );
      const normalized = normalizeKalakritiConfigurationName(args.name);
      await tx.mutate.kalakritiCompetitionCategory.insert({
        createdAt: args.now,
        createdBy: ctx.userId,
        editionId: args.editionId,
        id: args.categoryId,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        retiredAt: null,
        sortOrder: args.sortOrder,
        updatedAt: args.now,
      });
      await insertAudit(tx, ctx, {
        action: "created",
        auditEntryId: args.auditEntryId,
        domain: "competition_configuration",
        editionId: args.editionId,
        metadata: {
          competitionCategoryId: args.categoryId,
          name: normalized.name,
        },
        now: args.now,
        targetId: args.categoryId,
        targetType: "competition_category",
      });
    }
  ),

  createCompetition: defineMutator(
    kalakritiCompetitionCreateSchema,
    async ({ tx, ctx, args }) => {
      await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        args.editionId
      );
      const category = await getCategory(tx, args.competitionCategoryId);
      requireSameEdition(category, args.editionId, "Competition Category");
      if (category?.retiredAt !== null) {
        throw new Error("Competition Category is retired");
      }
      const normalized = normalizeKalakritiConfigurationName(args.name);
      await tx.mutate.kalakritiCompetition.insert({
        cancelledAt: null,
        competitionCategoryId: args.competitionCategoryId,
        createdAt: args.now,
        createdBy: ctx.userId,
        editionId: args.editionId,
        genderEligibility: args.genderEligibility,
        id: args.competitionId,
        maximumGroupSize: args.maximumGroupSize,
        minimumGroupSize: args.minimumGroupSize,
        musicUploadEnabled: args.musicUploadEnabled,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        participationMode: args.participationMode,
        retiredAt: null,
        updatedAt: args.now,
      });
      await insertCompetitionDivisions(tx, ctx, {
        competitionId: args.competitionId,
        divisions: args.divisions,
        editionId: args.editionId,
        now: args.now,
      });
      await insertAudit(tx, ctx, {
        action: "created",
        auditEntryId: args.auditEntryId,
        domain: "competition_configuration",
        editionId: args.editionId,
        metadata: {
          ageCategoryIds: args.divisions.map(
            (division) => division.ageCategoryId
          ),
          competitionCategoryId: args.competitionCategoryId,
          name: normalized.name,
        },
        now: args.now,
        targetId: args.competitionId,
        targetType: "competition",
      });
    }
  ),

  createSession: defineMutator(
    kalakritiCompetitionSessionCreateSchema,
    async ({ tx, ctx, args }) => {
      const edition = await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        args.editionId
      );
      const competition = await validateSessionValues(tx, edition, args);
      await assertDivisionEntriesDoNotConflict(tx, {
        divisionId: args.divisionId,
        endAt: args.endAt,
        startAt: args.startAt,
      });
      await tx.mutate.kalakritiCompetitionSession.insert({
        cancelledAt: null,
        createdAt: args.now,
        createdBy: ctx.userId,
        divisionId: args.divisionId,
        editionId: args.editionId,
        endAt: args.endAt,
        id: args.sessionId,
        startAt: args.startAt,
        updatedAt: args.now,
        venueId: args.venueId,
      });
      await insertAudit(tx, ctx, {
        action: "created",
        auditEntryId: args.auditEntryId,
        domain: "schedule_configuration",
        editionId: args.editionId,
        metadata: {
          competitionCategoryId: competition?.competitionCategoryId,
          competitionId: competition?.id,
          divisionId: args.divisionId,
          venueId: args.venueId,
        },
        now: args.now,
        targetId: args.sessionId,
        targetType: "competition_session",
      });
      if (edition.lifecycle !== "draft") {
        const impact = await getDivisionScheduleImpact(
          tx,
          args.divisionId,
          competition.id
        );
        pushKalakritiScheduleChangedTask(tx, ctx, {
          ...impact,
          editionId: args.editionId,
          revision: args.auditEntryId,
        });
      }
    }
  ),

  createVenue: defineMutator(
    kalakritiVenueCreateSchema,
    async ({ tx, ctx, args }) => {
      await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        args.editionId
      );
      const normalized = normalizeKalakritiConfigurationName(args.name);
      await tx.mutate.kalakritiVenue.insert({
        createdAt: args.now,
        createdBy: ctx.userId,
        editionId: args.editionId,
        id: args.venueId,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        retiredAt: null,
        updatedAt: args.now,
      });
      await insertAudit(tx, ctx, {
        action: "created",
        auditEntryId: args.auditEntryId,
        domain: "schedule_configuration",
        editionId: args.editionId,
        metadata: { name: normalized.name },
        now: args.now,
        targetId: args.venueId,
        targetType: "venue",
      });
    }
  ),

  deleteCategory: defineMutator(
    kalakritiCompetitionActionSchema,
    async ({ tx, ctx, args }) => {
      const category = await getCategory(tx, args.id);
      if (!category) {
        throw new Error("Competition Category not found");
      }
      await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        category.editionId
      );
      const [competition, assignment] = await Promise.all([
        tx.run(
          zql.kalakritiCompetition
            .where("competitionCategoryId", category.id)
            .one()
        ),
        tx.run(
          zql.kalakritiAssignment
            .where("competitionCategoryId", category.id)
            .one()
        ),
      ]);
      if (competition || assignment) {
        throw new Error(
          "Competition Category is referenced and cannot be deleted"
        );
      }
      await tx.mutate.kalakritiCompetitionCategory.delete({ id: category.id });
      await insertAudit(tx, ctx, {
        action: "deleted",
        auditEntryId: args.auditEntryId,
        domain: "competition_configuration",
        editionId: category.editionId,
        metadata: {
          competitionCategoryId: category.id,
          name: category.name,
        },
        now: args.now,
        targetId: category.id,
        targetType: "competition_category",
      });
    }
  ),

  deleteCompetition: defineMutator(
    kalakritiCompetitionActionSchema,
    async ({ tx, ctx, args }) => {
      const competition = await getCompetition(tx, args.id);
      if (!competition) {
        throw new Error("Competition not found");
      }
      await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        competition.editionId
      );
      const [hasEntries, session, assignment] = await Promise.all([
        competitionHasEntries(tx, competition.id),
        tx.run(
          zql.kalakritiCompetitionSession
            .whereExists("division", (division) =>
              division.where("competitionId", competition.id)
            )
            .one()
        ),
        tx.run(
          zql.kalakritiAssignment.where("competitionId", competition.id).one()
        ),
      ]);
      if (hasEntries || session || assignment) {
        throw new Error("Competition is referenced and cannot be deleted");
      }
      await tx.mutate.kalakritiCompetition.delete({ id: competition.id });
      await insertAudit(tx, ctx, {
        action: "deleted",
        auditEntryId: args.auditEntryId,
        domain: "competition_configuration",
        editionId: competition.editionId,
        metadata: {
          competitionCategoryId: competition.competitionCategoryId,
          name: competition.name,
        },
        now: args.now,
        targetId: competition.id,
        targetType: "competition",
      });
    }
  ),

  deleteSession: defineMutator(
    kalakritiCompetitionActionSchema,
    async ({ tx, ctx, args }) => {
      const session = await getSession(tx, args.id);
      if (!session) {
        throw new Error("Competition Session not found");
      }
      const edition = await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        session.editionId
      );
      const entry = await tx.run(
        zql.kalakritiCompetitionEntry
          .where("divisionId", session.divisionId)
          .one()
      );
      if (entry) {
        throw new Error("Session has Entries and cannot be deleted");
      }
      await tx.mutate.kalakritiCompetitionSession.delete({ id: session.id });
      const division = await getDivision(tx, session.divisionId);
      const competition = division
        ? await getCompetition(tx, division.competitionId)
        : undefined;
      const impact = competition
        ? await getDivisionScheduleImpact(
            tx,
            session.divisionId,
            competition.id
          )
        : { centerIds: [], competitionIds: [] };
      await insertAudit(tx, ctx, {
        action: "deleted",
        auditEntryId: args.auditEntryId,
        domain: "schedule_configuration",
        editionId: session.editionId,
        metadata: {
          competitionCategoryId: competition?.competitionCategoryId,
          competitionId: competition?.id,
          divisionId: session.divisionId,
        },
        now: args.now,
        targetId: session.id,
        targetType: "competition_session",
      });
      if (edition.lifecycle !== "draft") {
        pushKalakritiScheduleChangedTask(tx, ctx, {
          ...impact,
          editionId: session.editionId,
          revision: args.auditEntryId,
        });
      }
    }
  ),

  deleteVenue: defineMutator(
    kalakritiCompetitionActionSchema,
    async ({ tx, ctx, args }) => {
      const venue = await getVenue(tx, args.id);
      if (!venue) {
        throw new Error("Venue not found");
      }
      await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        venue.editionId
      );
      const session = await tx.run(
        zql.kalakritiCompetitionSession.where("venueId", venue.id).one()
      );
      if (session) {
        throw new Error("Venue has Sessions and cannot be deleted");
      }
      await tx.mutate.kalakritiVenue.delete({ id: venue.id });
      await insertAudit(tx, ctx, {
        action: "deleted",
        auditEntryId: args.auditEntryId,
        domain: "schedule_configuration",
        editionId: venue.editionId,
        metadata: { name: venue.name },
        now: args.now,
        targetId: venue.id,
        targetType: "venue",
      });
    }
  ),

  setCategoryRetired: defineMutator(
    kalakritiCompetitionStateSchema,
    async ({ tx, ctx, args }) => {
      const category = await getCategory(tx, args.id);
      if (!category) {
        throw new Error("Competition Category not found");
      }
      await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        category.editionId
      );
      await tx.mutate.kalakritiCompetitionCategory.update({
        id: category.id,
        retiredAt: args.enabled ? args.now : null,
        updatedAt: args.now,
      });
      await insertAudit(tx, ctx, {
        action: args.enabled ? "retired" : "restored",
        auditEntryId: args.auditEntryId,
        domain: "competition_configuration",
        editionId: category.editionId,
        metadata: { competitionCategoryId: category.id },
        now: args.now,
        targetId: category.id,
        targetType: "competition_category",
      });
    }
  ),

  setCompetitionCancelled: defineMutator(
    kalakritiCompetitionStateSchema,
    async ({ tx, ctx, args }) => {
      const competition = await getCompetition(tx, args.id);
      if (!competition) {
        throw new Error("Competition not found");
      }
      const edition = await lockCompetitionEdition(
        tx,
        ctx,
        competition.editionId
      );
      const { centerIds } = await getCompetitionScheduleImpact(
        tx,
        competition.id
      );
      await tx.mutate.kalakritiCompetition.update({
        cancelledAt: args.enabled ? args.now : null,
        id: competition.id,
        updatedAt: args.now,
      });
      await insertAudit(tx, ctx, {
        action: args.enabled ? "cancelled" : "restored",
        auditEntryId: args.auditEntryId,
        domain: "competition_configuration",
        editionId: competition.editionId,
        metadata: {
          competitionCategoryId: competition.competitionCategoryId,
        },
        now: args.now,
        targetId: competition.id,
        targetType: "competition",
      });
      if (edition.lifecycle !== "draft") {
        pushKalakritiScheduleChangedTask(tx, ctx, {
          centerIds,
          competitionIds: [competition.id],
          editionId: competition.editionId,
          revision: args.auditEntryId,
        });
      }
    }
  ),

  setCompetitionRetired: defineMutator(
    kalakritiCompetitionStateSchema,
    async ({ tx, ctx, args }) => {
      const competition = await getCompetition(tx, args.id);
      if (!competition) {
        throw new Error("Competition not found");
      }
      await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        competition.editionId
      );
      await tx.mutate.kalakritiCompetition.update({
        id: competition.id,
        retiredAt: args.enabled ? args.now : null,
        updatedAt: args.now,
      });
      await insertAudit(tx, ctx, {
        action: args.enabled ? "retired" : "restored",
        auditEntryId: args.auditEntryId,
        domain: "competition_configuration",
        editionId: competition.editionId,
        metadata: {
          competitionCategoryId: competition.competitionCategoryId,
        },
        now: args.now,
        targetId: competition.id,
        targetType: "competition",
      });
    }
  ),

  setSessionCancelled: defineMutator(
    kalakritiCompetitionStateSchema,
    async ({ tx, ctx, args }) => {
      const session = await getSession(tx, args.id);
      if (!session) {
        throw new Error("Competition Session not found");
      }
      const edition = await lockCompetitionEdition(tx, ctx, session.editionId);
      const division = await getDivision(tx, session.divisionId);
      requireSameEdition(division, session.editionId, "Competition Division");
      const competition = await getCompetition(tx, division.competitionId);
      requireSameEdition(competition, session.editionId, "Competition");
      if (!args.enabled) {
        await validateSessionValues(tx, edition, {
          divisionId: session.divisionId,
          endAt: session.endAt,
          sessionId: session.id,
          startAt: session.startAt,
          venueId: session.venueId,
        });
        await assertDivisionEntriesDoNotConflict(tx, {
          divisionId: session.divisionId,
          endAt: session.endAt,
          excludedSessionId: session.id,
          startAt: session.startAt,
        });
      }
      const { centerIds } = await getSessionScheduleImpact(
        tx,
        session.id,
        competition.id
      );
      await tx.mutate.kalakritiCompetitionSession.update({
        cancelledAt: args.enabled ? args.now : null,
        id: session.id,
        updatedAt: args.now,
      });
      await insertAudit(tx, ctx, {
        action: args.enabled ? "cancelled" : "restored",
        auditEntryId: args.auditEntryId,
        domain: "schedule_configuration",
        editionId: session.editionId,
        metadata: {
          competitionCategoryId: competition?.competitionCategoryId,
          competitionId: competition?.id,
          divisionId: session.divisionId,
        },
        now: args.now,
        targetId: session.id,
        targetType: "competition_session",
      });
      if (edition.lifecycle !== "draft") {
        pushKalakritiScheduleChangedTask(tx, ctx, {
          centerIds,
          competitionIds: competition ? [competition.id] : [],
          editionId: session.editionId,
          revision: args.auditEntryId,
        });
      }
    }
  ),

  setVenueRetired: defineMutator(
    kalakritiCompetitionStateSchema,
    async ({ tx, ctx, args }) => {
      const venue = await getVenue(tx, args.id);
      if (!venue) {
        throw new Error("Venue not found");
      }
      await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        venue.editionId
      );
      const impact = await getVenueScheduleImpact(tx, venue.id);
      const competitionCategoryIds = await getCompetitionCategoryIds(
        tx,
        impact.competitionIds
      );
      await tx.mutate.kalakritiVenue.update({
        id: venue.id,
        retiredAt: args.enabled ? args.now : null,
        updatedAt: args.now,
      });
      await insertAudit(tx, ctx, {
        action: args.enabled ? "retired" : "restored",
        auditEntryId: args.auditEntryId,
        domain: "schedule_configuration",
        editionId: venue.editionId,
        metadata: {
          competitionCategoryIds,
          competitionIds: impact.competitionIds,
        },
        now: args.now,
        targetId: venue.id,
        targetType: "venue",
      });
    }
  ),

  updateCategory: defineMutator(
    kalakritiCompetitionCategoryUpdateSchema,
    async ({ tx, ctx, args }) => {
      const category = await getCategory(tx, args.categoryId);
      if (!category) {
        throw new Error("Competition Category not found");
      }
      await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        category.editionId
      );
      const normalized = normalizeKalakritiConfigurationName(args.name);
      await tx.mutate.kalakritiCompetitionCategory.update({
        id: category.id,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        sortOrder: args.sortOrder,
        updatedAt: args.now,
      });
      await insertAudit(tx, ctx, {
        action: "updated",
        auditEntryId: args.auditEntryId,
        domain: "competition_configuration",
        editionId: category.editionId,
        metadata: {
          competitionCategoryId: category.id,
          name: normalized.name,
        },
        now: args.now,
        targetId: category.id,
        targetType: "competition_category",
      });
    }
  ),

  updateCompetition: defineMutator(
    kalakritiCompetitionUpdateSchema,
    async ({ tx, ctx, args }) => {
      const competition = await getCompetition(tx, args.competitionId);
      if (!competition) {
        throw new Error("Competition not found");
      }
      const edition = await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        competition.editionId
      );
      const category = await getCategory(tx, args.competitionCategoryId);
      requireSameEdition(
        category,
        competition.editionId,
        "Competition Category"
      );
      if (category?.retiredAt !== null) {
        throw new Error("Competition Category is retired");
      }
      if (
        (args.competitionCategoryId !== competition.competitionCategoryId ||
          args.genderEligibility !== competition.genderEligibility ||
          args.maximumGroupSize !== competition.maximumGroupSize ||
          args.minimumGroupSize !== competition.minimumGroupSize ||
          args.participationMode !== competition.participationMode) &&
        (await competitionHasEntries(tx, competition.id))
      ) {
        throw new Error(
          "Competition eligibility cannot change while Entries exist"
        );
      }
      const normalized = normalizeKalakritiConfigurationName(args.name);
      const publicScheduleChanged = normalized.name !== competition.name;
      await tx.mutate.kalakritiCompetition.update({
        competitionCategoryId: args.competitionCategoryId,
        genderEligibility: args.genderEligibility,
        id: competition.id,
        maximumGroupSize: args.maximumGroupSize,
        minimumGroupSize: args.minimumGroupSize,
        musicUploadEnabled: args.musicUploadEnabled,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        participationMode: args.participationMode,
        updatedAt: args.now,
      });
      await syncCompetitionDivisions(tx, ctx, {
        competitionId: competition.id,
        divisions: args.divisions,
        editionId: competition.editionId,
        now: args.now,
      });
      await insertAudit(tx, ctx, {
        action: "updated",
        auditEntryId: args.auditEntryId,
        domain: "competition_configuration",
        editionId: competition.editionId,
        metadata: {
          ageCategoryIds: args.divisions.map(
            (division) => division.ageCategoryId
          ),
          competitionCategoryId: args.competitionCategoryId,
          competitionCategoryIds: [
            competition.competitionCategoryId,
            args.competitionCategoryId,
          ],
          name: normalized.name,
        },
        now: args.now,
        targetId: competition.id,
        targetType: "competition",
      });
      if (edition.lifecycle !== "draft" && publicScheduleChanged) {
        const impact = await getCompetitionScheduleImpact(tx, competition.id);
        pushKalakritiScheduleChangedTask(tx, ctx, {
          ...impact,
          editionId: competition.editionId,
          revision: args.auditEntryId,
        });
      }
    }
  ),

  updateSession: defineMutator(
    kalakritiCompetitionSessionUpdateSchema,
    async ({ tx, ctx, args }) => {
      const session = await getSession(tx, args.sessionId);
      if (!session) {
        throw new Error("Competition Session not found");
      }
      const edition = await lockCompetitionEdition(tx, ctx, session.editionId);
      if (
        edition.lifecycle === "registration_locked" &&
        args.divisionId !== session.divisionId
      ) {
        throw new Error(
          "Session Division cannot change after registration is locked"
        );
      }
      await assertSessionUpdatePreservesEntries(tx, session, args);
      const nextCompetition = await validateSessionValues(tx, edition, args);
      const previousDivision = await getDivision(tx, session.divisionId);
      requireSameEdition(
        previousDivision,
        session.editionId,
        "Competition Division"
      );
      const previousCompetition = await getCompetition(
        tx,
        previousDivision.competitionId
      );
      requireSameEdition(previousCompetition, session.editionId, "Competition");
      const { centerIds } = await getSessionScheduleImpact(
        tx,
        session.id,
        previousCompetition.id
      );
      const nextImpact = await getDivisionScheduleImpact(
        tx,
        args.divisionId,
        nextCompetition.id
      );
      await tx.mutate.kalakritiCompetitionSession.update({
        divisionId: args.divisionId,
        endAt: args.endAt,
        id: session.id,
        startAt: args.startAt,
        updatedAt: args.now,
        venueId: args.venueId,
      });
      await insertAudit(tx, ctx, {
        action: "updated",
        auditEntryId: args.auditEntryId,
        domain: "schedule_configuration",
        editionId: session.editionId,
        metadata: {
          competitionCategoryId: nextCompetition?.competitionCategoryId,
          competitionCategoryIds: [
            previousCompetition?.competitionCategoryId,
            nextCompetition?.competitionCategoryId,
          ].filter((id): id is string => Boolean(id)),
          competitionId: nextCompetition?.id,
          competitionIds: [previousCompetition?.id, nextCompetition?.id].filter(
            (id): id is string => Boolean(id)
          ),
          divisionId: args.divisionId,
        },
        now: args.now,
        targetId: session.id,
        targetType: "competition_session",
      });
      if (edition.lifecycle !== "draft") {
        pushKalakritiScheduleChangedTask(tx, ctx, {
          centerIds: [...centerIds, ...nextImpact.centerIds],
          competitionIds: [previousCompetition?.id, nextCompetition?.id].filter(
            (id): id is string => Boolean(id)
          ),
          editionId: session.editionId,
          revision: args.auditEntryId,
        });
      }
    }
  ),

  updateVenue: defineMutator(
    kalakritiVenueUpdateSchema,
    async ({ tx, ctx, args }) => {
      const venue = await getVenue(tx, args.venueId);
      if (!venue) {
        throw new Error("Venue not found");
      }
      const edition = await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        venue.editionId
      );
      const normalized = normalizeKalakritiConfigurationName(args.name);
      const publicScheduleChanged = normalized.name !== venue.name;
      const impact = await getVenueScheduleImpact(tx, venue.id);
      const competitionCategoryIds = await getCompetitionCategoryIds(
        tx,
        impact.competitionIds
      );
      await tx.mutate.kalakritiVenue.update({
        id: venue.id,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        updatedAt: args.now,
      });
      await insertAudit(tx, ctx, {
        action: "updated",
        auditEntryId: args.auditEntryId,
        domain: "schedule_configuration",
        editionId: venue.editionId,
        metadata: {
          competitionCategoryIds,
          competitionIds: impact.competitionIds,
          name: normalized.name,
        },
        now: args.now,
        targetId: venue.id,
        targetType: "venue",
      });
      if (edition.lifecycle !== "draft" && publicScheduleChanged) {
        pushKalakritiScheduleChangedTask(tx, ctx, {
          ...impact,
          editionId: venue.editionId,
          revision: args.auditEntryId,
        });
      }
    }
  ),
};
