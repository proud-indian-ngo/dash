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
    genderEligibility: z.enum(["male", "female", "both"]),
    maximumGroupSize: z.number().int().min(1).max(100),
    minimumGroupSize: z.number().int().min(1).max(100),
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
  ageCategoryId: z.string(),
  capacity: z.number().int().min(1),
  competitionId: z.string(),
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
        id: string;
        name: string;
        retiredAt: number | null;
      }
    | undefined;
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
        ageCategoryId: string;
        cancelledAt: number | null;
        capacity: number;
        competitionId: string;
        editionId: string;
        endAt: number;
        id: string;
        startAt: number;
        venueId: string;
      }
    | undefined;
}

function requireSameEdition(
  entity: { editionId: string } | undefined,
  editionId: string,
  label: string
) {
  if (!entity || entity.editionId !== editionId) {
    throw new Error(`${label} not found in this Edition`);
  }
}

async function validateSessionValues(
  tx: CompetitionTx,
  edition: { eventDate: string; id: string; timezone: string },
  values: {
    ageCategoryId: string;
    competitionId: string;
    endAt: number;
    sessionId: string;
    startAt: number;
    venueId: string;
  }
) {
  const [competition, ageCategory, venue, sessions] = await Promise.all([
    getCompetition(tx, values.competitionId),
    tx.run(zql.kalakritiAgeCategory.where("id", values.ageCategoryId).one()),
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
  requireSameEdition(competition, edition.id, "Competition");
  requireSameEdition(
    ageCategory as { editionId: string } | undefined,
    edition.id,
    "Age Category"
  );
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
        metadata: { name: normalized.name },
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
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        participationMode: args.participationMode,
        retiredAt: null,
        updatedAt: args.now,
      });
      await insertAudit(tx, ctx, {
        action: "created",
        auditEntryId: args.auditEntryId,
        domain: "competition_configuration",
        editionId: args.editionId,
        metadata: {
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
      await validateSessionValues(tx, edition, args);
      await tx.mutate.kalakritiCompetitionSession.insert({
        ageCategoryId: args.ageCategoryId,
        cancelledAt: null,
        capacity: args.capacity,
        competitionId: args.competitionId,
        createdAt: args.now,
        createdBy: ctx.userId,
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
          ageCategoryId: args.ageCategoryId,
          competitionId: args.competitionId,
          venueId: args.venueId,
        },
        now: args.now,
        targetId: args.sessionId,
        targetType: "competition_session",
      });
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
        metadata: { name: category.name },
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
      const [session, assignment] = await Promise.all([
        tx.run(
          zql.kalakritiCompetitionSession
            .where("competitionId", competition.id)
            .one()
        ),
        tx.run(
          zql.kalakritiAssignment.where("competitionId", competition.id).one()
        ),
      ]);
      if (session || assignment) {
        throw new Error("Competition is referenced and cannot be deleted");
      }
      await tx.mutate.kalakritiCompetition.delete({ id: competition.id });
      await insertAudit(tx, ctx, {
        action: "deleted",
        auditEntryId: args.auditEntryId,
        domain: "competition_configuration",
        editionId: competition.editionId,
        metadata: { name: competition.name },
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
      await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        session.editionId
      );
      await tx.mutate.kalakritiCompetitionSession.delete({ id: session.id });
      await insertAudit(tx, ctx, {
        action: "deleted",
        auditEntryId: args.auditEntryId,
        domain: "schedule_configuration",
        editionId: session.editionId,
        now: args.now,
        targetId: session.id,
        targetType: "competition_session",
      });
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
      await lockCompetitionEdition(tx, ctx, competition.editionId);
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
        now: args.now,
        targetId: competition.id,
        targetType: "competition",
      });
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
      if (!args.enabled) {
        await validateSessionValues(tx, edition, {
          ageCategoryId: session.ageCategoryId,
          competitionId: session.competitionId,
          endAt: session.endAt,
          sessionId: session.id,
          startAt: session.startAt,
          venueId: session.venueId,
        });
      }
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
        now: args.now,
        targetId: session.id,
        targetType: "competition_session",
      });
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
        metadata: { name: normalized.name },
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
      await lockStructurallyConfigurableCompetitionEdition(
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
      const normalized = normalizeKalakritiConfigurationName(args.name);
      await tx.mutate.kalakritiCompetition.update({
        competitionCategoryId: args.competitionCategoryId,
        genderEligibility: args.genderEligibility,
        id: competition.id,
        maximumGroupSize: args.maximumGroupSize,
        minimumGroupSize: args.minimumGroupSize,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        participationMode: args.participationMode,
        updatedAt: args.now,
      });
      await insertAudit(tx, ctx, {
        action: "updated",
        auditEntryId: args.auditEntryId,
        domain: "competition_configuration",
        editionId: competition.editionId,
        metadata: { name: normalized.name },
        now: args.now,
        targetId: competition.id,
        targetType: "competition",
      });
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
        (args.competitionId !== session.competitionId ||
          args.ageCategoryId !== session.ageCategoryId ||
          args.capacity !== session.capacity)
      ) {
        throw new Error(
          "Only Session time and Venue can be changed after registration is locked"
        );
      }
      await validateSessionValues(tx, edition, args);
      await tx.mutate.kalakritiCompetitionSession.update({
        ageCategoryId: args.ageCategoryId,
        capacity: args.capacity,
        competitionId: args.competitionId,
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
        now: args.now,
        targetId: session.id,
        targetType: "competition_session",
      });
    }
  ),

  updateVenue: defineMutator(
    kalakritiVenueUpdateSchema,
    async ({ tx, ctx, args }) => {
      const venue = await getVenue(tx, args.venueId);
      if (!venue) {
        throw new Error("Venue not found");
      }
      await lockStructurallyConfigurableCompetitionEdition(
        tx,
        ctx,
        venue.editionId
      );
      const normalized = normalizeKalakritiConfigurationName(args.name);
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
        metadata: { name: normalized.name },
        now: args.now,
        targetId: venue.id,
        targetType: "venue",
      });
    }
  ),
};
