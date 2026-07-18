import type { db } from "@pi-dash/db";
import type { DrizzleTransaction } from "@rocicorp/zero/server/adapters/drizzle";
import { zql } from "../schema";

abstract class BivariantZeroRun {
  abstract bivarianceHack(query: unknown): Promise<unknown>;
}

type ZeroRunFn = BivariantZeroRun["bivarianceHack"];

export interface LockableKalakritiTx {
  dbTransaction?: {
    wrappedTransaction: unknown;
  };
  location: "client" | "server";
  run: ZeroRunFn;
}

export interface LockedCenter {
  competitionEntryRegistrationEnabled: boolean;
  editionId: string;
  id: string;
  retiredAt: number | null;
  studentRegistrationEnabled: boolean;
}

export interface LockedEdition {
  eventDate: string;
  id: string;
  lifecycle: string;
  timezone: string;
}

export interface LockedRegistrationEdition extends LockedEdition {
  ageCutoffDate: string;
  nextStudentSequence: number;
  year: number;
}

type LockableEdition = LockedEdition & Partial<LockedRegistrationEdition>;

export interface LockedAgeCategory {
  editionId: string;
  id: string;
  maxCompetitionsPerCategory: number;
  maximumAge: number;
  maxTotalCompetitions: number;
  minimumAge: number;
  name: string;
  sortOrder: number;
}

export interface LockedCompetitionSession {
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

export interface LockedEditionMembership {
  editionId: string;
  id: string;
  kind: "guardian" | "volunteer";
  state: "active" | "archived";
}

export interface LockedGuardianCenter {
  centerId: string;
  editionId: string;
  id: string;
  membershipId: string;
}

export interface LockedStudent {
  ageCategoryId: string;
  ageCategoryOverrideAt: number | null;
  ageCategoryOverrideBy: string | null;
  ageCategoryOverrideReason: string | null;
  centerId: string;
  dateOfBirth: string;
  derivedAgeCategoryId: string;
  editionId: string;
  gender: "female" | "male";
  humanId: string;
  id: string;
  name: string;
  normalizedName: string;
}

function normalizeEditionEventDate(value: Date | number | string): string {
  if (typeof value === "string") {
    return value;
  }
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeTimestamp(
  value: Date | number | string | null
): number | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function normalizeRequiredTimestamp(value: Date | number | string): number {
  const normalized = normalizeTimestamp(value);
  if (normalized === null || !Number.isFinite(normalized)) {
    throw new Error("Timestamp is invalid");
  }
  return normalized;
}

function normalizeEdition(edition: {
  ageCutoffDate?: Date | number | string;
  eventDate: Date | number | string;
  id: string;
  lifecycle: string;
  nextStudentSequence?: number;
  timezone: string;
  year?: number;
}): LockableEdition {
  const normalizedAgeCutoff =
    edition.ageCutoffDate === undefined
      ? {}
      : {
          ageCutoffDate: normalizeEditionEventDate(edition.ageCutoffDate),
        };
  const nextStudentSequence =
    edition.nextStudentSequence === undefined
      ? {}
      : { nextStudentSequence: edition.nextStudentSequence };
  const year = edition.year === undefined ? {} : { year: edition.year };
  return {
    ...normalizedAgeCutoff,
    eventDate: normalizeEditionEventDate(edition.eventDate),
    id: edition.id,
    lifecycle: edition.lifecycle,
    ...nextStudentSequence,
    timezone: edition.timezone,
    ...year,
  };
}

function requireServerTransaction(tx: LockableKalakritiTx) {
  const transaction = tx.dbTransaction?.wrappedTransaction;
  if (!transaction) {
    throw new Error("Server transaction is unavailable");
  }
  return transaction as DrizzleTransaction<typeof db>;
}

function normalizeCenter(center: {
  competitionEntryRegistrationEnabled: boolean;
  editionId: string;
  id: string;
  retiredAt: Date | null;
  studentRegistrationEnabled: boolean;
}): LockedCenter {
  return {
    ...center,
    retiredAt: center.retiredAt?.getTime() ?? null,
  };
}

export async function getCenterForUpdate(
  tx: LockableKalakritiTx,
  centerId: string
): Promise<LockedCenter | undefined> {
  if (tx.location === "client") {
    return (await tx.run(zql.kalakritiCenter.where("id", centerId).one())) as
      | LockedCenter
      | undefined;
  }

  const [{ kalakritiCenter }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const [center] = await requireServerTransaction(tx)
    .select({
      competitionEntryRegistrationEnabled:
        kalakritiCenter.competitionEntryRegistrationEnabled,
      editionId: kalakritiCenter.editionId,
      id: kalakritiCenter.id,
      retiredAt: kalakritiCenter.retiredAt,
      studentRegistrationEnabled: kalakritiCenter.studentRegistrationEnabled,
    })
    .from(kalakritiCenter)
    .where(eq(kalakritiCenter.id, centerId))
    .for("update");
  return center ? normalizeCenter(center) : undefined;
}

export async function getEditionForUpdate(
  tx: LockableKalakritiTx,
  editionId: string
): Promise<LockableEdition | undefined> {
  if (tx.location === "client") {
    const edition = (await tx.run(
      zql.kalakritiEdition.where("id", editionId).one()
    )) as
      | (Omit<LockableEdition, "ageCutoffDate" | "eventDate"> & {
          ageCutoffDate?: Date | number | string;
          eventDate: Date | number | string;
        })
      | undefined;
    return edition ? normalizeEdition(edition) : undefined;
  }

  const [{ kalakritiEdition }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const [edition] = await requireServerTransaction(tx)
    .select({
      ageCutoffDate: kalakritiEdition.ageCutoffDate,
      eventDate: kalakritiEdition.eventDate,
      id: kalakritiEdition.id,
      lifecycle: kalakritiEdition.lifecycle,
      nextStudentSequence: kalakritiEdition.nextStudentSequence,
      timezone: kalakritiEdition.timezone,
      year: kalakritiEdition.year,
    })
    .from(kalakritiEdition)
    .where(eq(kalakritiEdition.id, editionId))
    .for("update");
  return edition ? normalizeEdition(edition) : undefined;
}

export async function getAgeCategoryForUpdate(
  tx: LockableKalakritiTx,
  ageCategoryId: string
): Promise<LockedAgeCategory | undefined> {
  if (tx.location === "client") {
    return (await tx.run(
      zql.kalakritiAgeCategory.where("id", ageCategoryId).one()
    )) as LockedAgeCategory | undefined;
  }

  const [{ kalakritiAgeCategory }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const [category] = await requireServerTransaction(tx)
    .select({
      editionId: kalakritiAgeCategory.editionId,
      id: kalakritiAgeCategory.id,
      maxCompetitionsPerCategory:
        kalakritiAgeCategory.maxCompetitionsPerCategory,
      maximumAge: kalakritiAgeCategory.maximumAge,
      maxTotalCompetitions: kalakritiAgeCategory.maxTotalCompetitions,
      minimumAge: kalakritiAgeCategory.minimumAge,
      name: kalakritiAgeCategory.name,
      sortOrder: kalakritiAgeCategory.sortOrder,
    })
    .from(kalakritiAgeCategory)
    .where(eq(kalakritiAgeCategory.id, ageCategoryId))
    .for("update");
  return category;
}

export async function getEditionAgeCategoriesForUpdate(
  tx: LockableKalakritiTx,
  editionId: string
): Promise<LockedAgeCategory[]> {
  if (tx.location === "client") {
    return (await tx.run(
      zql.kalakritiAgeCategory.where("editionId", editionId)
    )) as LockedAgeCategory[];
  }

  const [{ kalakritiAgeCategory }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  return requireServerTransaction(tx)
    .select({
      editionId: kalakritiAgeCategory.editionId,
      id: kalakritiAgeCategory.id,
      maxCompetitionsPerCategory:
        kalakritiAgeCategory.maxCompetitionsPerCategory,
      maximumAge: kalakritiAgeCategory.maximumAge,
      maxTotalCompetitions: kalakritiAgeCategory.maxTotalCompetitions,
      minimumAge: kalakritiAgeCategory.minimumAge,
      name: kalakritiAgeCategory.name,
      sortOrder: kalakritiAgeCategory.sortOrder,
    })
    .from(kalakritiAgeCategory)
    .where(eq(kalakritiAgeCategory.editionId, editionId))
    .orderBy(kalakritiAgeCategory.id)
    .for("update");
}

export async function getEditionCentersForUpdate(
  tx: LockableKalakritiTx,
  editionId: string
): Promise<LockedCenter[]> {
  if (tx.location === "client") {
    return (await tx.run(
      zql.kalakritiCenter.where("editionId", editionId)
    )) as LockedCenter[];
  }

  const [{ kalakritiCenter }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const centers = await requireServerTransaction(tx)
    .select({
      competitionEntryRegistrationEnabled:
        kalakritiCenter.competitionEntryRegistrationEnabled,
      editionId: kalakritiCenter.editionId,
      id: kalakritiCenter.id,
      retiredAt: kalakritiCenter.retiredAt,
      studentRegistrationEnabled: kalakritiCenter.studentRegistrationEnabled,
    })
    .from(kalakritiCenter)
    .where(eq(kalakritiCenter.editionId, editionId))
    .orderBy(kalakritiCenter.id)
    .for("update");
  return centers.map(normalizeCenter);
}

export async function getEditionMembershipForUpdate(
  tx: LockableKalakritiTx,
  membershipId: string
): Promise<LockedEditionMembership | undefined> {
  if (tx.location === "client") {
    return (await tx.run(
      zql.kalakritiEditionMembership.where("id", membershipId).one()
    )) as LockedEditionMembership | undefined;
  }

  const [{ kalakritiEditionMembership }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const [membership] = await requireServerTransaction(tx)
    .select({
      editionId: kalakritiEditionMembership.editionId,
      id: kalakritiEditionMembership.id,
      kind: kalakritiEditionMembership.kind,
      state: kalakritiEditionMembership.state,
    })
    .from(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.id, membershipId))
    .for("update");
  return membership;
}

export async function getGuardianCenterForUpdate(
  tx: LockableKalakritiTx,
  guardianCenterId: string
): Promise<LockedGuardianCenter | undefined> {
  if (tx.location === "client") {
    return (await tx.run(
      zql.kalakritiGuardianCenter.where("id", guardianCenterId).one()
    )) as LockedGuardianCenter | undefined;
  }

  const [{ kalakritiGuardianCenter }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const [assignment] = await requireServerTransaction(tx)
    .select({
      centerId: kalakritiGuardianCenter.centerId,
      editionId: kalakritiGuardianCenter.editionId,
      id: kalakritiGuardianCenter.id,
      membershipId: kalakritiGuardianCenter.membershipId,
    })
    .from(kalakritiGuardianCenter)
    .where(eq(kalakritiGuardianCenter.id, guardianCenterId))
    .for("update");
  return assignment;
}

export async function getStudentForUpdate(
  tx: LockableKalakritiTx,
  studentId: string
): Promise<LockedStudent | undefined> {
  if (tx.location === "client") {
    const student = (await tx.run(
      zql.kalakritiStudent.where("id", studentId).one()
    )) as
      | (Omit<LockedStudent, "dateOfBirth"> & { dateOfBirth: number })
      | undefined;
    return student
      ? {
          ...student,
          dateOfBirth: normalizeEditionEventDate(student.dateOfBirth),
        }
      : undefined;
  }

  const [{ kalakritiStudent }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const [student] = await requireServerTransaction(tx)
    .select({
      ageCategoryId: kalakritiStudent.ageCategoryId,
      ageCategoryOverrideAt: kalakritiStudent.ageCategoryOverrideAt,
      ageCategoryOverrideBy: kalakritiStudent.ageCategoryOverrideBy,
      ageCategoryOverrideReason: kalakritiStudent.ageCategoryOverrideReason,
      centerId: kalakritiStudent.centerId,
      dateOfBirth: kalakritiStudent.dateOfBirth,
      derivedAgeCategoryId: kalakritiStudent.derivedAgeCategoryId,
      editionId: kalakritiStudent.editionId,
      gender: kalakritiStudent.gender,
      humanId: kalakritiStudent.humanId,
      id: kalakritiStudent.id,
      name: kalakritiStudent.name,
      normalizedName: kalakritiStudent.normalizedName,
    })
    .from(kalakritiStudent)
    .where(eq(kalakritiStudent.id, studentId))
    .for("update");
  return student
    ? {
        ...student,
        ageCategoryOverrideAt: normalizeTimestamp(
          student.ageCategoryOverrideAt
        ),
      }
    : undefined;
}

export async function getCompetitionSessionForUpdate(
  tx: LockableKalakritiTx,
  sessionId: string
): Promise<LockedCompetitionSession | undefined> {
  if (tx.location === "client") {
    const session = (await tx.run(
      zql.kalakritiCompetitionSession.where("id", sessionId).one()
    )) as
      | (Omit<LockedCompetitionSession, "cancelledAt" | "endAt" | "startAt"> & {
          cancelledAt: number | null;
          endAt: number;
          startAt: number;
        })
      | undefined;
    return session;
  }

  const [{ kalakritiCompetitionSession }, { eq }] = await Promise.all([
    import("@pi-dash/db/schema/kalakriti"),
    import("drizzle-orm"),
  ]);
  const [session] = await requireServerTransaction(tx)
    .select({
      ageCategoryId: kalakritiCompetitionSession.ageCategoryId,
      cancelledAt: kalakritiCompetitionSession.cancelledAt,
      capacity: kalakritiCompetitionSession.capacity,
      competitionId: kalakritiCompetitionSession.competitionId,
      editionId: kalakritiCompetitionSession.editionId,
      endAt: kalakritiCompetitionSession.endAt,
      id: kalakritiCompetitionSession.id,
      startAt: kalakritiCompetitionSession.startAt,
      venueId: kalakritiCompetitionSession.venueId,
    })
    .from(kalakritiCompetitionSession)
    .where(eq(kalakritiCompetitionSession.id, sessionId))
    .for("update");
  return session
    ? {
        ...session,
        cancelledAt: normalizeTimestamp(session.cancelledAt),
        endAt: normalizeRequiredTimestamp(session.endAt),
        startAt: normalizeRequiredTimestamp(session.startAt),
      }
    : undefined;
}
