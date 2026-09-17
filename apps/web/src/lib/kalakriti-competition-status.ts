export const COMPETITION_STATUS_LABELS = {
  scheduled: "Scheduled",
  running: "Running",
  finished: "Finished",
  winner_assigned: "Winner assigned",
  not_scheduled: "Not scheduled",
  cancelled: "Cancelled",
  retired: "Retired",
} as const;

export type CompetitionStatus = keyof typeof COMPETITION_STATUS_LABELS;

export function deriveCompetitionStatus(
  competition: {
    cancelled: boolean;
    retired: boolean;
    endAt: number | null;
    hasAttendance: boolean;
    hasPublishedWinner: boolean;
  },
  now: number
): CompetitionStatus {
  if (competition.cancelled) return "cancelled";
  if (competition.retired) return "retired";
  if (competition.hasPublishedWinner) return "winner_assigned";
  if (competition.endAt === null) return "not_scheduled";
  if (now >= competition.endAt) return "finished";
  if (competition.hasAttendance) return "running";
  return "scheduled";
}
