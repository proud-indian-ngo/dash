import {
  KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES,
  type KalakritiOperationType,
} from "@pi-dash/shared/kalakriti";
import { hashKalakritiCredentialToken } from "@pi-dash/shared/kalakriti-credential";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import {
  assertCanRecordOperation,
  findExistingOperationByOperationId,
  getOperationSubjectKind,
  isEffectiveOperation,
  type KalakritiOperationRecord,
} from "../kalakriti-operation-rules";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import {
  getEditionForUpdate,
  type LockableKalakritiTx,
} from "./kalakriti-row-locks";

abstract class BivariantZeroMutation {
  abstract bivarianceHack(args: unknown): Promise<void>;
}

type ZeroMutationFn = BivariantZeroMutation["bivarianceHack"];

interface OperationTx extends LockableKalakritiTx {
  mutate: {
    kalakritiAuditEntry: { insert: ZeroMutationFn };
    kalakritiOperation: { insert: ZeroMutationFn; update: ZeroMutationFn };
  };
}

const kalakritiOperationTypeSchema = z.enum([
  "pickup",
  "venue_departure",
  "drop_off",
  "volunteer_check_in",
  "breakfast",
  "lunch",
  "competition_attendance",
]);

const kalakritiOperationRecordBaseSchema = z.object({
  auditEntryId: z.string(),
  editionId: z.string(),
  id: z.string(),
  now: z.number(),
  occurredAt: z.number(),
  operationId: z.string(),
  sessionId: z.string().optional(),
  type: kalakritiOperationTypeSchema,
});

export const kalakritiOperationRecordSchema =
  kalakritiOperationRecordBaseSchema.extend({
    credentialToken: z.string().min(1),
  });

export const kalakritiOperationRecordManualSchema =
  kalakritiOperationRecordBaseSchema.extend({
    humanId: z.string().min(1),
  });

export const kalakritiOperationCorrectSchema = z.object({
  auditEntryId: z.string(),
  editionId: z.string(),
  id: z.string(),
  now: z.number(),
  operationId: z.string(),
  reason: z.string().trim().min(1).max(500),
  targetOperationId: z.string(),
});

interface ActiveMembership {
  id: string;
  kind: "guardian" | "volunteer";
}

interface ScopedAssignment {
  centerId: string | null;
  competitionId: string | null;
  responsibility: string;
}

const TRANSPORT_OPERATION_TYPES = new Set<KalakritiOperationType>([
  "pickup",
  "venue_departure",
  "drop_off",
]);

const MEAL_OPERATION_TYPES = new Set<KalakritiOperationType>([
  "breakfast",
  "lunch",
]);

async function getActiveMembership(
  tx: LockableKalakritiTx,
  ctx: Context,
  editionId: string
): Promise<ActiveMembership | undefined> {
  return (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("userId", ctx.userId)
      .where("state", "active")
      .one()
  )) as ActiveMembership | undefined;
}

async function getScopedAssignments(
  tx: LockableKalakritiTx,
  membershipId: string
): Promise<readonly ScopedAssignment[]> {
  return (await tx.run(
    zql.kalakritiAssignment.where("membershipId", membershipId)
  )) as readonly ScopedAssignment[];
}

function hasEditionWideTransportAccess(
  assignments: readonly ScopedAssignment[]
): boolean {
  return assignments.some(
    (assignment) =>
      assignment.responsibility === "edition_admin" ||
      assignment.responsibility === "transport_lead"
  );
}

function hasCenterTransportAccess(
  assignments: readonly ScopedAssignment[],
  centerId: string
): boolean {
  return assignments.some((assignment) => {
    if (assignment.responsibility === "transport_coordinator") {
      return assignment.centerId === centerId;
    }
    if (
      (
        KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES as readonly string[]
      ).includes(assignment.responsibility)
    ) {
      return assignment.centerId === centerId;
    }
    return false;
  });
}

async function assertCanRecordTransportOperation(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string,
  studentCenterId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }

  const membership = await getActiveMembership(tx, ctx, editionId);
  if (!membership) {
    throw new Error("Unauthorized");
  }
  if (membership.kind === "guardian") {
    throw new Error("Unauthorized");
  }

  const assignments = await getScopedAssignments(tx, membership.id);
  if (hasEditionWideTransportAccess(assignments)) {
    return;
  }
  if (hasCenterTransportAccess(assignments, studentCenterId)) {
    return;
  }

  throw new Error("Unauthorized");
}

async function assertCanRecordVolunteerCheckIn(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }

  const membership = await getActiveMembership(tx, ctx, editionId);
  if (!membership) {
    throw new Error("Unauthorized");
  }
  if (membership.kind === "guardian") {
    throw new Error("Unauthorized");
  }

  const assignments = await getScopedAssignments(tx, membership.id);
  if (
    assignments.some(
      (assignment) =>
        assignment.responsibility === "edition_admin" ||
        assignment.responsibility === "hospitality_lead" ||
        assignment.responsibility === "hospitality_member"
    )
  ) {
    return;
  }

  throw new Error("Unauthorized");
}

async function assertCanRecordMeal(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }

  const membership = await getActiveMembership(tx, ctx, editionId);
  if (!membership) {
    throw new Error("Unauthorized");
  }
  if (membership.kind === "guardian") {
    throw new Error("Unauthorized");
  }

  const assignments = await getScopedAssignments(tx, membership.id);
  if (
    assignments.some(
      (assignment) =>
        assignment.responsibility === "edition_admin" ||
        assignment.responsibility === "food_lead" ||
        assignment.responsibility === "food_member"
    )
  ) {
    return;
  }

  throw new Error("Unauthorized");
}

async function resolveSessionCompetitionId(
  tx: LockableKalakritiTx,
  editionId: string,
  sessionId: string
): Promise<string> {
  const session = (await tx.run(
    zql.kalakritiCompetitionSession.where("id", sessionId).one()
  )) as
    | { cancelledAt: number | null; divisionId: string; editionId: string }
    | undefined;
  if (!session || session.editionId !== editionId) {
    throw new Error("Competition session not found in this Edition");
  }
  if (session.cancelledAt !== null) {
    throw new Error("Competition session is cancelled");
  }
  const division = (await tx.run(
    zql.kalakritiCompetitionDivision.where("id", session.divisionId).one()
  )) as { competitionId: string; editionId: string } | undefined;
  if (!division || division.editionId !== editionId) {
    throw new Error("Competition session not found in this Edition");
  }
  return division.competitionId;
}

async function assertCanRecordCompetitionAttendance(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string,
  sessionId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  const competitionId = await resolveSessionCompetitionId(
    tx,
    editionId,
    sessionId
  );
  if (can(ctx, "kalakriti.admin")) {
    return;
  }

  const membership = await getActiveMembership(tx, ctx, editionId);
  if (!membership) {
    throw new Error("Unauthorized");
  }
  if (membership.kind === "guardian") {
    throw new Error("Unauthorized");
  }

  const assignments = await getScopedAssignments(tx, membership.id);
  if (
    assignments.some(
      (assignment) => assignment.responsibility === "edition_admin"
    )
  ) {
    return;
  }
  if (
    assignments.some(
      (assignment) =>
        (assignment.responsibility === "competition_volunteer" ||
          assignment.responsibility === "competition_coordinator") &&
        assignment.competitionId === competitionId
    )
  ) {
    return;
  }

  throw new Error("Unauthorized");
}

async function assertCanCorrectTransportOperation(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string,
  studentCenterId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }

  const membership = await getActiveMembership(tx, ctx, editionId);
  if (!membership) {
    throw new Error("Unauthorized");
  }
  if (membership.kind === "guardian") {
    throw new Error("Unauthorized");
  }

  const assignments = await getScopedAssignments(tx, membership.id);
  if (hasEditionWideTransportAccess(assignments)) {
    return;
  }
  if (
    assignments.some(
      (assignment) =>
        assignment.responsibility === "transport_coordinator" &&
        assignment.centerId === studentCenterId
    )
  ) {
    return;
  }

  throw new Error("Unauthorized");
}

async function assertCanCorrectVolunteerCheckIn(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }

  const membership = await getActiveMembership(tx, ctx, editionId);
  if (!membership) {
    throw new Error("Unauthorized");
  }
  if (membership.kind === "guardian") {
    throw new Error("Unauthorized");
  }

  const assignments = await getScopedAssignments(tx, membership.id);
  if (
    assignments.some(
      (assignment) =>
        assignment.responsibility === "edition_admin" ||
        assignment.responsibility === "hospitality_lead"
    )
  ) {
    return;
  }

  throw new Error("Unauthorized");
}

async function assertCanCorrectMeal(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  if (can(ctx, "kalakriti.admin")) {
    return;
  }

  const membership = await getActiveMembership(tx, ctx, editionId);
  if (!membership) {
    throw new Error("Unauthorized");
  }
  if (membership.kind === "guardian") {
    throw new Error("Unauthorized");
  }

  const assignments = await getScopedAssignments(tx, membership.id);
  if (
    assignments.some(
      (assignment) =>
        assignment.responsibility === "edition_admin" ||
        assignment.responsibility === "food_lead"
    )
  ) {
    return;
  }

  throw new Error("Unauthorized");
}

async function assertCanCorrectCompetitionAttendance(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string,
  sessionId: string
): Promise<void> {
  assertIsLoggedIn(ctx);
  const competitionId = await resolveSessionCompetitionId(
    tx,
    editionId,
    sessionId
  );
  if (can(ctx, "kalakriti.admin")) {
    return;
  }

  const membership = await getActiveMembership(tx, ctx, editionId);
  if (!membership) {
    throw new Error("Unauthorized");
  }
  if (membership.kind === "guardian") {
    throw new Error("Unauthorized");
  }

  const assignments = await getScopedAssignments(tx, membership.id);
  if (
    assignments.some(
      (assignment) => assignment.responsibility === "edition_admin"
    )
  ) {
    return;
  }
  if (
    assignments.some(
      (assignment) =>
        assignment.responsibility === "competition_coordinator" &&
        assignment.competitionId === competitionId
    )
  ) {
    return;
  }

  throw new Error("Unauthorized");
}

async function assertCanCorrectOperation(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string,
  type: KalakritiOperationType,
  studentCenterId?: string | null,
  sessionId?: string | null
): Promise<void> {
  if (TRANSPORT_OPERATION_TYPES.has(type)) {
    if (!studentCenterId) {
      throw new Error("Student center is required for transport operations");
    }
    await assertCanCorrectTransportOperation(
      tx,
      ctx,
      editionId,
      studentCenterId
    );
    return;
  }
  if (type === "volunteer_check_in") {
    await assertCanCorrectVolunteerCheckIn(tx, ctx, editionId);
    return;
  }
  if (MEAL_OPERATION_TYPES.has(type)) {
    await assertCanCorrectMeal(tx, ctx, editionId);
    return;
  }
  if (type === "competition_attendance") {
    if (!sessionId) {
      throw new Error("Competition session is required for attendance");
    }
    await assertCanCorrectCompetitionAttendance(tx, ctx, editionId, sessionId);
    return;
  }
  throw new Error("Unsupported operation type");
}

function assertEditionIsLive(lifecycle: string): void {
  if (lifecycle !== "live") {
    throw new Error("Edition is not live");
  }
}

async function assertCanRecordStationOperation(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string,
  type: KalakritiOperationType,
  sessionId?: string | null
): Promise<void> {
  if (type === "volunteer_check_in") {
    await assertCanRecordVolunteerCheckIn(tx, ctx, editionId);
    return;
  }
  if (MEAL_OPERATION_TYPES.has(type)) {
    await assertCanRecordMeal(tx, ctx, editionId);
    return;
  }
  if (type === "competition_attendance") {
    if (!sessionId) {
      throw new Error("Competition session is required for attendance");
    }
    await assertCanRecordCompetitionAttendance(tx, ctx, editionId, sessionId);
    return;
  }
  throw new Error("Unsupported operation type");
}

async function assertStudentRegisteredForCompetitionSession(
  tx: LockableKalakritiTx,
  editionId: string,
  sessionId: string,
  studentId: string
): Promise<void> {
  const session = (await tx.run(
    zql.kalakritiCompetitionSession.where("id", sessionId).one()
  )) as { divisionId: string; editionId: string } | undefined;
  if (!session || session.editionId !== editionId) {
    throw new Error("Competition session not found in this Edition");
  }
  const entryMember = (await tx.run(
    zql.kalakritiEntryMember
      .where("studentId", studentId)
      .where("divisionId", session.divisionId)
      .where("editionId", editionId)
      .one()
  )) as
    | {
        divisionId: string;
        editionId: string;
        entryId: string;
        studentId: string;
      }
    | undefined;
  if (
    !entryMember ||
    !entryMember.entryId ||
    entryMember.studentId !== studentId ||
    entryMember.divisionId !== session.divisionId ||
    entryMember.editionId !== editionId
  ) {
    throw new Error("Student is not registered for this Competition session");
  }
}

export async function assertCanRecordKalakritiOperation(
  tx: LockableKalakritiTx,
  ctx: Context | undefined,
  editionId: string,
  type: KalakritiOperationType,
  studentCenterId?: string | null,
  sessionId?: string | null
): Promise<void> {
  if (TRANSPORT_OPERATION_TYPES.has(type)) {
    if (!studentCenterId) {
      throw new Error("Student center is required for transport operations");
    }
    await assertCanRecordTransportOperation(
      tx,
      ctx,
      editionId,
      studentCenterId
    );
    return;
  }
  await assertCanRecordStationOperation(tx, ctx, editionId, type, sessionId);
}

async function resolveStudentCenterId(
  tx: OperationTx,
  studentId: string
): Promise<string> {
  const student = (await tx.run(
    zql.kalakritiStudent.where("id", studentId).one()
  )) as { centerId: string } | undefined;
  if (!student) {
    throw new Error("Student not found");
  }
  return student.centerId;
}

async function loadSubjectOperations(
  tx: OperationTx,
  editionId: string,
  subject: { membershipId?: string | null; studentId?: string | null }
): Promise<KalakritiOperationRecord[]> {
  if (subject.studentId) {
    return (await tx.run(
      zql.kalakritiOperation
        .where("editionId", editionId)
        .where("studentId", subject.studentId)
    )) as KalakritiOperationRecord[];
  }
  if (subject.membershipId) {
    return (await tx.run(
      zql.kalakritiOperation
        .where("editionId", editionId)
        .where("membershipId", subject.membershipId)
    )) as KalakritiOperationRecord[];
  }
  return [];
}

async function resolveSubjectFromCredential(
  tx: OperationTx,
  editionId: string,
  credentialToken: string
): Promise<{ membershipId: string | null; studentId: string | null }> {
  const tokenHash = await hashKalakritiCredentialToken(credentialToken);
  const credential = (await tx.run(
    zql.kalakritiCredential
      .where("tokenHash", tokenHash)
      .where("revokedAt", "IS", null)
      .one()
  )) as
    | {
        editionId: string;
        membershipId: string | null;
        studentId: string | null;
      }
    | undefined;
  if (!credential || credential.editionId !== editionId) {
    throw new Error("Credential not found or revoked");
  }
  return {
    membershipId: credential.membershipId,
    studentId: credential.studentId,
  };
}

async function resolveSubjectFromHumanId(
  tx: OperationTx,
  editionId: string,
  humanId: string
): Promise<{ membershipId: string | null; studentId: string | null }> {
  const student = (await tx.run(
    zql.kalakritiStudent
      .where("editionId", editionId)
      .where("humanId", humanId)
      .one()
  )) as { id: string } | undefined;
  if (student) {
    return { membershipId: null, studentId: student.id };
  }
  const membership = (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("humanId", humanId)
      .where("state", "active")
      .where("kind", "volunteer")
      .one()
  )) as { id: string } | undefined;
  if (membership) {
    return { membershipId: membership.id, studentId: null };
  }
  throw new Error("Yearly ID not found in this Edition");
}

async function recordKalakritiOperation(
  tx: OperationTx,
  ctx: Context,
  args: {
    auditEntryId: string;
    editionId: string;
    id: string;
    now: number;
    occurredAt: number;
    operationId: string;
    sessionId?: string;
    credentialToken?: string;
    humanId?: string;
    type: KalakritiOperationType;
  }
): Promise<void> {
  const edition = await getEditionForUpdate(tx, args.editionId);
  if (!edition) {
    throw new Error("Edition not found");
  }
  if (edition.lifecycle === "archived") {
    throw new Error("Edition is archived");
  }
  assertEditionIsLive(edition.lifecycle);
  const existing = (await tx.run(
    zql.kalakritiOperation.where("operationId", args.operationId).one()
  )) as (KalakritiOperationRecord & { recordedBy: string }) | undefined;
  if (existing) {
    if (
      existing.editionId !== args.editionId ||
      !(existing.recordedBy === ctx.userId || can(ctx, "kalakriti.admin"))
    ) {
      throw new Error("Operation ID is already in use");
    }
    return;
  }

  const subject = args.credentialToken
    ? await resolveSubjectFromCredential(
        tx,
        args.editionId,
        args.credentialToken
      )
    : await resolveSubjectFromHumanId(tx, args.editionId, args.humanId ?? "");
  const studentCenterId =
    subject.studentId && TRANSPORT_OPERATION_TYPES.has(args.type)
      ? await resolveStudentCenterId(tx, subject.studentId)
      : null;
  await assertCanRecordKalakritiOperation(
    tx,
    ctx,
    args.editionId,
    args.type,
    studentCenterId,
    args.sessionId
  );

  const subjectOperations = await loadSubjectOperations(
    tx,
    args.editionId,
    subject
  );
  if (findExistingOperationByOperationId(subjectOperations, args.operationId)) {
    return;
  }

  if (
    subjectOperations.some(
      (operation) =>
        operation.type === args.type &&
        operation.competitionSessionId === (args.sessionId ?? null) &&
        operation.supersededByOperationId === null
    )
  ) {
    return;
  }

  assertCanRecordOperation(
    subjectOperations,
    args.type,
    subject,
    args.sessionId ?? null
  );

  if (args.type === "competition_attendance") {
    if (!(args.sessionId && subject.studentId)) {
      throw new Error("This operation requires a Student subject");
    }
    await assertStudentRegisteredForCompetitionSession(
      tx,
      args.editionId,
      args.sessionId,
      subject.studentId
    );
  }

  await tx.mutate.kalakritiOperation.insert({
    competitionSessionId: args.sessionId ?? null,
    correctionReason: null,
    createdAt: args.now,
    editionId: args.editionId,
    id: args.id,
    membershipId: subject.membershipId,
    occurredAt: args.occurredAt,
    operationId: args.operationId,
    recordedBy: ctx.userId,
    studentId: subject.studentId,
    supersededByOperationId: null,
    type: args.type,
  });

  await tx.mutate.kalakritiAuditEntry.insert({
    action: "recorded",
    actorUserId: ctx.userId,
    createdAt: args.now,
    domain: "event_day_operation",
    editionId: args.editionId,
    id: args.auditEntryId,
    metadata: {
      operationId: args.operationId,
      subjectKind: getOperationSubjectKind(subject),
      type: args.type,
    },
    reason: null,
    targetId: args.id,
    targetType: "event_day_operation",
  });
}

export const kalakritiOperationMutators = {
  correct: defineMutator(
    kalakritiOperationCorrectSchema,
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      const operationTx = tx as OperationTx;
      const edition = await getEditionForUpdate(operationTx, args.editionId);
      if (!edition) {
        throw new Error("Edition not found");
      }
      if (edition.lifecycle === "archived") {
        throw new Error("Edition is archived");
      }
      assertEditionIsLive(edition.lifecycle);

      const existing = (await operationTx.run(
        zql.kalakritiOperation.where("operationId", args.operationId).one()
      )) as KalakritiOperationRecord | undefined;
      if (existing) {
        if (existing.editionId !== args.editionId) {
          return;
        }
        return;
      }

      const target = (await operationTx.run(
        zql.kalakritiOperation.where("id", args.targetOperationId).one()
      )) as
        | (KalakritiOperationRecord & {
            competitionSessionId: string | null;
            correctionReason: string | null;
            occurredAt: number;
          })
        | undefined;
      if (!target || target.editionId !== args.editionId) {
        throw new Error("Operation not found in this Edition");
      }
      if (!isEffectiveOperation(target)) {
        throw new Error("Operation has already been superseded");
      }

      const studentCenterId =
        target.studentId && TRANSPORT_OPERATION_TYPES.has(target.type)
          ? await resolveStudentCenterId(operationTx, target.studentId)
          : null;
      await assertCanCorrectOperation(
        operationTx,
        ctx,
        args.editionId,
        target.type,
        studentCenterId,
        target.competitionSessionId
      );

      await operationTx.mutate.kalakritiOperation.insert({
        competitionSessionId: target.competitionSessionId,
        correctionReason: args.reason,
        createdAt: args.now,
        editionId: args.editionId,
        id: args.id,
        membershipId: target.membershipId,
        occurredAt: target.occurredAt,
        operationId: args.operationId,
        recordedBy: ctx.userId,
        studentId: target.studentId,
        supersededByOperationId: null,
        type: target.type,
      });
      await operationTx.mutate.kalakritiOperation.update({
        id: target.id,
        supersededByOperationId: args.id,
      });

      await operationTx.mutate.kalakritiAuditEntry.insert({
        action: "corrected",
        actorUserId: ctx.userId,
        createdAt: args.now,
        domain: "event_day_operation",
        editionId: args.editionId,
        id: args.auditEntryId,
        metadata: {
          targetOperationId: args.targetOperationId,
          type: target.type,
        },
        reason: args.reason,
        targetId: args.id,
        targetType: "event_day_operation",
      });
    }
  ),
  record: defineMutator(
    kalakritiOperationRecordSchema,
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      if (tx.location === "client") {
        return;
      }
      await recordKalakritiOperation(tx as OperationTx, ctx, {
        auditEntryId: args.auditEntryId,
        editionId: args.editionId,
        id: args.id,
        now: args.now,
        occurredAt: args.occurredAt,
        operationId: args.operationId,
        sessionId: args.sessionId,
        credentialToken: args.credentialToken,
        type: args.type,
      });
    }
  ),

  recordManual: defineMutator(
    kalakritiOperationRecordManualSchema,
    async ({ tx, ctx, args }) => {
      assertIsLoggedIn(ctx);
      if (tx.location === "client") {
        return;
      }
      await recordKalakritiOperation(tx as OperationTx, ctx, {
        auditEntryId: args.auditEntryId,
        editionId: args.editionId,
        id: args.id,
        now: args.now,
        occurredAt: args.occurredAt,
        operationId: args.operationId,
        sessionId: args.sessionId,
        humanId: args.humanId,
        type: args.type,
      });
    }
  ),
};
