interface CompetitionForMetrics {
  id: string;
  cancelledAt: number | null;
  retiredAt: number | null;
  divisions: readonly { id: string }[];
}

interface SessionForMetrics {
  cancelledAt: number | null;
  divisionId: string;
  venueId: string;
}

export function countScheduledSessionsByVenue(
  sessions: readonly {
    cancelledAt: number | null;
    venueId: string;
    division?: {
      competition?: {
        cancelledAt: number | null;
        retiredAt: number | null;
      } | null;
    } | null;
  }[]
) {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const competition = session.division?.competition;
    if (
      session.cancelledAt !== null ||
      !competition ||
      competition.cancelledAt !== null ||
      competition.retiredAt !== null
    ) {
      continue;
    }
    counts.set(session.venueId, (counts.get(session.venueId) ?? 0) + 1);
  }
  return counts;
}

export function getCompetitionPageMetrics(
  competitions: readonly CompetitionForMetrics[],
  sessions: readonly SessionForMetrics[]
) {
  const activeCompetitions = competitions.filter(
    (competition) =>
      competition.cancelledAt === null && competition.retiredAt === null
  );
  const activeDivisionIds = new Set(
    activeCompetitions.flatMap((competition) =>
      competition.divisions.map((division) => division.id)
    )
  );
  const activeSessions = sessions.filter(
    (session) =>
      session.cancelledAt === null && activeDivisionIds.has(session.divisionId)
  );
  const scheduledDivisionIds = new Set(
    activeSessions.map((session) => session.divisionId)
  );

  return {
    activeCompetitions: activeCompetitions.length,
    activeDivisions: activeDivisionIds.size,
    activeSessions: activeSessions.length,
    cancelledSessions: sessions.filter(
      (session) => session.cancelledAt !== null
    ).length,
    missingDivisions: activeCompetitions.filter(
      (competition) => competition.divisions.length === 0
    ).length,
    scheduledVenues: new Set(activeSessions.map((session) => session.venueId))
      .size,
    unscheduledDivisions: [...activeDivisionIds].filter(
      (id) => !scheduledDivisionIds.has(id)
    ).length,
  };
}
