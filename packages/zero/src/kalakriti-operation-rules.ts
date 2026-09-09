import type { KalakritiOperationType } from "@pi-dash/shared/kalakriti";

export interface KalakritiOperationRecord {
  competitionSessionId: string | null;
  editionId: string;
  id: string;
  membershipId: string | null;
  operationId: string;
  studentId: string | null;
  supersededByOperationId: string | null;
  type: KalakritiOperationType;
}

const STUDENT_OPERATION_TYPES = new Set<KalakritiOperationType>([
  "pickup",
  "venue_departure",
  "drop_off",
  "competition_attendance",
]);

const MEMBERSHIP_OPERATION_TYPES = new Set<KalakritiOperationType>([
  "volunteer_check_in",
]);

const FLEXIBLE_OPERATION_TYPES = new Set<KalakritiOperationType>([
  "breakfast",
  "lunch",
]);

export function isEffectiveOperation(
  operation: Pick<KalakritiOperationRecord, "supersededByOperationId">
): boolean {
  return operation.supersededByOperationId === null;
}

export function findExistingOperationByOperationId(
  operations: readonly KalakritiOperationRecord[],
  operationId: string
): KalakritiOperationRecord | undefined {
  return operations.find((operation) => operation.operationId === operationId);
}

export function getOperationSubjectKind(
  subject: Pick<KalakritiOperationRecord, "membershipId" | "studentId">
): "student" | "volunteer" {
  return subject.studentId ? "student" : "volunteer";
}

export function hasEffectivePickup(
  operations: readonly KalakritiOperationRecord[],
  studentId: string
): boolean {
  return operations.some(
    (operation) =>
      operation.studentId === studentId &&
      operation.type === "pickup" &&
      isEffectiveOperation(operation)
  );
}

export function hasEffectiveVenueDeparture(
  operations: readonly KalakritiOperationRecord[],
  studentId: string
): boolean {
  return operations.some(
    (operation) =>
      operation.studentId === studentId &&
      operation.type === "venue_departure" &&
      isEffectiveOperation(operation)
  );
}

export function hasEffectiveCheckIn(
  operations: readonly KalakritiOperationRecord[],
  membershipId: string
): boolean {
  return operations.some(
    (operation) =>
      operation.membershipId === membershipId &&
      operation.type === "volunteer_check_in" &&
      isEffectiveOperation(operation)
  );
}

export function assertOperationSubjectMatchesType(
  type: KalakritiOperationType,
  subject: { membershipId?: string | null; studentId?: string | null }
): void {
  const hasStudent = Boolean(subject.studentId);
  const hasMembership = Boolean(subject.membershipId);
  if (hasStudent === hasMembership) {
    throw new Error("Exactly one operation subject is required");
  }
  if (STUDENT_OPERATION_TYPES.has(type) && !hasStudent) {
    throw new Error("This operation requires a Student subject");
  }
  if (MEMBERSHIP_OPERATION_TYPES.has(type) && !hasMembership) {
    throw new Error("This operation requires a volunteer subject");
  }
  if (FLEXIBLE_OPERATION_TYPES.has(type)) {
    return;
  }
  if (
    STUDENT_OPERATION_TYPES.has(type) ||
    MEMBERSHIP_OPERATION_TYPES.has(type)
  ) {
    return;
  }
  throw new Error("Unsupported operation type");
}

export function assertOperationSessionRules(
  type: KalakritiOperationType,
  competitionSessionId?: string | null
): void {
  if (type === "competition_attendance" && !competitionSessionId) {
    throw new Error("Competition session is required for attendance");
  }
  if (type !== "competition_attendance" && competitionSessionId) {
    throw new Error("Competition session is only allowed for attendance");
  }
}

export function assertTransportOrderRules(
  operations: readonly KalakritiOperationRecord[],
  type: KalakritiOperationType,
  studentId: string
): void {
  if (
    type === "venue_departure" &&
    !hasEffectivePickup(operations, studentId)
  ) {
    throw new Error("Pickup is required before venue departure");
  }
  if (
    type === "drop_off" &&
    !hasEffectiveVenueDeparture(operations, studentId)
  ) {
    throw new Error("Venue departure is required before drop-off");
  }
}

export function assertMealAndAttendanceEligibility(
  operations: readonly KalakritiOperationRecord[],
  type: KalakritiOperationType,
  subject: { membershipId?: string | null; studentId?: string | null }
): void {
  if (type === "breakfast" || type === "lunch") {
    if (
      subject.studentId &&
      !hasEffectivePickup(operations, subject.studentId)
    ) {
      throw new Error("Pickup is required before meals");
    }
    if (
      subject.membershipId &&
      !hasEffectiveCheckIn(operations, subject.membershipId)
    ) {
      throw new Error("Check-in is required before meals");
    }
    return;
  }
  if (
    type === "competition_attendance" &&
    !(subject.studentId && hasEffectivePickup(operations, subject.studentId))
  ) {
    throw new Error("Pickup is required before competition attendance");
  }
}

export function assertCanRecordOperation(
  operations: readonly KalakritiOperationRecord[],
  type: KalakritiOperationType,
  subject: { membershipId?: string | null; studentId?: string | null },
  competitionSessionId?: string | null
): void {
  assertOperationSubjectMatchesType(type, subject);
  assertOperationSessionRules(type, competitionSessionId);
  if (subject.studentId) {
    assertTransportOrderRules(operations, type, subject.studentId);
  }
  assertMealAndAttendanceEligibility(operations, type, subject);
}
