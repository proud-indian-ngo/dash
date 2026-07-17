import {
  findKalakritiAgeCategoryOverlap,
  normalizeKalakritiAgeCategoryName,
} from "@pi-dash/shared/kalakriti";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import type { Context } from "../context";
import { assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";
import {
  assertCanManageKalakritiConfiguration,
  assertKalakritiEditionConfigurable,
} from "./kalakriti-config-access";
import {
  getAgeCategoryForUpdate,
  getCenterForUpdate,
  getEditionAgeCategoriesForUpdate,
  getEditionForUpdate,
  type LockableKalakritiTx,
} from "./kalakriti-row-locks";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

interface EligibilityTx extends LockableKalakritiTx {
  mutate: {
    kalakritiAgeCategory: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    kalakritiAuditEntry: { insert: ZeroMutationFn };
    kalakritiCenterAgeQuota: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
  };
}

const ageCategoryValuesSchema = z
  .object({
    maxCompetitionsPerCategory: z.number().int().min(1),
    maximumAge: z.number().int().min(0).max(100),
    maxTotalCompetitions: z.number().int().min(1),
    minimumAge: z.number().int().min(0).max(100),
    name: z.string().trim().min(2).max(120),
    sortOrder: z.number().int().min(0),
  })
  .refine((value) => value.maximumAge >= value.minimumAge, {
    message: "Maximum age must be at least the minimum age",
  })
  .refine(
    (value) => value.maxCompetitionsPerCategory <= value.maxTotalCompetitions,
    {
      message: "Per-category Competition limit cannot exceed the total limit",
    }
  );

export const kalakritiAgeCategoryCreateSchema = ageCategoryValuesSchema.extend({
  ageCategoryId: z.string(),
  auditEntryId: z.string(),
  editionId: z.string(),
  now: z.number(),
});

export const kalakritiAgeCategoryUpdateSchema = ageCategoryValuesSchema.extend({
  ageCategoryId: z.string(),
  auditEntryId: z.string(),
  now: z.number(),
});

export const kalakritiEligibilityDeleteSchema = z.object({
  auditEntryId: z.string(),
  id: z.string(),
  now: z.number(),
});

export const kalakritiCenterAgeQuotaSetSchema = z.object({
  ageCategoryId: z.string(),
  auditEntryId: z.string(),
  centerId: z.string(),
  editionId: z.string(),
  femaleStudentLimit: z.number().int().min(0),
  maleStudentLimit: z.number().int().min(0),
  now: z.number(),
  quotaId: z.string(),
});

async function lockConfigurableEdition(
  tx: EligibilityTx,
  ctx: Context | undefined,
  editionId: string
) {
  const edition = await getEditionForUpdate(tx, editionId);
  if (!edition) {
    throw new Error("Edition not found");
  }
  await assertCanManageKalakritiConfiguration(tx, ctx, editionId);
  assertKalakritiEditionConfigurable(edition.lifecycle);
  assertIsLoggedIn(ctx);
  return edition;
}

function assertNoOverlap(
  categories: readonly {
    id: string;
    maximumAge: number;
    minimumAge: number;
    name: string;
  }[]
): void {
  const overlap = findKalakritiAgeCategoryOverlap(categories);
  if (overlap) {
    throw new Error(
      `Age ranges overlap between ${overlap[0]} and ${overlap[1]}`
    );
  }
}

export const kalakritiEligibilityMutators = {
  createAgeCategory: defineMutator(
    kalakritiAgeCategoryCreateSchema,
    async ({ tx, ctx, args }) => {
      await lockConfigurableEdition(tx, ctx, args.editionId);
      const categories = await getEditionAgeCategoriesForUpdate(
        tx,
        args.editionId
      );
      const normalized = normalizeKalakritiAgeCategoryName(args.name);
      assertNoOverlap([
        ...categories,
        {
          id: args.ageCategoryId,
          maximumAge: args.maximumAge,
          minimumAge: args.minimumAge,
          name: normalized.name,
        },
      ]);

      await tx.mutate.kalakritiAgeCategory.insert({
        createdAt: args.now,
        createdBy: ctx.userId,
        editionId: args.editionId,
        id: args.ageCategoryId,
        maxCompetitionsPerCategory: args.maxCompetitionsPerCategory,
        maximumAge: args.maximumAge,
        maxTotalCompetitions: args.maxTotalCompetitions,
        minimumAge: args.minimumAge,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        sortOrder: args.sortOrder,
        updatedAt: args.now,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "created",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "age_category_configuration",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: {
          maximumAge: args.maximumAge,
          minimumAge: args.minimumAge,
          name: normalized.name,
        },
        reason: null,
        targetId: args.ageCategoryId,
        targetType: "age_category",
      });
    }
  ),

  deleteAgeCategory: defineMutator(
    kalakritiEligibilityDeleteSchema,
    async ({ tx, ctx, args }) => {
      const categorySnapshot = (await tx.run(
        zql.kalakritiAgeCategory.where("id", args.id).one()
      )) as { editionId: string } | undefined;
      if (!categorySnapshot) {
        throw new Error("Age Category not found");
      }
      await lockConfigurableEdition(tx, ctx, categorySnapshot.editionId);
      const category = await getAgeCategoryForUpdate(tx, args.id);
      if (!category || category.editionId !== categorySnapshot.editionId) {
        throw new Error("Age Category not found");
      }
      const quota = await tx.run(
        zql.kalakritiCenterAgeQuota.where("ageCategoryId", category.id).one()
      );
      if (quota) {
        throw new Error("Age Category has Center quotas and cannot be deleted");
      }
      await tx.mutate.kalakritiAgeCategory.delete({ id: category.id });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "deleted",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "age_category_configuration",
        editionId: category.editionId,
        id: args.auditEntryId,
        metadata: { name: category.name },
        reason: null,
        targetId: category.id,
        targetType: "age_category",
      });
    }
  ),

  deleteQuota: defineMutator(
    kalakritiEligibilityDeleteSchema,
    async ({ tx, ctx, args }) => {
      const quota = (await tx.run(
        zql.kalakritiCenterAgeQuota.where("id", args.id).one()
      )) as { editionId: string } | undefined;
      if (!quota) {
        throw new Error("Center quota not found");
      }
      await lockConfigurableEdition(tx, ctx, quota.editionId);
      const currentQuota = await tx.run(
        zql.kalakritiCenterAgeQuota.where("id", args.id).one()
      );
      if (!currentQuota) {
        throw new Error("Center quota not found");
      }
      await tx.mutate.kalakritiCenterAgeQuota.delete({ id: args.id });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "deleted",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "center_age_quota_configuration",
        editionId: quota.editionId,
        id: args.auditEntryId,
        metadata: null,
        reason: null,
        targetId: args.id,
        targetType: "center_age_quota",
      });
    }
  ),

  setQuota: defineMutator(
    kalakritiCenterAgeQuotaSetSchema,
    async ({ tx, ctx, args }) => {
      await lockConfigurableEdition(tx, ctx, args.editionId);
      const center = await getCenterForUpdate(tx, args.centerId);
      const ageCategory = await getAgeCategoryForUpdate(tx, args.ageCategoryId);
      if (!(center && center.editionId === args.editionId)) {
        throw new Error("Center not found in this Edition");
      }
      if (!(ageCategory && ageCategory.editionId === args.editionId)) {
        throw new Error("Age Category not found in this Edition");
      }
      const existing = (await tx.run(
        zql.kalakritiCenterAgeQuota
          .where("centerId", args.centerId)
          .where("ageCategoryId", args.ageCategoryId)
          .one()
      )) as { id: string } | undefined;
      const quotaId = existing ? existing.id : args.quotaId;
      const values = {
        femaleStudentLimit: args.femaleStudentLimit,
        id: quotaId,
        maleStudentLimit: args.maleStudentLimit,
        updatedAt: args.now,
      };
      if (existing) {
        await tx.mutate.kalakritiCenterAgeQuota.update(values);
      } else {
        await tx.mutate.kalakritiCenterAgeQuota.insert({
          ...values,
          ageCategoryId: args.ageCategoryId,
          centerId: args.centerId,
          createdAt: args.now,
          createdBy: ctx.userId,
          editionId: args.editionId,
        });
      }
      await tx.mutate.kalakritiAuditEntry.insert({
        action: existing ? "updated" : "created",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "center_age_quota_configuration",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: {
          ageCategoryId: args.ageCategoryId,
          centerId: args.centerId,
          femaleStudentLimit: args.femaleStudentLimit,
          maleStudentLimit: args.maleStudentLimit,
        },
        reason: null,
        targetId: quotaId,
        targetType: "center_age_quota",
      });
    }
  ),

  updateAgeCategory: defineMutator(
    kalakritiAgeCategoryUpdateSchema,
    async ({ tx, ctx, args }) => {
      const categorySnapshot = (await tx.run(
        zql.kalakritiAgeCategory.where("id", args.ageCategoryId).one()
      )) as { editionId: string } | undefined;
      if (!categorySnapshot) {
        throw new Error("Age Category not found");
      }
      await lockConfigurableEdition(tx, ctx, categorySnapshot.editionId);
      const category = await getAgeCategoryForUpdate(tx, args.ageCategoryId);
      if (!category || category.editionId !== categorySnapshot.editionId) {
        throw new Error("Age Category not found");
      }
      const categories = await getEditionAgeCategoriesForUpdate(
        tx,
        category.editionId
      );
      const normalized = normalizeKalakritiAgeCategoryName(args.name);
      assertNoOverlap([
        ...categories.filter((candidate) => candidate.id !== category.id),
        {
          id: category.id,
          maximumAge: args.maximumAge,
          minimumAge: args.minimumAge,
          name: normalized.name,
        },
      ]);
      await tx.mutate.kalakritiAgeCategory.update({
        id: category.id,
        maxCompetitionsPerCategory: args.maxCompetitionsPerCategory,
        maximumAge: args.maximumAge,
        maxTotalCompetitions: args.maxTotalCompetitions,
        minimumAge: args.minimumAge,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        sortOrder: args.sortOrder,
        updatedAt: args.now,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "updated",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "age_category_configuration",
        editionId: category.editionId,
        id: args.auditEntryId,
        metadata: {
          maximumAge: args.maximumAge,
          minimumAge: args.minimumAge,
          name: normalized.name,
        },
        reason: null,
        targetId: category.id,
        targetType: "age_category",
      });
    }
  ),
};
