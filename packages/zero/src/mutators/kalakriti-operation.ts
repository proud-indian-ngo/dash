import {
  KALAKRITI_CENTER_SCOPED_LIAISON_RESPONSIBILITIES,
  KALAKRITI_OPERATION_TYPES,
  canRecordKalakritiCompetitionAttendance,
  isKalakritiVolunteerManagementResponsibility,
  type KalakritiOperationType,
} from "@pi-dash/shared/kalakriti";
import { parseKalakritiPersonQr } from "@pi-dash/shared/kalakriti-person-qr";
import { defineMutator } from "@rocicorp/zero";
import { uuidv7 } from "uuidv7";
import z from "zod";

import type { Context } from "../context";
import {
  isKalakritiCenterScanStage,
  hasKalakritiVenueArrival,
  hasKalakritiSessionAttendance,
} from "../kalakriti-center-scan-rules";
import {
  assertCanRecordOperation,
  assertOperationSubjectMatchesType,
  findExistingOperationByOperationId,
  getOperationSubjectKind,
  type KalakritiOperationRecord,
} from "../kalakriti-operation-rules";
import { assertIsLoggedIn, can } from "../permissions";
import { zql } from "../schema";
import {
  type CenterScanTx,
  prepareCenterScan,
} from "./kalakriti-center-scan-core";
import { kalakritiMealUndoMutator } from "./kalakriti-meal-undo";
import {
  getEditionForUpdate,
  type LockableKalakritiTx,
} from "./kalakriti-row-locks";

type OperationTx = CenterScanTx;

const kalakritiOperationRecordBaseSchema = z.object({
  auditEntryId: z.string(),
  editionId: z.string(),
  id: z.string(),
  now: z.number(),
  occurredAt: z.number(),
  operationId: z.string(),
  sessionId: z.string().optional(),
  type: z.enum(KALAKRITI_OPERATION_TYPES).exclude(["meal_correction"]),
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

export async function assertCanRecordKalakritiOperation(
  tx: LockableKalakritiTx,
  ctx: Context,
  editionId: string,
  type: KalakritiOperationType,
  subject: OperationSubject,
  competitionId: string | null,
  competitionCategoryId: string | null = null
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
    competitionCategoryId: string | null;
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
      case "venue_arrival":
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
      case "guardian_check_in":
        return isKalakritiVolunteerManagementResponsibility(
          assignment.responsibility
        );
      case "attendee_check_in":
      case "volunteer_check_in":
        return (
          isKalakritiVolunteerManagementResponsibility(
            assignment.responsibility
          ) ||
          assignment.responsibility === "hospitality_lead" ||
          assignment.responsibility === "hospitality_member"
        );
      case "breakfast":
      case "lunch":
        return (
          assignment.responsibility === "food_lead" ||
          assignment.responsibility === "food_member"
        );
      case "competition_attendance":
        return (
          competitionId !== null &&
          canRecordKalakritiCompetitionAttendance([assignment], {
            competitionId,
            competitionCategoryId,
          })
        );
      default:
        return false;
    }
  });
  if (!allowed) {
    throw new Error("Unauthorized");
  }
}

interface ActiveAttendee {
  id: string;
  editionId: string;
  humanId: string;
  kind: "guest" | "judge";
  archivedAt: number | null;
}

interface OperationSubject {
  attendeeId?: string | null;
  attendeeKind?: "guest" | "judge";
  centerId?: string;
  membershipKind?: "guardian" | "volunteer";
  membershipId: string | null;
  studentId: string | null;
}

async function validateAttendanceSubject(
  tx: OperationTx,
  editionId: string,
  subject: OperationSubject,
  sessionId: string | undefined
): Promise<{
  competitionId: string;
  competitionCategoryId: string | null;
  groupEntryId: string | null;
}> {
  if (!sessionId || !subject.studentId) {
    throw new Error(
      "Competition session and Student are required for attendance"
    );
  }
  const session = (await tx.run(
    zql.kalakritiCompetitionSession
      .where("id", sessionId)
      .where("editionId", editionId)
      .related("division", (division) => division.related("competition"))
      .one()
  )) as
    | {
        cancelledAt: number | null;
        editionId: string;
        division?: {
          id: string;
          editionId: string;
          competitionId: string;
          competition?: {
            id: string;
            editionId: string;
            cancelledAt: number | null;
            competitionCategoryId: string;
            participationMode: "individual" | "group";
          };
        };
      }
    | undefined;
  if (
    !session?.division ||
    session.editionId !== editionId ||
    session.division.editionId !== editionId
  ) {
    throw new Error("Competition session not found in this Edition");
  }
  if (session.cancelledAt !== null) {
    throw new Error("Competition session is cancelled");
  }
  const competition = session.division.competition;
  if (
    !competition ||
    competition.editionId !== editionId ||
    competition.id !== session.division.competitionId
  ) {
    throw new Error("Competition not found in this Edition");
  }
  if (competition.cancelledAt !== null) {
    throw new Error("Competition is cancelled");
  }
  const divisionId = session.division.id;
  const entryMember = (await tx.run(
    zql.kalakritiEntryMember
      .where("editionId", editionId)
      .where("studentId", subject.studentId)
      .whereExists("entry", (entry) =>
        entry.where("editionId", editionId).where("divisionId", divisionId)
      )
      .one()
  )) as { entryId: string } | undefined;
  if (!entryMember) {
    throw new Error("Student is not registered for this Competition session");
  }
  return {
    competitionId: session.division.competitionId,
    competitionCategoryId: competition.competitionCategoryId ?? null,
    groupEntryId:
      competition.participationMode === "group" ? entryMember.entryId : null,
  };
}

async function loadSubjectOperations(
  tx: OperationTx,
  editionId: string,
  subject: OperationSubject
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
  if (subject.attendeeId) {
    return (await tx.run(
      zql.kalakritiOperation
        .where("editionId", editionId)
        .where("attendeeId", subject.attendeeId)
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
  if (person.type === "guest" || person.type === "judge") {
    const attendee = (await tx.run(
      zql.kalakritiAttendee
        .where("id", person.id)
        .where("editionId", editionId)
        .where("kind", person.type)
        .where("archivedAt", "IS", null)
        .one()
    )) as ActiveAttendee | undefined;
    if (
      !attendee ||
      attendee.id !== person.id ||
      attendee.editionId !== editionId ||
      attendee.kind !== person.type ||
      attendee.archivedAt !== null
    )
      throw new Error("Active attendee not found in this Edition");
    return {
      attendeeId: attendee.id,
      attendeeKind: attendee.kind,
      membershipId: null,
      studentId: null,
    };
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
      .where("kind", person.type)
      .one()
  )) as
    | { id: string; editionId: string; state: string; kind: string }
    | undefined;
  if (
    !membership ||
    membership.id !== person.id ||
    membership.editionId !== editionId ||
    membership.state !== "active" ||
    membership.kind !== person.type
  ) {
    throw new Error(
      person.type === "guardian"
        ? "Active Guardian not found in this Edition"
        : "Active Volunteer not found in this Edition"
    );
  }
  return {
    studentId: null,
    membershipId: membership.id,
    membershipKind: person.type,
  };
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
  let membershipQuery = zql.kalakritiEditionMembership
    .where("editionId", editionId)
    .where("state", "active");
  membershipQuery = z.uuid().safeParse(humanId).success
    ? membershipQuery.where(({ or, cmp }) =>
        or(cmp("humanId", humanId), cmp("id", humanId))
      )
    : membershipQuery.where("humanId", humanId);
  const membership = (await tx.run(membershipQuery.one())) as
    | { id: string; editionId: string; kind: string; state: string }
    | undefined;
  if (
    membership &&
    membership.editionId === editionId &&
    (membership.kind === "volunteer" || membership.kind === "guardian") &&
    membership.state === "active"
  ) {
    return {
      membershipId: membership.id,
      studentId: null,
      membershipKind: membership.kind,
    };
  }
  const attendee = (await tx.run(
    zql.kalakritiAttendee
      .where("editionId", editionId)
      .where("humanId", humanId)
      .where("archivedAt", "IS", null)
      .one()
  )) as ActiveAttendee | undefined;
  if (
    attendee &&
    attendee.editionId === editionId &&
    attendee.humanId === humanId &&
    attendee.archivedAt === null &&
    (attendee.kind === "guest" || attendee.kind === "judge")
  ) {
    return {
      attendeeId: attendee.id,
      attendeeKind: attendee.kind,
      membershipId: null,
      studentId: null,
    };
  }
  throw new Error("Yearly ID not found in this Edition");
}

export async function recordKalakritiOperation(
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
    centerId?: string;
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
      existing.type === "meal_correction" ||
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

  // Resolve the generic Check-in station request using persisted identity.
  let type = args.type;
  if (type === "volunteer_check_in") {
    if (subject.attendeeId) type = "attendee_check_in";
    else if (subject.membershipKind === "guardian") type = "guardian_check_in";
  }
  assertOperationSubjectMatchesType(type, subject);

  if (args.centerId !== undefined && subject.centerId !== args.centerId) {
    throw new Error("Student does not belong to the selected Center");
  }

  const attendance =
    type === "competition_attendance"
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
    type,
    subject,
    attendance?.competitionId ?? null,
    attendance?.competitionCategoryId ?? null
  );

  if (isKalakritiCenterScanStage(type)) {
    if (!subject.centerId || !subject.studentId) {
      throw new Error("This operation requires a Student subject");
    }
    await prepareCenterScan(tx, {
      editionId: args.editionId,
      centerId: subject.centerId,
      stage: type,
      studentId: subject.studentId,
      now: args.now,
      actorUserId: ctx.userId,
    });
  }

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
        operation.type === type &&
        operation.competitionSessionId === (args.sessionId ?? null) &&
        operation.supersededByOperationId === null
    )
  ) {
    return;
  }

  assertCanRecordOperation(
    subjectOperations,
    type,
    subject,
    args.sessionId ?? null
  );

  await tx.mutate.kalakritiOperation.insert({
    competitionSessionId: args.sessionId ?? null,
    correctionReason: null,
    createdAt: args.now,
    editionId: args.editionId,
    id: args.id,
    attendeeId: subject.attendeeId ?? null,
    membershipId: subject.membershipId,
    occurredAt: args.occurredAt,
    operationId: args.operationId,
    recordedBy: ctx.userId,
    studentId: subject.studentId,
    supersededByOperationId: null,
    type,
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
      type,
    },
    reason: null,
    targetId: args.id,
    targetType: "event_day_operation",
  });

  if (attendance?.groupEntryId && args.sessionId) {
    const sessionId = args.sessionId;
    const members = (await tx.run(
      zql.kalakritiEntryMember
        .where("editionId", args.editionId)
        .where("entryId", attendance.groupEntryId)
        .related("student", (student) =>
          student
            .where("editionId", args.editionId)
            .related("operations", (operations) =>
              operations
                .where("editionId", args.editionId)
                .where(({ or, and, cmp }) =>
                  or(
                    cmp("type", "pickup"),
                    cmp("type", "venue_arrival"),
                    and(
                      cmp("type", "competition_attendance"),
                      cmp("competitionSessionId", sessionId)
                    )
                  )
                )
            )
        )
    )) as readonly {
      studentId: string;
      student?: { operations: readonly KalakritiOperationRecord[] };
    }[];
    for (const member of members) {
      const operations = member.student?.operations;
      if (
        member.studentId === subject.studentId ||
        !operations ||
        !hasKalakritiVenueArrival(operations) ||
        hasKalakritiSessionAttendance(operations, {
          editionId: args.editionId,
          sessionId: args.sessionId,
        })
      )
        continue;
      const memberSubject = { studentId: member.studentId, membershipId: null };
      assertCanRecordOperation(
        operations,
        "competition_attendance",
        memberSubject,
        args.sessionId
      );
      const id = uuidv7();
      const operationId = uuidv7();
      await tx.mutate.kalakritiOperation.insert({
        id,
        operationId,
        editionId: args.editionId,
        studentId: member.studentId,
        membershipId: null,
        attendeeId: null,
        type: "competition_attendance",
        competitionSessionId: args.sessionId,
        correctionReason: null,
        supersededByOperationId: null,
        createdAt: args.now,
        occurredAt: args.occurredAt,
        recordedBy: ctx.userId,
      });
      await tx.mutate.kalakritiAuditEntry.insert({
        id: uuidv7(),
        editionId: args.editionId,
        actorUserId: ctx.userId,
        createdAt: args.now,
        action: "recorded",
        domain: "event_day_operation",
        targetId: id,
        targetType: "event_day_operation",
        reason: null,
        metadata: {
          operationId,
          subjectKind: "student",
          type: "competition_attendance",
          initiatingOperationId: args.operationId,
          entryId: attendance.groupEntryId,
        },
      });
    }
  }
}

export const kalakritiOperationMutators = {
  undoMeal: kalakritiMealUndoMutator,
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
