import {
  canAccessKalakritiCenterRegistration,
  type KalakritiCenterRegistrationAccess,
  selectKalakritiCenterRegistrationCenters,
} from "./kalakriti-center-registration-policy";

export type EntryRegistrationAvailability =
  | "center_closed"
  | "edition_closed"
  | "loading"
  | "missing_sessions"
  | "missing_students"
  | "open";

interface EntryValidationStudent {
  ageCategory: {
    maxCompetitionsPerCategory: number;
    maxTotalCompetitions: number;
  };
  ageCategoryId: string;
  gender: "female" | "male";
  humanId?: string;
  id: string;
  name?: string;
}

interface EntryValidationSession {
  ageCategory: { name: string };
  ageCategoryId: string;
  competition: {
    category: { name: string };
    competitionCategoryId: string;
    genderEligibility: "both" | "female" | "male";
    maximumGroupSize: number;
    minimumGroupSize: number;
    participationMode: "group" | "individual";
  };
  endAt: number;
  id: string;
  scheduleActive?: boolean;
  startAt: number;
}

interface EntryValidationEntry {
  id?: string;
  members: readonly { studentId: string }[];
  session: EntryValidationSession;
  sessionId: string;
}

export type EntryStudentOptionEligibility =
  | { status: "disabled"; reason: string }
  | { status: "eligible" }
  | { status: "hidden" };

function getStudentEntryValidationError({
  entries,
  session,
  student,
}: {
  entries: readonly EntryValidationEntry[];
  session: EntryValidationSession;
  student: EntryValidationStudent;
}): string | null {
  if (student.ageCategoryId !== session.ageCategoryId) {
    return `This Session is for ${session.ageCategory.name}`;
  }
  if (
    session.competition.genderEligibility !== "both" &&
    session.competition.genderEligibility !== student.gender
  ) {
    return `This Competition is limited to ${session.competition.genderEligibility} Students`;
  }
  const existing = entries.filter((entry) =>
    entry.members.some((member) => member.studentId === student.id)
  );
  if (existing.some((entry) => entry.sessionId === session.id)) {
    return "This Student is already registered for this Session";
  }
  if (existing.length >= student.ageCategory.maxTotalCompetitions) {
    return "This Student has reached the total Competition limit";
  }
  const categoryEntries = existing.filter(
    (entry) =>
      entry.session.competition.competitionCategoryId ===
      session.competition.competitionCategoryId
  ).length;
  if (categoryEntries >= student.ageCategory.maxCompetitionsPerCategory) {
    return `This Student has reached the ${session.competition.category.name} limit`;
  }
  if (
    existing.some(
      (entry) =>
        entry.session.scheduleActive !== false &&
        entry.session.startAt < session.endAt &&
        entry.session.endAt > session.startAt
    )
  ) {
    return "This Session overlaps another Entry for this Student";
  }
  return null;
}

export function getEntryStudentOptionEligibility({
  editingEntryId,
  entries,
  session,
  student,
}: {
  editingEntryId?: string;
  entries: readonly EntryValidationEntry[];
  session: EntryValidationSession;
  student: EntryValidationStudent;
}): EntryStudentOptionEligibility {
  if (
    student.ageCategoryId !== session.ageCategoryId ||
    (session.competition.genderEligibility !== "both" &&
      session.competition.genderEligibility !== student.gender)
  ) {
    return { status: "hidden" };
  }
  const otherEntries = editingEntryId
    ? entries.filter((entry) => entry.id !== editingEntryId)
    : entries;
  if (
    otherEntries.some(
      (entry) =>
        entry.sessionId === session.id &&
        entry.members.some((member) => member.studentId === student.id)
    )
  ) {
    return { status: "hidden" };
  }
  const reason = getStudentEntryValidationError({
    entries: otherEntries,
    session,
    student,
  });
  return reason ? { reason, status: "disabled" } : { status: "eligible" };
}

export function getIndividualEntryValidationError({
  entries,
  session,
  student,
}: {
  entries: readonly EntryValidationEntry[];
  session: EntryValidationSession;
  student: EntryValidationStudent;
}): string | null {
  const { competition } = session;
  if (competition.participationMode !== "individual") {
    return "Choose an individual Competition Session";
  }
  return getStudentEntryValidationError({ entries, session, student });
}

export function getGroupEntryValidationErrors({
  editingEntryId,
  entries,
  session,
  students,
}: {
  editingEntryId?: string;
  entries: readonly EntryValidationEntry[];
  session: EntryValidationSession;
  students: readonly EntryValidationStudent[];
}): string[] {
  const { competition } = session;
  if (competition.participationMode !== "group") {
    return ["Choose a group Competition Session"];
  }
  if (students.length < competition.minimumGroupSize) {
    return [
      `Select at least ${competition.minimumGroupSize} Students for this group`,
    ];
  }
  if (students.length > competition.maximumGroupSize) {
    return [
      `Select no more than ${competition.maximumGroupSize} Students for this group`,
    ];
  }
  if (new Set(students.map((student) => student.id)).size !== students.length) {
    return ["Each Student can appear only once in a group"];
  }
  const otherEntries = editingEntryId
    ? entries.filter((entry) => entry.id !== editingEntryId)
    : entries;
  return students.flatMap((student) => {
    const message = getStudentEntryValidationError({
      entries: otherEntries,
      session,
      student,
    });
    if (!message) {
      return [];
    }
    const label = [student.humanId, student.name].filter(Boolean).join(" · ");
    return [`${label || "Student"}: ${message}`];
  });
}

export function selectEligibleStudentsForSession<
  TStudent extends EntryValidationStudent,
>({
  editingEntryId,
  entries,
  session,
  students,
}: {
  editingEntryId?: string;
  entries: readonly EntryValidationEntry[];
  session: EntryValidationSession;
  students: readonly TStudent[];
}): TStudent[] {
  return students.filter(
    (student) =>
      getEntryStudentOptionEligibility({
        editingEntryId,
        entries,
        session,
        student,
      }).status === "eligible"
  );
}

export function canRemoveKalakritiEntries({
  centerEnabled,
  lifecycle,
}: {
  centerEnabled: boolean;
  lifecycle: string;
}): boolean {
  return lifecycle === "registration_open" && centerEnabled;
}

export function canAccessKalakritiEntries(
  access: KalakritiCenterRegistrationAccess
): boolean {
  return canAccessKalakritiCenterRegistration(access);
}

export function selectKalakritiEntryCenters<T extends { id: string }>(
  centers: readonly T[],
  access: KalakritiCenterRegistrationAccess
): T[] {
  return selectKalakritiCenterRegistrationCenters(centers, access);
}

export function getEntryRegistrationAvailability({
  centerEnabled,
  lifecycle,
  referenceDataLoading,
  sessionCount,
  studentCount,
}: {
  centerEnabled: boolean;
  lifecycle: string;
  referenceDataLoading: boolean;
  sessionCount: number;
  studentCount: number;
}): EntryRegistrationAvailability {
  if (lifecycle !== "registration_open") {
    return "edition_closed";
  }
  if (!centerEnabled) {
    return "center_closed";
  }
  if (referenceDataLoading) {
    return "loading";
  }
  if (studentCount === 0) {
    return "missing_students";
  }
  if (sessionCount === 0) {
    return "missing_sessions";
  }
  return "open";
}
