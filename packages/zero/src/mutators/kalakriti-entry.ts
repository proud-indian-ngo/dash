import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import type { Context } from "../context";
import { assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";
import { assertCanManageKalakritiCenterRegistration } from "./kalakriti-registration-access";
import {
  getAgeCategoryForUpdate,
  getCenterForUpdate,
  getCompetitionDivisionForUpdate,
  getEditionForUpdate,
  getStudentForUpdate,
  type LockableKalakritiTx,
  type LockedCompetitionDivision,
  type LockedStudent,
} from "./kalakriti-row-locks";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

interface EntryTx extends LockableKalakritiTx {
  mutate: {
    kalakritiAuditEntry: { insert: ZeroMutationFn };
    kalakritiCompetitionEntry: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
      update: ZeroMutationFn;
    };
    kalakritiEntryMember: {
      delete: ZeroMutationFn;
      insert: ZeroMutationFn;
    };
  };
}

interface CompetitionConfiguration {
  cancelledAt: number | null;
  competitionCategoryId: string;
  genderEligibility: "both" | "female" | "male";
  id: string;
  maximumGroupSize: number;
  minimumGroupSize: number;
  participationMode: "group" | "individual";
  retiredAt: number | null;
}

interface ExistingEntryMembership {
  divisionId: string;
  entry?: {
    division?: {
      competition?: { competitionCategoryId: string };
      sessions: readonly {
        cancelledAt: number | null;
        endAt: number;
        id: string;
        startAt: number;
      }[];
    };
  };
  entryId: string;
  id: string;
}

export const entryCreateSchema = z.object({
  auditEntryId: z.string(),
  centerId: z.string(),
  divisionId: z.string(),
  editionId: z.string(),
  entryId: z.string(),
  memberId: z.string(),
  now: z.number(),
  studentId: z.string(),
});

export const entryRemoveSchema = z.object({
  auditEntryId: z.string(),
  entryId: z.string(),
  now: z.number(),
});

const entryGroupMemberSchema = z.object({
  memberId: z.string(),
  studentId: z.string(),
});

export const entryCreateGroupSchema = z.object({
  auditEntryId: z.string(),
  centerId: z.string(),
  divisionId: z.string(),
  editionId: z.string(),
  entryId: z.string(),
  members: z.array(entryGroupMemberSchema),
  now: z.number(),
});

export const entryReplaceGroupMembersSchema = z.object({
  auditEntryId: z.string(),
  entryId: z.string(),
  members: z.array(entryGroupMemberSchema),
  now: z.number(),
});

function assertEntryRegistrationWritable(
  edition: { id: string; lifecycle: string },
  center: {
    competitionEntryRegistrationEnabled: boolean;
    editionId: string;
    retiredAt: number | null;
  }
): void {
  if (center.editionId !== edition.id || center.retiredAt !== null) {
    throw new Error("Center not found in this Edition");
  }
  if (edition.lifecycle !== "registration_open") {
    throw new Error(
      "Competition Entry registration is not open for this Edition"
    );
  }
  if (!center.competitionEntryRegistrationEnabled) {
    throw new Error("Competition Entry registration is closed for this Center");
  }
}

async function lockEntryContext(
  tx: EntryTx,
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
  assertEntryRegistrationWritable(edition, center);
  await assertCanManageKalakritiCenterRegistration(
    tx,
    ctx,
    edition.id,
    center.id
  );
  assertIsLoggedIn(ctx);
  return { center, edition };
}

async function loadCompetitionConfiguration(
  tx: EntryTx,
  division: LockedCompetitionDivision,
  participationMode: CompetitionConfiguration["participationMode"]
): Promise<CompetitionConfiguration> {
  const competition = (await tx.run(
    zql.kalakritiCompetition.where("id", division.competitionId).one()
  )) as CompetitionConfiguration | undefined;
  if (!competition) {
    throw new Error("Competition not found in this Edition");
  }
  const category = await tx.run(
    zql.kalakritiCompetitionCategory
      .where("id", competition.competitionCategoryId)
      .one()
  );
  if (
    competition.cancelledAt !== null ||
    competition.retiredAt !== null ||
    !(category && (category as { retiredAt: number | null }).retiredAt === null)
  ) {
    throw new Error("Competition Division is not active");
  }
  if (competition.participationMode !== participationMode) {
    throw new Error(
      participationMode === "group"
        ? "This Competition requires an individual Entry"
        : "This Competition requires a group Entry"
    );
  }
  return competition;
}

function assertUniqueGroupMembers(
  members: readonly { memberId: string; studentId: string }[],
  competition: CompetitionConfiguration
): void {
  if (
    members.length < competition.minimumGroupSize ||
    members.length > competition.maximumGroupSize
  ) {
    throw new Error("Group Entry size is outside the configured limits");
  }
  if (
    new Set(members.map((member) => member.memberId)).size !== members.length
  ) {
    throw new Error("Group Entry member IDs must be unique");
  }
  if (
    new Set(members.map((member) => member.studentId)).size !== members.length
  ) {
    throw new Error("Group Entry students must be unique");
  }
}

function groupMemberLabel(student: LockedStudent): string {
  return `${student.humanId} · ${student.name}`;
}

function assertGroupMemberEligibility(
  student: LockedStudent,
  division: LockedCompetitionDivision,
  competition: CompetitionConfiguration
): void {
  const label = groupMemberLabel(student);
  if (student.ageCategoryId !== division.ageCategoryId) {
    throw new Error(
      `${label}: Student is not eligible for this Division's Age Category`
    );
  }
  if (
    competition.genderEligibility !== "both" &&
    competition.genderEligibility !== student.gender
  ) {
    throw new Error(
      `${label}: Student is not eligible for this Competition's gender rule`
    );
  }
}

async function lockAndValidateGroupMembers(
  tx: EntryTx,
  members: readonly { memberId: string; studentId: string }[],
  editionId: string,
  centerId: string,
  division: LockedCompetitionDivision,
  competition: CompetitionConfiguration,
  excludedEntryId?: string
): Promise<void> {
  const students: LockedStudent[] = [];
  for (const studentId of [
    ...members.map((member) => member.studentId),
  ].sort()) {
    // biome-ignore lint/performance/noAwaitInLoops: stable row-lock order prevents deadlocks for overlapping groups
    const student = await getStudentForUpdate(tx, studentId);
    if (
      !student ||
      student.editionId !== editionId ||
      student.centerId !== centerId
    ) {
      throw new Error("Student not found in this Center and Edition");
    }
    students.push(student);
  }

  const ageCategory = await getAgeCategoryForUpdate(tx, division.ageCategoryId);
  if (!ageCategory || ageCategory.editionId !== editionId) {
    throw new Error("Student Age Category not found in this Edition");
  }
  for (const student of students) {
    assertGroupMemberEligibility(student, division, competition);
  }
  const membershipGroups = (await Promise.all(
    students.map((student) =>
      tx.run(
        zql.kalakritiEntryMember
          .where("studentId", student.id)
          .related("entry", (entry) =>
            entry.related("division", (registeredDivision) =>
              registeredDivision.related("competition").related("sessions")
            )
          )
      )
    )
  )) as ExistingEntryMembership[][];
  const divisionSessions = await getActiveDivisionSessions(tx, division.id);
  for (const [index, memberships] of membershipGroups.entries()) {
    const student = students[index];
    if (!student) {
      throw new Error("Group Entry member could not be validated");
    }
    const label = groupMemberLabel(student);
    const relevantMemberships = excludedEntryId
      ? memberships.filter(
          (membership) => membership.entryId !== excludedEntryId
        )
      : memberships;
    if (
      relevantMemberships.some(
        (membership) => membership.divisionId === division.id
      )
    ) {
      throw new Error(
        `${label}: Student is already registered for this Division`
      );
    }
    if (relevantMemberships.length >= ageCategory.maxTotalCompetitions) {
      throw new Error(
        `${label}: Student has reached the total Competition limit`
      );
    }
    const categoryEntryCount = relevantMemberships.filter(
      ({ entry }) =>
        entry?.division?.competition?.competitionCategoryId ===
        competition.competitionCategoryId
    ).length;
    if (categoryEntryCount >= ageCategory.maxCompetitionsPerCategory) {
      throw new Error(
        `${label}: Student has reached the Competition Category limit`
      );
    }
    assertNoScheduleConflict(relevantMemberships, divisionSessions, label);
  }
}

function assertStudentEligibility(
  student: LockedStudent,
  division: LockedCompetitionDivision,
  competition: CompetitionConfiguration
): void {
  if (student.ageCategoryId !== division.ageCategoryId) {
    throw new Error("Student is not eligible for this Division's Age Category");
  }
  if (
    competition.genderEligibility !== "both" &&
    competition.genderEligibility !== student.gender
  ) {
    throw new Error(
      "Student is not eligible for this Competition's gender rule"
    );
  }
}

function assertNoScheduleConflict(
  existingMemberships: readonly ExistingEntryMembership[],
  divisionSessions: readonly { endAt: number; startAt: number }[],
  studentLabel?: string
): void {
  const otherSessions = existingMemberships
    .flatMap(({ entry }) => entry?.division?.sessions ?? [])
    .filter((session) => session.cancelledAt === null);
  const conflict = divisionSessions.some((session) =>
    otherSessions.some(
      (existingSession) =>
        existingSession.startAt < session.endAt &&
        existingSession.endAt > session.startAt
    )
  );
  if (conflict) {
    throw new Error(
      studentLabel
        ? `${studentLabel}: Student is already registered in an overlapping Session`
        : "Student is already registered in an overlapping Session"
    );
  }
}

async function getActiveDivisionSessions(tx: EntryTx, divisionId: string) {
  const sessions = (await tx.run(
    zql.kalakritiCompetitionSession
      .where("divisionId", divisionId)
      .where("cancelledAt", "IS", null)
      .related("venue")
  )) as readonly {
    endAt: number;
    startAt: number;
    venue?: { retiredAt: number | null };
  }[];
  const activeSessions = sessions.filter(
    (session) => session.venue?.retiredAt === null
  );
  if (activeSessions.length === 0) {
    throw new Error("Competition Division is not active");
  }
  return activeSessions;
}

// biome-ignore assist/source/useSortedKeys: retain the established command order, then append group commands
export const kalakritiEntryMutators = {
  createIndividual: defineMutator(
    entryCreateSchema,
    async ({ tx, ctx, args }) => {
      const { center, edition } = await lockEntryContext(
        tx,
        ctx,
        args.editionId,
        args.centerId
      );
      const division = await getCompetitionDivisionForUpdate(
        tx,
        args.divisionId
      );
      if (!division || division.editionId !== edition.id) {
        throw new Error("Competition Division is not active in this Edition");
      }
      const student = await getStudentForUpdate(tx, args.studentId);
      if (
        !student ||
        student.editionId !== edition.id ||
        student.centerId !== center.id
      ) {
        throw new Error("Student not found in this Center and Edition");
      }
      const ageCategory = await getAgeCategoryForUpdate(
        tx,
        student.ageCategoryId
      );
      if (!ageCategory || ageCategory.editionId !== edition.id) {
        throw new Error("Student Age Category not found in this Edition");
      }
      const competition = await loadCompetitionConfiguration(
        tx,
        division,
        "individual"
      );
      assertStudentEligibility(student, division, competition);

      const [divisionEntries, divisionSessions, existingMemberships] =
        await Promise.all([
          tx.run(
            zql.kalakritiCompetitionEntry.where("divisionId", division.id)
          ) as Promise<Array<{ id: string }>>,
          getActiveDivisionSessions(tx, division.id),
          tx.run(
            zql.kalakritiEntryMember
              .where("studentId", student.id)
              .related("entry", (entry) =>
                entry.related("division", (registeredDivision) =>
                  registeredDivision.related("competition").related("sessions")
                )
              )
          ) as Promise<ExistingEntryMembership[]>,
        ]);
      if (
        existingMemberships.some(
          (membership) => membership.divisionId === division.id
        )
      ) {
        throw new Error("Student is already registered for this Division");
      }
      if (divisionEntries.length >= division.capacity) {
        throw new Error("Competition Division capacity is full");
      }
      if (existingMemberships.length >= ageCategory.maxTotalCompetitions) {
        throw new Error("Student has reached the total Competition limit");
      }
      const categoryEntryCount = existingMemberships.filter(
        ({ entry }) =>
          entry?.division?.competition?.competitionCategoryId ===
          competition.competitionCategoryId
      ).length;
      if (categoryEntryCount >= ageCategory.maxCompetitionsPerCategory) {
        throw new Error("Student has reached the Competition Category limit");
      }
      assertNoScheduleConflict(existingMemberships, divisionSessions);

      await tx.mutate.kalakritiCompetitionEntry.insert({
        centerId: center.id,
        createdAt: args.now,
        createdBy: ctx.userId,
        divisionId: division.id,
        editionId: edition.id,
        id: args.entryId,
        participationMode: "individual",
        updatedAt: args.now,
        updatedBy: ctx.userId,
      });
      await tx.mutate.kalakritiEntryMember.insert({
        centerId: center.id,
        createdAt: args.now,
        createdBy: ctx.userId,
        divisionId: division.id,
        editionId: edition.id,
        entryId: args.entryId,
        id: args.memberId,
        studentId: student.id,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "created",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "entry_registration",
        editionId: edition.id,
        id: args.auditEntryId,
        metadata: {
          centerId: center.id,
          competitionId: competition.id,
          divisionId: division.id,
          studentId: student.id,
        },
        reason: null,
        targetId: args.entryId,
        targetType: "competition_entry",
      });
    }
  ),

  createGroup: defineMutator(
    entryCreateGroupSchema,
    async ({ tx, ctx, args }) => {
      const { center, edition } = await lockEntryContext(
        tx,
        ctx,
        args.editionId,
        args.centerId
      );
      const division = await getCompetitionDivisionForUpdate(
        tx,
        args.divisionId
      );
      if (!division || division.editionId !== edition.id) {
        throw new Error("Competition Division is not active in this Edition");
      }
      const competition = await loadCompetitionConfiguration(
        tx,
        division,
        "group"
      );
      assertUniqueGroupMembers(args.members, competition);
      await lockAndValidateGroupMembers(
        tx,
        args.members,
        edition.id,
        center.id,
        division,
        competition
      );
      const divisionEntries = (await tx.run(
        zql.kalakritiCompetitionEntry.where("divisionId", division.id)
      )) as Array<{ id: string }>;
      if (divisionEntries.length >= division.capacity) {
        throw new Error("Competition Division capacity is full");
      }

      await tx.mutate.kalakritiCompetitionEntry.insert({
        centerId: center.id,
        createdAt: args.now,
        createdBy: ctx.userId,
        divisionId: division.id,
        editionId: edition.id,
        id: args.entryId,
        participationMode: "group",
        updatedAt: args.now,
        updatedBy: ctx.userId,
      });
      await Promise.all(
        args.members.map((member) =>
          tx.mutate.kalakritiEntryMember.insert({
            centerId: center.id,
            createdAt: args.now,
            createdBy: ctx.userId,
            divisionId: division.id,
            editionId: edition.id,
            entryId: args.entryId,
            id: member.memberId,
            studentId: member.studentId,
          })
        )
      );
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "created",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "entry_registration",
        editionId: edition.id,
        id: args.auditEntryId,
        metadata: {
          centerId: center.id,
          competitionId: competition.id,
          divisionId: division.id,
          studentIds: args.members.map((member) => member.studentId),
        },
        reason: null,
        targetId: args.entryId,
        targetType: "competition_entry",
      });
    }
  ),

  replaceGroupMembers: defineMutator(
    entryReplaceGroupMembersSchema,
    async ({ tx, ctx, args }) => {
      const snapshot = (await tx.run(
        zql.kalakritiCompetitionEntry
          .where("id", args.entryId)
          .related("members")
          .one()
      )) as
        | {
            centerId: string;
            divisionId: string;
            editionId: string;
            members: readonly { id: string; studentId: string }[];
            participationMode: "group" | "individual";
          }
        | undefined;
      if (!snapshot) {
        throw new Error("Competition Entry not found");
      }
      const { center, edition } = await lockEntryContext(
        tx,
        ctx,
        snapshot.editionId,
        snapshot.centerId
      );
      const division = await getCompetitionDivisionForUpdate(
        tx,
        snapshot.divisionId
      );
      if (!division || division.editionId !== edition.id) {
        throw new Error("Competition Entry not found in this Edition");
      }
      const entry = (await tx.run(
        zql.kalakritiCompetitionEntry
          .where("id", args.entryId)
          .related("members")
          .one()
      )) as typeof snapshot;
      if (entry?.participationMode !== "group") {
        throw new Error("Group Competition Entry not found");
      }
      const competition = await loadCompetitionConfiguration(
        tx,
        division,
        "group"
      );
      assertUniqueGroupMembers(args.members, competition);
      await lockAndValidateGroupMembers(
        tx,
        args.members,
        edition.id,
        center.id,
        division,
        competition,
        args.entryId
      );

      await Promise.all(
        entry.members.map((member) =>
          tx.mutate.kalakritiEntryMember.delete({ id: member.id })
        )
      );
      await Promise.all(
        args.members.map((member) =>
          tx.mutate.kalakritiEntryMember.insert({
            centerId: center.id,
            createdAt: args.now,
            createdBy: ctx.userId,
            divisionId: division.id,
            editionId: edition.id,
            entryId: args.entryId,
            id: member.memberId,
            studentId: member.studentId,
          })
        )
      );
      await tx.mutate.kalakritiCompetitionEntry.update({
        id: args.entryId,
        updatedAt: args.now,
        updatedBy: ctx.userId,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        action: "updated",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "entry_registration",
        editionId: edition.id,
        id: args.auditEntryId,
        metadata: {
          centerId: center.id,
          divisionId: division.id,
          newStudentIds: args.members.map((member) => member.studentId),
          oldStudentIds: entry.members.map((member) => member.studentId),
        },
        reason: null,
        targetId: args.entryId,
        targetType: "competition_entry",
      });
    }
  ),

  remove: defineMutator(entryRemoveSchema, async ({ tx, ctx, args }) => {
    const snapshot = (await tx.run(
      zql.kalakritiCompetitionEntry
        .where("id", args.entryId)
        .related("members")
        .one()
    )) as
      | {
          centerId: string;
          divisionId: string;
          editionId: string;
          members: readonly { id: string; studentId: string }[];
          participationMode: "group" | "individual";
        }
      | undefined;
    if (!snapshot) {
      throw new Error("Competition Entry not found");
    }
    const { edition } = await lockEntryContext(
      tx,
      ctx,
      snapshot.editionId,
      snapshot.centerId
    );
    const division = await getCompetitionDivisionForUpdate(
      tx,
      snapshot.divisionId
    );
    if (!division || division.editionId !== edition.id) {
      throw new Error("Competition Entry not found in this Edition");
    }
    const entry = (await tx.run(
      zql.kalakritiCompetitionEntry
        .where("id", args.entryId)
        .related("members")
        .one()
    )) as typeof snapshot;
    if (!entry) {
      throw new Error("Competition Entry not found");
    }
    await Promise.all(
      entry.members.map((member) =>
        tx.mutate.kalakritiEntryMember.delete({ id: member.id })
      )
    );
    await tx.mutate.kalakritiCompetitionEntry.delete({ id: args.entryId });
    await tx.mutate.kalakritiAuditEntry.insert({
      action: "deleted",
      actorUserId: ctx.userId,
      createdAt: args.now,
      domain: "entry_registration",
      editionId: edition.id,
      id: args.auditEntryId,
      metadata: {
        centerId: snapshot.centerId,
        divisionId: snapshot.divisionId,
        studentIds: entry.members.map((member) => member.studentId),
      },
      reason: null,
      targetId: args.entryId,
      targetType: "competition_entry",
    });
  }),
};
