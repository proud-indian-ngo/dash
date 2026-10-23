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
