import { uuidv7 } from "uuidv7";

const OPERATION_NOTE_TYPES = [
  { value: "pickup", label: "Pickup" },
  { value: "venue_arrival", label: "Venue arrival" },
  { value: "venue_departure", label: "Venue departure" },
  { value: "drop_off", label: "Drop-off" },
  { value: "volunteer_check_in", label: "Volunteer check-in" },
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "competition_attendance", label: "Competition attendance" },
] as const;

export function getOperationNoteTypes(access: {
  isGlobalAdmin: boolean;
  lifecycle: string;
  membership?: {
    kind: string;
    assignments: readonly {
      responsibility: string;
      competitionId?: string | null;
    }[];
  } | null;
}) {
  if (access.lifecycle !== "live") return [];
  const assignments =
    access.membership?.kind === "volunteer"
      ? access.membership.assignments
      : [];
  if (
    access.isGlobalAdmin ||
    assignments.some((a) => a.responsibility === "edition_admin")
  )
    return [...OPERATION_NOTE_TYPES];
  return OPERATION_NOTE_TYPES.filter(({ value }) =>
    assignments.some((a) => {
      if (value === "breakfast" || value === "lunch")
        return a.responsibility === "food_lead";
      if (value === "volunteer_check_in")
        return a.responsibility === "hospitality_lead";
      if (value === "competition_attendance")
        return (
          a.responsibility === "competition_coordinator" &&
          Boolean(a.competitionId)
        );
      return a.responsibility === "transport_lead";
    })
  );
}

export function makeOperationNoteAttempt(input: {
  editionId: string;
  targetOperationId: string;
  reason: string;
  humanId: string;
  subject: { studentId: string } | { membershipId: string };
}) {
  return {
    humanId: input.humanId,
    subject: input.subject,
    args: {
      editionId: input.editionId,
      targetOperationId: input.targetOperationId,
      reason: input.reason.trim(),
      id: uuidv7(),
      operationId: uuidv7(),
      auditEntryId: uuidv7(),
      now: Date.now(),
    },
  };
}
type OperationNoteAttempt = ReturnType<typeof makeOperationNoteAttempt>;

// Owned by the sidebar so an uncertain response survives closing Scan.
export function createOperationNoteLedger(scopeKey = "") {
  let attempt: OperationNoteAttempt | null = null;
  return {
    scopeKey,
    get attempt() {
      return attempt;
    },
    setAttempt(value: OperationNoteAttempt | null) {
      attempt = value;
    },
  };
}
export type OperationNoteLedger = ReturnType<typeof createOperationNoteLedger>;

export function isOperationNoteTargetCurrent(
  target: { id: string; supersededByOperationId: string | null },
  attempt: OperationNoteAttempt | null
) {
  if (!attempt) return target.supersededByOperationId === null;
  return (
    target.id === attempt.args.targetOperationId &&
    (target.supersededByOperationId === null ||
      target.supersededByOperationId === attempt.args.id)
  );
}
