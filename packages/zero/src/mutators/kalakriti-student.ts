import {
  deriveKalakritiAgeCategory,
  formatKalakritiStudentHumanId,
  normalizeKalakritiStudentName,
  requireKalakritiAgeCategoryOverrideReason,
} from "@pi-dash/shared/kalakriti";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import type { Context } from "../context";
import { assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";
import { assertCanManageKalakritiCenterRegistration } from "./kalakriti-registration-access";
import {
  getCenterForUpdate,
  getEditionAgeCategoriesForUpdate,
  getEditionForUpdate,
  getStudentForUpdate,
  type LockableKalakritiTx,
  type LockedAgeCategory,
  type LockedEdition,
  type LockedRegistrationEdition,
  type LockedStudent,
} from "./kalakriti-row-locks";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

interface StudentTx extends LockableKalakritiTx {
  mutate: {
    kalakritiAuditEntry: { insert: ZeroMutationFn };
    kalakritiCredential: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
    };
    kalakritiEdition: { update: ZeroMutationFn };
    kalakritiCompetitionEntry: { delete: ZeroMutationFn };
    kalakritiEntryMember: { delete: ZeroMutationFn };
    kalakritiStudent: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
  };
}

interface StudentEntryMembership {
  entry?: {
    id: string;
    members: readonly { id: string }[];
    session?: {
      ageCategoryId: string;
      competition?: { genderEligibility: "both" | "female" | "male" };
    };
  };
  id: string;
}

const studentValuesSchema = z.object({
  ageCategoryOverrideId: z.string().nullable(),
  ageCategoryOverrideReason: z.string().max(500).nullable(),
  dateOfBirth: z.iso.date(),
  duplicateConfirmed: z.boolean(),
  gender: z.enum(["male", "female"]),
  name: z.string().trim().min(2).max(160),
});

export const kalakritiStudentCreateSchema = studentValuesSchema.extend({
  auditEntryId: z.string(),
  centerId: z.string(),
  credentialId: z.string(),
  credentialTokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  editionId: z.string(),
  now: z.number(),
  studentId: z.string(),
});

export const kalakritiStudentUpdateSchema = studentValuesSchema.extend({
  auditEntryId: z.string(),
  now: z.number(),
  studentId: z.string(),
});

export const kalakritiStudentDeleteSchema = z.object({
  auditEntryId: z.string(),
  now: z.number(),
  studentId: z.string(),
});

type StudentValues = z.infer<typeof studentValuesSchema>;

function dateOnlyToTimestamp(value: string): number {
  const timestamp = new Date(`${value}T00:00:00Z`).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error("Date of birth is invalid");
  }
  return timestamp;
}

function assertRegistrationWritable(
  edition: LockedEdition,
  center: {
    editionId: string;
    retiredAt: number | null;
    studentRegistrationEnabled: boolean;
  }
): void {
  if (center.editionId !== edition.id || center.retiredAt !== null) {
    throw new Error("Center not found in this Edition");
  }
  if (edition.lifecycle !== "registration_open") {
    throw new Error("Student registration is not open for this Edition");
  }
  if (!center.studentRegistrationEnabled) {
    throw new Error("Student registration is closed for this Center");
  }
}

function assertRegistrationEditionComplete(
  edition: LockedEdition & Partial<LockedRegistrationEdition>
): asserts edition is LockedRegistrationEdition {
  if (
    edition.ageCutoffDate === undefined ||
    edition.nextStudentSequence === undefined ||
    edition.year === undefined
  ) {
    throw new Error("Edition registration data is incomplete");
  }
}

function resolveAgeCategory({
  categories,
  edition,
  isEditionAdmin,
  values,
}: {
  categories: readonly LockedAgeCategory[];
  edition: LockedRegistrationEdition;
  isEditionAdmin: boolean;
  values: StudentValues;
}): {
  ageCategoryId: string;
  ageCategoryOverrideReason: string | null;
  derivedAgeCategoryId: string;
} {
  const derivation = deriveKalakritiAgeCategory(
    values.dateOfBirth,
    edition.ageCutoffDate,
    categories
  );
  if (!derivation.eligible) {
    throw new Error(
      derivation.reason === "birth_after_cutoff"
        ? "Date of birth cannot be after the Edition age cutoff"
        : "Date of birth does not match an Age Category"
    );
  }
  if (!values.ageCategoryOverrideId) {
    if (values.ageCategoryOverrideReason?.trim()) {
      throw new Error("Choose an override Age Category for this reason");
    }
    return {
      ageCategoryId: derivation.category.id,
      ageCategoryOverrideReason: null,
      derivedAgeCategoryId: derivation.category.id,
    };
  }
  if (!isEditionAdmin) {
    throw new Error("Only an administrator can override the Age Category");
  }
  const override = categories.find(
    (category) => category.id === values.ageCategoryOverrideId
  );
  if (!override) {
    throw new Error("Override Age Category not found in this Edition");
  }
  if (override.id === derivation.category.id) {
    throw new Error("Override must choose a different Age Category");
  }
  return {
    ageCategoryId: override.id,
    ageCategoryOverrideReason: requireKalakritiAgeCategoryOverrideReason(
      values.ageCategoryOverrideReason ?? ""
    ),
    derivedAgeCategoryId: derivation.category.id,
  };
}

function resolveUpdatedAgeCategory({
  actorUserId,
  categories,
  edition,
  isEditionAdmin,
  now,
  student,
  values,
}: {
  actorUserId: string;
  categories: readonly LockedAgeCategory[];
  edition: LockedRegistrationEdition;
  isEditionAdmin: boolean;
  now: number;
  student: LockedStudent;
  values: StudentValues;
}): {
  ageCategory: ReturnType<typeof resolveAgeCategory>;
  overrideAt: number | null;
  overrideBy: string | null;
} {
  const existingOverride =
    student.ageCategoryId !== student.derivedAgeCategoryId;
  if (!isEditionAdmin && existingOverride) {
    if (values.dateOfBirth !== student.dateOfBirth) {
      throw new Error(
        "An administrator must review the existing Age Category override before changing date of birth"
      );
    }
    if (
      values.ageCategoryOverrideId !== null &&
      values.ageCategoryOverrideId !== student.ageCategoryId
    ) {
      throw new Error("Only an administrator can override the Age Category");
    }
    return {
      ageCategory: {
        ageCategoryId: student.ageCategoryId,
        ageCategoryOverrideReason: student.ageCategoryOverrideReason,
        derivedAgeCategoryId: student.derivedAgeCategoryId,
      },
      overrideAt: student.ageCategoryOverrideAt,
      overrideBy: student.ageCategoryOverrideBy,
    };
  }

  const ageCategory = resolveAgeCategory({
    categories,
    edition,
    isEditionAdmin,
    values,
  });
  if (ageCategory.ageCategoryId === ageCategory.derivedAgeCategoryId) {
    return { ageCategory, overrideAt: null, overrideBy: null };
  }
  const overrideUnchanged =
    existingOverride &&
    ageCategory.ageCategoryId === student.ageCategoryId &&
    ageCategory.derivedAgeCategoryId === student.derivedAgeCategoryId &&
    ageCategory.ageCategoryOverrideReason === student.ageCategoryOverrideReason;
  return {
    ageCategory,
    overrideAt: overrideUnchanged ? student.ageCategoryOverrideAt : now,
    overrideBy: overrideUnchanged ? student.ageCategoryOverrideBy : actorUserId,
  };
}

async function findDuplicate(
  tx: StudentTx,
  centerId: string,
  normalizedName: string,
  dateOfBirth: number,
  excludeStudentId?: string
): Promise<{ humanId: string; id: string } | undefined> {
  const rows = (await tx.run(
    zql.kalakritiStudent
      .where("centerId", centerId)
      .where("normalizedName", normalizedName)
      .where("dateOfBirth", dateOfBirth)
  )) as Array<{ humanId: string; id: string }>;
  return rows.find((student) => student.id !== excludeStudentId);
}

function assertDuplicateAllowed({
  duplicate,
  duplicateConfirmed,
  isEditionAdmin,
}: {
  duplicate: { humanId: string } | undefined;
  duplicateConfirmed: boolean;
  isEditionAdmin: boolean;
}): void {
  if (!duplicate) {
    return;
  }
  if (!(isEditionAdmin && duplicateConfirmed)) {
    throw new Error(
      `A Student with the same name and date of birth already exists (${duplicate.humanId}); administrator confirmation is required`
    );
  }
}

async function assertWithinQuota({
  ageCategoryId,
  centerId,
  excludeStudentId,
  gender,
  tx,
}: {
  ageCategoryId: string;
  centerId: string;
  excludeStudentId?: string;
  gender: "female" | "male";
  tx: StudentTx;
}): Promise<void> {
  const quota = (await tx.run(
    zql.kalakritiCenterAgeQuota
      .where("centerId", centerId)
      .where("ageCategoryId", ageCategoryId)
      .one()
  )) as { femaleStudentLimit: number; maleStudentLimit: number } | undefined;
  if (!quota) {
    throw new Error("Center quota is not configured for this Age Category");
  }
  const students = (await tx.run(
    zql.kalakritiStudent
      .where("centerId", centerId)
      .where("ageCategoryId", ageCategoryId)
      .where("gender", gender)
  )) as Array<{ id: string }>;
  const count = students.filter(
    (student) => student.id !== excludeStudentId
  ).length;
  const limit =
    gender === "female" ? quota.femaleStudentLimit : quota.maleStudentLimit;
  if (count >= limit) {
    throw new Error(
      `${gender === "female" ? "Female" : "Male"} Student quota is full for this Age Category`
    );
  }
}

async function loadStudentEntryMemberships(
  tx: StudentTx,
  studentId: string
): Promise<readonly StudentEntryMembership[]> {
  return (await tx.run(
    zql.kalakritiEntryMember
      .where("studentId", studentId)
      .related("entry", (entry) =>
        entry
          .related("members")
          .related("session", (session) => session.related("competition"))
      )
  )) as readonly StudentEntryMembership[];
}

function assertEntriesRemainEligible(
  memberships: readonly StudentEntryMembership[],
  values: { ageCategoryId: string; gender: "female" | "male" }
): void {
  for (const membership of memberships) {
    const session = membership.entry?.session;
    if (!session) {
      throw new Error("Student Competition Entry configuration is incomplete");
    }
    if (session.ageCategoryId !== values.ageCategoryId) {
      throw new Error(
        "Student Age Category cannot be changed while it would invalidate a Competition Entry"
      );
    }
    const genderEligibility = session.competition?.genderEligibility;
    if (!genderEligibility) {
      throw new Error("Student Competition Entry configuration is incomplete");
    }
    if (genderEligibility !== "both" && genderEligibility !== values.gender) {
      throw new Error(
        "Student gender cannot be changed while it would invalidate a Competition Entry"
      );
    }
  }
}

async function lockRegistrationContext(
  tx: StudentTx,
  ctx: Context | undefined,
  editionId: string,
  centerId: string
) {
  const edition = await getEditionForUpdate(tx, editionId);
  if (!edition) {
    throw new Error("Edition not found");
  }
  const center = await getCenterForUpdate(tx, centerId);
  if (!center) {
    throw new Error("Center not found");
  }
  assertRegistrationWritable(edition, center);
  assertRegistrationEditionComplete(edition);
  const access = await assertCanManageKalakritiCenterRegistration(
    tx,
    ctx,
    edition.id,
    center.id
  );
  const categories = await getEditionAgeCategoriesForUpdate(tx, edition.id);
  assertIsLoggedIn(ctx);
  return { access, categories, center, edition };
}

export const kalakritiStudentMutators = {
  create: defineMutator(
    kalakritiStudentCreateSchema,
    async ({ tx, ctx, args }) => {
      const { access, categories, edition } = await lockRegistrationContext(
        tx,
        ctx,
        args.editionId,
        args.centerId
      );
      const normalized = normalizeKalakritiStudentName(args.name);
      const ageCategory = resolveAgeCategory({
        categories,
        edition,
        isEditionAdmin: access.isEditionAdmin,
        values: args,
      });
      const duplicate = await findDuplicate(
        tx,
        args.centerId,
        normalized.normalizedName,
        dateOnlyToTimestamp(args.dateOfBirth)
      );
      assertDuplicateAllowed({
        duplicate,
        duplicateConfirmed: args.duplicateConfirmed,
        isEditionAdmin: access.isEditionAdmin,
      });
      await assertWithinQuota({
        ageCategoryId: ageCategory.ageCategoryId,
        centerId: args.centerId,
        gender: args.gender,
        tx,
      });

      const humanId = formatKalakritiStudentHumanId(
        edition.year,
        edition.nextStudentSequence
      );
      const overrideApplied =
        ageCategory.ageCategoryId !== ageCategory.derivedAgeCategoryId;
      await tx.mutate.kalakritiStudent.insert({
        ageCategoryId: ageCategory.ageCategoryId,
        ageCategoryOverrideAt: overrideApplied ? args.now : null,
        ageCategoryOverrideBy: overrideApplied ? ctx.userId : null,
        ageCategoryOverrideReason: ageCategory.ageCategoryOverrideReason,
        centerId: args.centerId,
        createdAt: args.now,
        createdBy: ctx.userId,
        dateOfBirth: dateOnlyToTimestamp(args.dateOfBirth),
        derivedAgeCategoryId: ageCategory.derivedAgeCategoryId,
        duplicateConfirmedAt: duplicate ? args.now : null,
        duplicateConfirmedBy: duplicate ? ctx.userId : null,
        editionId: edition.id,
        gender: args.gender,
        humanId,
        id: args.studentId,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        updatedAt: args.now,
        updatedBy: ctx.userId,
      });
      await tx.mutate.kalakritiCredential.insert({
        createdAt: args.now,
        editionId: edition.id,
        humanId,
        id: args.credentialId,
        issuedAt: args.now,
        issuedBy: ctx.userId,
        revokedAt: null,
        revokedBy: null,
        studentId: args.studentId,
        tokenHash: args.credentialTokenHash,
      });
      await tx.mutate.kalakritiEdition.update({
        id: edition.id,
        nextStudentSequence: edition.nextStudentSequence + 1,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "created",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "student_registration",
        editionId: edition.id,
        id: args.auditEntryId,
        metadata: {
          ageCategoryId: ageCategory.ageCategoryId,
          ageCategoryOverridden: overrideApplied,
          centerId: args.centerId,
          derivedAgeCategoryId: ageCategory.derivedAgeCategoryId,
          duplicateConfirmed: Boolean(duplicate),
          duplicateStudentId: duplicate?.id,
          humanId,
        },
        reason: ageCategory.ageCategoryOverrideReason,
        targetId: args.studentId,
        targetType: "student",
      });
    }
  ),

  delete: defineMutator(
    kalakritiStudentDeleteSchema,
    async ({ tx, ctx, args }) => {
      const snapshot = (await tx.run(
        zql.kalakritiStudent.where("id", args.studentId).one()
      )) as
        | { centerId: string; editionId: string; humanId: string; name: string }
        | undefined;
      if (!snapshot) {
        throw new Error("Student not found");
      }
      const { center } = await lockRegistrationContext(
        tx,
        ctx,
        snapshot.editionId,
        snapshot.centerId
      );
      const student = await getStudentForUpdate(tx, args.studentId);
      if (
        !student ||
        student.editionId !== snapshot.editionId ||
        student.centerId !== snapshot.centerId
      ) {
        throw new Error("Student not found");
      }
      const credentials = (await tx.run(
        zql.kalakritiCredential.where("studentId", student.id)
      )) as Array<{ id: string }>;
      const entryMemberships = await loadStudentEntryMemberships(
        tx,
        student.id
      );
      if (
        entryMemberships.length > 0 &&
        !center.competitionEntryRegistrationEnabled
      ) {
        throw new Error(
          "Competition Entry registration is closed for this Center"
        );
      }
      const entryIds = new Set<string>();
      const entryMemberIds = new Set<string>();
      for (const membership of entryMemberships) {
        if (!membership.entry) {
          throw new Error(
            "Student Competition Entry configuration is incomplete"
          );
        }
        entryIds.add(membership.entry.id);
        for (const member of membership.entry.members) {
          entryMemberIds.add(member.id);
        }
      }
      await Promise.all(
        [...entryMemberIds].map((id) =>
          tx.mutate.kalakritiEntryMember.delete({ id })
        )
      );
      await Promise.all(
        [...entryIds].map((id) =>
          tx.mutate.kalakritiCompetitionEntry.delete({ id })
        )
      );
      await Promise.all(
        credentials.map((credential) =>
          tx.mutate.kalakritiCredential.delete({ id: credential.id })
        )
      );
      await tx.mutate.kalakritiStudent.delete({ id: student.id });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "deleted",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "student_registration",
        editionId: student.editionId,
        id: args.auditEntryId,
        metadata: { centerId: student.centerId, humanId: student.humanId },
        reason: null,
        targetId: student.id,
        targetType: "student",
      });
    }
  ),

  update: defineMutator(
    kalakritiStudentUpdateSchema,
    async ({ tx, ctx, args }) => {
      const snapshot = (await tx.run(
        zql.kalakritiStudent.where("id", args.studentId).one()
      )) as { centerId: string; editionId: string } | undefined;
      if (!snapshot) {
        throw new Error("Student not found");
      }
      const { access, categories, edition } = await lockRegistrationContext(
        tx,
        ctx,
        snapshot.editionId,
        snapshot.centerId
      );
      const student = await getStudentForUpdate(tx, args.studentId);
      if (
        !student ||
        student.editionId !== snapshot.editionId ||
        student.centerId !== snapshot.centerId
      ) {
        throw new Error("Student not found");
      }
      const normalized = normalizeKalakritiStudentName(args.name);
      const { ageCategory, overrideAt, overrideBy } = resolveUpdatedAgeCategory(
        {
          actorUserId: ctx.userId,
          categories,
          edition,
          isEditionAdmin: access.isEditionAdmin,
          now: args.now,
          student,
          values: args,
        }
      );
      const duplicate = await findDuplicate(
        tx,
        student.centerId,
        normalized.normalizedName,
        dateOnlyToTimestamp(args.dateOfBirth),
        student.id
      );
      assertDuplicateAllowed({
        duplicate,
        duplicateConfirmed: args.duplicateConfirmed,
        isEditionAdmin: access.isEditionAdmin,
      });
      await assertWithinQuota({
        ageCategoryId: ageCategory.ageCategoryId,
        centerId: student.centerId,
        excludeStudentId: student.id,
        gender: args.gender,
        tx,
      });
      const entryMemberships = await loadStudentEntryMemberships(
        tx,
        student.id
      );
      assertEntriesRemainEligible(entryMemberships, {
        ageCategoryId: ageCategory.ageCategoryId,
        gender: args.gender,
      });

      await tx.mutate.kalakritiStudent.update({
        ageCategoryId: ageCategory.ageCategoryId,
        ageCategoryOverrideAt: overrideAt,
        ageCategoryOverrideBy: overrideBy,
        ageCategoryOverrideReason: ageCategory.ageCategoryOverrideReason,
        dateOfBirth: dateOnlyToTimestamp(args.dateOfBirth),
        derivedAgeCategoryId: ageCategory.derivedAgeCategoryId,
        duplicateConfirmedAt: duplicate ? args.now : null,
        duplicateConfirmedBy: duplicate ? ctx.userId : null,
        gender: args.gender,
        id: student.id,
        name: normalized.name,
        normalizedName: normalized.normalizedName,
        updatedAt: args.now,
        updatedBy: ctx.userId,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "updated",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "student_registration",
        editionId: student.editionId,
        id: args.auditEntryId,
        metadata: {
          after: {
            ageCategoryId: ageCategory.ageCategoryId,
            derivedAgeCategoryId: ageCategory.derivedAgeCategoryId,
          },
          ageCategoryOverridden:
            ageCategory.ageCategoryId !== ageCategory.derivedAgeCategoryId,
          before: {
            ageCategoryId: student.ageCategoryId,
            derivedAgeCategoryId: student.derivedAgeCategoryId,
          },
          centerId: student.centerId,
          duplicateConfirmed: Boolean(duplicate),
          duplicateStudentId: duplicate?.id,
          humanId: student.humanId,
        },
        reason: ageCategory.ageCategoryOverrideReason,
        targetId: student.id,
        targetType: "student",
      });
    }
  ),
};
