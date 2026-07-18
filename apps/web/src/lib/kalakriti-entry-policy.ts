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
  id: string;
}

interface EntryValidationSession {
  ageCategory: { name: string };
  ageCategoryId: string;
  capacity: number;
  competition: {
    category: { name: string };
    competitionCategoryId: string;
    genderEligibility: "both" | "female" | "male";
    participationMode: "group" | "individual";
  };
  endAt: number;
  entries: readonly { id: string }[];
  id: string;
  startAt: number;
}

interface EntryValidationEntry {
  members: readonly { studentId: string }[];
  session: EntryValidationSession;
  sessionId: string;
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
  if (student.ageCategoryId !== session.ageCategoryId) {
    return `This Session is for ${session.ageCategory.name}`;
  }
  if (
    competition.genderEligibility !== "both" &&
    competition.genderEligibility !== student.gender
  ) {
    return `This Competition is limited to ${competition.genderEligibility} Students`;
  }
  if (session.entries.length >= session.capacity) {
    return "This Session is full. Choose another Session.";
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
      competition.competitionCategoryId
  ).length;
  if (categoryEntries >= student.ageCategory.maxCompetitionsPerCategory) {
    return `This Student has reached the ${competition.category.name} limit`;
  }
  if (
    existing.some(
      (entry) =>
        entry.session.startAt < session.endAt &&
        entry.session.endAt > session.startAt
    )
  ) {
    return "This Session overlaps another Entry for this Student";
  }
  return null;
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
