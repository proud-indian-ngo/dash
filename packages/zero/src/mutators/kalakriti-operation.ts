import {
  KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES,
  KALAKRITI_OPERATION_TYPES,
  type KalakritiOperationType,
} from "@pi-dash/shared/kalakriti";
import { parseKalakritiPersonQr } from "@pi-dash/shared/kalakriti-person-qr";
import { defineMutator } from "@rocicorp/zero";
import z from "zod";

import type { Context } from "../context";
import {
  assertCanRecordOperation,
  findExistingOperationByOperationId,
  getOperationSubjectKind,
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
    kalakritiOperation: { insert: ZeroMutationFn };
  };
}

const kalakritiOperationRecordBaseSchema = z.object({
  auditEntryId: z.string(),
  editionId: z.string(),
  id: z.string(),
  now: z.number(),
  occurredAt: z.number(),
  operationId: z.string(),
  sessionId: z.string().optional(),
  type: z.enum(KALAKRITI_OPERATION_TYPES),
});

export const kalakritiOperationRecordSchema =
  kalakritiOperationRecordBaseSchema.extend({
    personQr: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => {
        try {
          parseKalakritiPersonQr(value);
          return true;
        } catch {
          return false;
        }
      }, "Invalid person QR"),
  });

export const kalakritiOperationRecordManualSchema =
  kalakritiOperationRecordBaseSchema.extend({
    humanId: z.string().min(1),
  });

interface ActiveMembership {
  id: string;
  kind: "guardian" | "volunteer";
}

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

async function assertCanRecordKalakritiOperation(
  tx: LockableKalakritiTx,
  ctx: Context,
  editionId: string,
  type: KalakritiOperationType,
  subject: OperationSubject,
  competitionId: string | null
): Promise<void> {
  if (can(ctx, "kalakriti.admin")) {
    return;
  }
  const membership = await getActiveMembership(tx, ctx, editionId);
  if (!membership || membership.kind !== "volunteer") {
    throw new Error("Unauthorized");
  }
  const assignments = (await tx.run(
    zql.kalakritiAssignment
      .where("editionId", editionId)
      .where("membershipId", membership.id)
  )) as readonly {
    responsibility: string;
    centerId: string | null;
    competitionId: string | null;
  }[];
  if (
    assignments.some(
      (assignment) => assignment.responsibility === "edition_admin"
    )
  ) {
    return;
  }
  const allowed = assignments.some((assignment) => {
    switch (type) {
      case "pickup":
      case "venue_departure":
      case "drop_off":
        return (
          assignment.responsibility === "transport_lead" ||
          (subject.centerId != null &&
            assignment.centerId === subject.centerId &&
            KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES.some(
              (role) => role === assignment.responsibility
            ))
        );
      case "volunteer_check_in":
        return assignment.responsibility === "hospitality_lead";
      case "breakfast":
      case "lunch":
        return assignment.responsibility === "food_lead";
      case "competition_attendance":
        return (
          competitionId !== null &&
          assignment.competitionId === competitionId &&
          (assignment.responsibility === "competition_volunteer" ||
            assignment.responsibility === "competition_coordinator")
        );
      default:
        return false;
    }
  });
  if (!allowed) {
    throw new Error("Unauthorized");
  }
}

interface OperationSubject {
  centerId?: string;
  membershipId: string | null;
  studentId: string | null;
}

async function validateAttendanceSubject(
  tx: OperationTx,
  editionId: string,
  subject: OperationSubject,
  sessionId: string | undefined
): Promise<string> {
  if (!sessionId || !subject.studentId) {
    throw new Error(
      "Competition session and Student are required for attendance"
    );
  }
  const session = (await tx.run(
    zql.kalakritiCompetitionSession
      .where("id", sessionId)
      .where("editionId", editionId)
      .related("division")
      .one()
  )) as
    | {
        editionId: string;
        division?: { id: string; editionId: string; competitionId: string };
      }
    | undefined;
  if (
    !session?.division ||
    session.editionId !== editionId ||
    session.division.editionId !== editionId
  ) {
    throw new Error("Competition session not found in this Edition");
  }
  const divisionId = session.division.id;
  const entryMember = await tx.run(
    zql.kalakritiEntryMember
      .where("editionId", editionId)
      .where("studentId", subject.studentId)
      .whereExists("entry", (entry) =>
        entry.where("editionId", editionId).where("divisionId", divisionId)
      )
      .one()
  );
  if (!entryMember) {
    throw new Error("Student is not registered for this Competition session");
  }
  return session.division.competitionId;
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

async function resolveSubjectFromPersonQr(
  tx: OperationTx,
  editionId: string,
  personQr: string
): Promise<OperationSubject> {
  const person = parseKalakritiPersonQr(personQr);
  if (person.type === "guardian") {
    throw new Error("Guardians cannot be operation subjects");
  }
  if (person.type === "student") {
    const student = (await tx.run(
      zql.kalakritiStudent
        .where("id", person.id)
        .where("editionId", editionId)
        .one()
    )) as { id: string; editionId: string; centerId: string } | undefined;
    if (
      !student ||
      student.id !== person.id ||
      student.editionId !== editionId
    ) {
      throw new Error("Student not found in this Edition");
    }
    return {
      studentId: student.id,
      membershipId: null,
      centerId: student.centerId,
    };
  }
  const membership = (await tx.run(
    zql.kalakritiEditionMembership
      .where("id", person.id)
      .where("editionId", editionId)
      .where("state", "active")
      .where("kind", "volunteer")
      .one()
  )) as
    | { id: string; editionId: string; state: string; kind: string }
    | undefined;
  if (
    !membership ||
    membership.id !== person.id ||
    membership.editionId !== editionId ||
    membership.state !== "active" ||
    membership.kind !== "volunteer"
  ) {
    throw new Error("Active Volunteer not found in this Edition");
  }
  return { studentId: null, membershipId: membership.id };
}

async function resolveSubjectFromHumanId(
  tx: OperationTx,
  editionId: string,
  humanId: string
): Promise<OperationSubject> {
  const student = (await tx.run(
    zql.kalakritiStudent
      .where("editionId", editionId)
      .where("humanId", humanId)
      .one()
  )) as { id: string; editionId: string; centerId: string } | undefined;
  if (student && student.editionId === editionId) {
    return {
      membershipId: null,
      studentId: student.id,
      centerId: student.centerId,
    };
  }
  const membership = (await tx.run(
    zql.kalakritiEditionMembership
      .where("editionId", editionId)
      .where("humanId", humanId)
      .where("state", "active")
      .where("kind", "volunteer")
      .one()
  )) as
    | { id: string; editionId: string; kind: string; state: string }
    | undefined;
  if (
    membership &&
    membership.editionId === editionId &&
    membership.kind === "volunteer" &&
    membership.state === "active"
  ) {
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
    personQr?: string;
    humanId?: string;
    type: KalakritiOperationType;
  }
): Promise<void> {
  const edition = await getEditionForUpdate(tx, args.editionId);
  if (!edition) {
    throw new Error("Edition not found");
  }
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

  if (edition.lifecycle !== "live") {
    throw new Error("edition_not_live");
  }

  const subject = args.personQr
    ? await resolveSubjectFromPersonQr(tx, args.editionId, args.personQr)
    : await resolveSubjectFromHumanId(tx, args.editionId, args.humanId ?? "");

  const competitionId =
    args.type === "competition_attendance"
      ? await validateAttendanceSubject(
          tx,
          args.editionId,
          subject,
          args.sessionId
        )
      : null;
  await assertCanRecordKalakritiOperation(
    tx,
    ctx,
    args.editionId,
    args.type,
    subject,
    competitionId
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
        personQr: args.personQr,
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
