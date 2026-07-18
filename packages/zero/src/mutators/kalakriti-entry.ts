import { defineMutator } from "@rocicorp/zero";
import z from "zod";
import type { Context } from "../context";
import { assertIsLoggedIn } from "../permissions";
import { zql } from "../schema";
import { assertCanManageKalakritiCenterRegistration } from "./kalakriti-registration-access";
import {
  getAgeCategoryForUpdate,
  getCenterForUpdate,
  getCompetitionSessionForUpdate,
  getEditionForUpdate,
  getStudentForUpdate,
  type LockableKalakritiTx,
  type LockedCompetitionSession,
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
  participationMode: "group" | "individual";
  retiredAt: number | null;
}

interface ExistingEntryMembership {
  entry?: {
    session?: {
      competition?: { competitionCategoryId: string };
      endAt: number;
      id: string;
      startAt: number;
    };
  };
  entryId: string;
  id: string;
  sessionId: string;
}

export const entryCreateSchema = z.object({
  auditEntryId: z.string(),
  centerId: z.string(),
  editionId: z.string(),
  entryId: z.string(),
  memberId: z.string(),
  now: z.number(),
  sessionId: z.string(),
  studentId: z.string(),
});

export const entryRemoveSchema = z.object({
  auditEntryId: z.string(),
  entryId: z.string(),
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
  session: LockedCompetitionSession
): Promise<CompetitionConfiguration> {
  const competition = (await tx.run(
    zql.kalakritiCompetition.where("id", session.competitionId).one()
  )) as CompetitionConfiguration | undefined;
  if (!competition) {
    throw new Error("Competition not found in this Edition");
  }
  const [category, venue] = await Promise.all([
    tx.run(
      zql.kalakritiCompetitionCategory
        .where("id", competition.competitionCategoryId)
        .one()
    ),
    tx.run(zql.kalakritiVenue.where("id", session.venueId).one()),
  ]);
  if (
    competition.cancelledAt !== null ||
    competition.retiredAt !== null ||
    !(
      category && (category as { retiredAt: number | null }).retiredAt === null
    ) ||
    !(venue && (venue as { retiredAt: number | null }).retiredAt === null)
  ) {
    throw new Error("Competition Session is not active");
  }
  if (competition.participationMode !== "individual") {
    throw new Error("This Competition requires a group Entry");
  }
  return competition;
}

function assertStudentEligibility(
  student: LockedStudent,
  session: LockedCompetitionSession,
  competition: CompetitionConfiguration
): void {
  if (student.ageCategoryId !== session.ageCategoryId) {
    throw new Error("Student is not eligible for this Session's Age Category");
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
  session: LockedCompetitionSession
): void {
  const conflict = existingMemberships.find(({ entry }) => {
    const existingSession = entry?.session;
    return (
      existingSession &&
      existingSession.startAt < session.endAt &&
      existingSession.endAt > session.startAt
    );
  });
  if (conflict) {
    throw new Error("Student is already registered in an overlapping Session");
  }
}

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
      const session = await getCompetitionSessionForUpdate(tx, args.sessionId);
      if (
        !session ||
        session.editionId !== edition.id ||
        session.cancelledAt !== null
      ) {
        throw new Error("Competition Session is not active in this Edition");
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
      const competition = await loadCompetitionConfiguration(tx, session);
      assertStudentEligibility(student, session, competition);

      const [sessionEntries, existingMemberships] = await Promise.all([
        tx.run(
          zql.kalakritiCompetitionEntry.where("sessionId", session.id)
        ) as Promise<Array<{ id: string }>>,
        tx.run(
          zql.kalakritiEntryMember
            .where("studentId", student.id)
            .related("entry", (entry) =>
              entry.related("session", (registeredSession) =>
                registeredSession.related("competition")
              )
            )
        ) as Promise<ExistingEntryMembership[]>,
      ]);
      if (
        existingMemberships.some(
          (membership) => membership.sessionId === session.id
        )
      ) {
        throw new Error("Student is already registered for this Session");
      }
      if (sessionEntries.length >= session.capacity) {
        throw new Error("Competition Session capacity is full");
      }
      if (existingMemberships.length >= ageCategory.maxTotalCompetitions) {
        throw new Error("Student has reached the total Competition limit");
      }
      const categoryEntryCount = existingMemberships.filter(
        ({ entry }) =>
          entry?.session?.competition?.competitionCategoryId ===
          competition.competitionCategoryId
      ).length;
      if (categoryEntryCount >= ageCategory.maxCompetitionsPerCategory) {
        throw new Error("Student has reached the Competition Category limit");
      }
      assertNoScheduleConflict(existingMemberships, session);

      await tx.mutate.kalakritiCompetitionEntry.insert({
        centerId: center.id,
        createdAt: args.now,
        createdBy: ctx.userId,
        editionId: edition.id,
        id: args.entryId,
        participationMode: "individual",
        sessionId: session.id,
        updatedAt: args.now,
        updatedBy: ctx.userId,
      });
      await tx.mutate.kalakritiEntryMember.insert({
        centerId: center.id,
        createdAt: args.now,
        createdBy: ctx.userId,
        editionId: edition.id,
        entryId: args.entryId,
        id: args.memberId,
        sessionId: session.id,
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
          sessionId: session.id,
          studentId: student.id,
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
          editionId: string;
          members: readonly { id: string; studentId: string }[];
          participationMode: "group" | "individual";
          sessionId: string;
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
    const session = await getCompetitionSessionForUpdate(
      tx,
      snapshot.sessionId
    );
    if (!session || session.editionId !== edition.id) {
      throw new Error("Competition Entry not found in this Edition");
    }
    const entry = (await tx.run(
      zql.kalakritiCompetitionEntry
        .where("id", args.entryId)
        .related("members")
        .one()
    )) as typeof snapshot;
    if (entry?.participationMode !== "individual") {
      throw new Error("Individual Competition Entry not found");
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
        sessionId: snapshot.sessionId,
        studentIds: entry.members.map((member) => member.studentId),
      },
      reason: null,
      targetId: args.entryId,
      targetType: "competition_entry",
    });
  }),
};
