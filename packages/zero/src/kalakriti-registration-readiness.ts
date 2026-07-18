export interface KalakritiRegistrationReadinessBlocker {
  code:
    | "invalid_dates"
    | "no_active_centers"
    | "missing_age_categories"
    | "overlapping_age_categories"
    | "missing_center_age_quotas"
    | "no_active_competitions"
    | "competition_missing_session"
    | "no_active_venues"
    | "invalid_active_sessions";
  message: string;
}

export interface KalakritiRegistrationReadinessSnapshot {
  ageCategories: readonly {
    id: string;
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
  edition: {
    ageCutoffDate: number;
    eventDate: number;
    plannedRegistrationCloseAt: number;
    timezone: string | null;
  };
  quotas: readonly { ageCategoryId: string; centerId: string }[];
  sessions: readonly {
    ageCategoryId: string;
    cancelledAt: number | null;
    capacity: number;
    competitionId: string;
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

  const quotaKeys = new Set(
    snapshot.quotas.map((quota) => `${quota.centerId}:${quota.ageCategoryId}`)
  );
  if (
    centers.some((center) =>
      ageCategories.some(
        (category) => !quotaKeys.has(`${center.id}:${category.id}`)
      )
    )
  ) {
    blockers.push({
      code: "missing_center_age_quotas",
      message: "Every active Center and Age Category needs a quota",
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
  if (
    activeCompetitions.some(
      (competition) =>
        !activeSessions.some(
          (session) => session.competitionId === competition.id
        )
    )
  ) {
    blockers.push({
      code: "competition_missing_session",
      message: "Every active Competition needs a Session",
    });
  }

  const eventDate = edition.timezone
    ? dateInTimeZone(edition.eventDate, edition.timezone)
    : null;
  const activeAgeCategoryIds = new Set(
    ageCategories.map((category) => category.id)
  );
  if (
    activeSessions.some(
      (session) =>
        !(
          activeCompetitionIds.has(session.competitionId) &&
          activeAgeCategoryIds.has(session.ageCategoryId) &&
          activeVenues.has(session.venueId) &&
          Number.isInteger(session.capacity)
        ) ||
        session.capacity <= 0 ||
        !Number.isFinite(session.startAt) ||
        !Number.isFinite(session.endAt) ||
        session.endAt <= session.startAt ||
        !eventDate ||
        !edition.timezone ||
        dateInTimeZone(session.startAt, edition.timezone) !== eventDate ||
        dateInTimeZone(session.endAt, edition.timezone) !== eventDate
    )
  ) {
    blockers.push({
      code: "invalid_active_sessions",
      message:
        "Active Sessions must have valid same-day times, capacity, and active references",
    });
  }

  return blockers;
}
