import {
  hasKalakritiVenueArrival,
  hasKalakritiSessionAttendance,
} from "@pi-dash/zero/kalakriti-center-scan-rules";

import type {
  KalakritiEntryStudent,
  KalakritiEntryRow,
} from "./entry-form-dialog";
export function getEntryStudentArrival(
  student: KalakritiEntryStudent,
  snapshotReady = true
): "Present" | "Not present" | "Checking presence" {
  if (!snapshotReady || !student.operations) return "Checking presence";
  return hasKalakritiVenueArrival(student.operations)
    ? "Present"
    : "Not present";
}
export function getEntryStudentAttendance(
  student: KalakritiEntryStudent,
  editionId: string,
  sessionId: string | undefined
): string {
  if (!sessionId || !student.operations) return "Checking attendance";
  return hasKalakritiSessionAttendance(student.operations, {
    editionId,
    sessionId,
  })
    ? "Attended"
    : "Not attended";
}
export function getEntryStatusCounts(
  ids: readonly string[],
  labels: ReadonlyMap<string, string> | undefined,
  positive: string
) {
  const unique = [...new Set(ids)];
  const count = unique.filter((id) => labels?.get(id) === positive).length;
  const total = unique.length;
  const negative = `Not ${positive.toLowerCase()}`;
  const pending =
    !labels ||
    unique.some(
      (id) => labels.get(id) !== positive && labels.get(id) !== negative
    );
  const category = pending
    ? "checking"
    : count === 0
      ? "none"
      : count === total
        ? "all"
        : "partial";
  return { count, total, category };
}

export function entryAttendanceKey(
  entry: KalakritiEntryRow,
  studentId: string
): string {
  return `${entry.session.competitionSessionId ?? "unknown"}:${studentId}`;
}
