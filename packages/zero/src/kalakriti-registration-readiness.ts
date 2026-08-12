export interface KalakritiRegistrationReadinessBlocker {
  code:
    | "invalid_dates"
    | "no_active_centers"
    | "missing_age_categories"
    | "overlapping_age_categories"
    | "missing_student_limits"
    | "no_active_competitions"
    | "competition_missing_division"
    | "competition_missing_session"
    | "no_active_venues"
    | "invalid_active_sessions";
  message: string;
}

export interface KalakritiRegistrationReadinessSnapshot {
  ageCategories: readonly {
    femaleStudentLimit: number;
    id: string;
    maleStudentLimit: number;
    maximumAge: number;
    minimumAge: number;
  }[];
  centers: readonly { id: string; retiredAt: number | null }[];
  competitionCategories: readonly { id: string; retiredAt: number | null }[];
  competitions: readonly {
    cancelledAt: number | null;
    competitionCategoryId: string;
    editionId: string;
    id: string;
    retiredAt: number | null;
  }[];
  divisions: readonly {
    ageCategoryId: string;
    competitionId: string;
    id: string;
  }[];
  edition: {
    ageCutoffDate: number;
    eventDate: number;
    plannedRegistrationCloseAt: number;
    timezone: string | null;
  };
  sessions: readonly {
    cancelledAt: number | null;
    divisionId: string;
    endAt: number;
    id: string;
    startAt: number;
    venueId: string;
  }[];
  venues: readonly { id: string; retiredAt: number | null }[];
}

function dateInTimeZone(timestamp: number, timeZone: string): string | null {
  try {
    if (!Number.isFinite(timestamp)) {
      return null;
    }
    const values = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone,
        year: "numeric",
      })
        .formatToParts(new Date(timestamp))
        .map((part) => [part.type, part.value])
    );
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

function hasOverlappingAgeCategories(
  categories: readonly { maximumAge: number; minimumAge: number }[]
): boolean {
  const ordered = [...categories].sort(
    (left, right) => left.minimumAge - right.minimumAge
  );
  return ordered.some(
    (category, index) =>
      index > 0 && category.minimumAge <= (ordered[index - 1]?.maximumAge ?? -1)
  );
}

export function getKalakritiRegistrationReadiness(
  snapshot: KalakritiRegistrationReadinessSnapshot
): KalakritiRegistrationReadinessBlocker[] {
  const blockers: KalakritiRegistrationReadinessBlocker[] = [];
  const { edition } = snapshot;
  if (
    !(
      Number.isFinite(edition.eventDate) &&
      Number.isFinite(edition.ageCutoffDate) &&
      Number.isFinite(edition.plannedRegistrationCloseAt) &&
      edition.timezone
    ) ||
    edition.plannedRegistrationCloseAt >= edition.eventDate
  ) {
    blockers.push({
      code: "invalid_dates",
      message: "Edition dates are missing or invalid",
    });
  }

  const { ageCategories } = snapshot;
  const centers = snapshot.centers.filter(
    (center) => center.retiredAt === null
  );
  if (centers.length === 0) {
    blockers.push({
      code: "no_active_centers",
      message: "At least one active Center is required",
    });
  }
  if (ageCategories.length === 0) {
    blockers.push({
      code: "missing_age_categories",
      message: "At least one Age Category is required",
    });
  } else if (hasOverlappingAgeCategories(ageCategories)) {
    blockers.push({
      code: "overlapping_age_categories",
      message: "Age Categories must not overlap",
    });
  }

  if (
    ageCategories.some(
      (category) => category.maleStudentLimit + category.femaleStudentLimit <= 0
    )
  ) {
    blockers.push({
      code: "missing_student_limits",
      message: "Every Age Category needs a Student limit",
    });
  }

  const activeCategories = new Set(
    snapshot.competitionCategories
      .filter((category) => category.retiredAt === null)
      .map((category) => category.id)
  );
  const activeCompetitions = snapshot.competitions.filter(
    (competition) =>
      competition.retiredAt === null &&
      competition.cancelledAt === null &&
      activeCategories.has(competition.competitionCategoryId)
  );
  const activeVenues = new Set(
    snapshot.venues
      .filter((venue) => venue.retiredAt === null)
      .map((venue) => venue.id)
  );
  if (activeCompetitions.length === 0) {
    blockers.push({
      code: "no_active_competitions",
      message: "At least one active Competition is required",
    });
  }
  if (activeVenues.size === 0) {
    blockers.push({
      code: "no_active_venues",
      message: "At least one active Venue is required",
    });
  }

  const activeCompetitionIds = new Set(
    activeCompetitions.map((competition) => competition.id)
  );
  const activeSessions = snapshot.sessions.filter(
    (session) => session.cancelledAt === null
  );
  const activeCompetitionDivisions = snapshot.divisions.filter((division) =>
    activeCompetitionIds.has(division.competitionId)
  );
  if (
    activeCompetitions.some(
      (competition) =>
        !activeCompetitionDivisions.some(
          (division) => division.competitionId === competition.id
        )
    )
  ) {
    blockers.push({
      code: "competition_missing_division",
      message: "Every active Competition needs an Age Category Division",
    });
  }
  if (
    activeCompetitionDivisions.some(
      (division) =>
        !activeSessions.some((session) => session.divisionId === division.id)
    )
  ) {
    blockers.push({
      code: "competition_missing_session",
      message: "Every active Competition Division needs a Session",
    });
  }

  const eventDate = edition.timezone
    ? dateInTimeZone(edition.eventDate, edition.timezone)
    : null;
  const activeAgeCategoryIds = new Set(
    ageCategories.map((category) => category.id)
  );
  const activeDivisions = new Map(
    snapshot.divisions.map((division) => [division.id, division])
  );
  if (
    activeSessions.some((session) => {
      const division = activeDivisions.get(session.divisionId);
      return (
        !(
          division &&
          activeCompetitionIds.has(division.competitionId) &&
          activeAgeCategoryIds.has(division.ageCategoryId) &&
          activeVenues.has(session.venueId) &&
          Number.isFinite(session.startAt) &&
          Number.isFinite(session.endAt)
        ) ||
        session.endAt <= session.startAt ||
        !eventDate ||
        !edition.timezone ||
        dateInTimeZone(session.startAt, edition.timezone) !== eventDate ||
        dateInTimeZone(session.endAt, edition.timezone) !== eventDate
      );
    })
  ) {
    blockers.push({
      code: "invalid_active_sessions",
      message:
        "Active Sessions must have valid same-day times and active Division and Venue references",
    });
  }

  return blockers;
}
