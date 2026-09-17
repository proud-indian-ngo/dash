import { parseEditionDateTime } from "./kalakriti-schedule-time";

interface DivisionScheduleDraft {
  id: string;
  venueId?: string;
  startAt?: string;
  endAt?: string;
}
interface ExistingSchedule {
  id: string;
  divisionId: string;
  venueId: string;
  startAt: number;
  endAt: number;
  cancelledAt: number | null;
}

export function previewCompetitionSchedules(
  divisions: readonly DivisionScheduleDraft[],
  sessions: readonly ExistingSchedule[],
  formatter: Intl.DateTimeFormat
) {
  const drafts = divisions.flatMap((division, index) => {
    const existing = sessions.find(
      (session) => session.divisionId === division.id
    );
    if (!(existing || division.venueId || division.startAt || division.endAt))
      return [];
    const startAt = parseEditionDateTime(division.startAt ?? "", formatter);
    const endAt = parseEditionDateTime(division.endAt ?? "", formatter);
    const changed =
      !existing ||
      existing.venueId !== division.venueId ||
      existing.startAt !== startAt ||
      existing.endAt !== endAt;
    return [
      {
        index,
        changed,
        divisionId: division.id,
        existing,
        id: existing?.id ?? division.id,
        venueId: division.venueId ?? "",
        startAt,
        endAt,
        // Changed cancelled Sessions follow the same validation as updateSession.
        cancelledAt: changed ? null : existing.cancelledAt,
      },
    ];
  });
  return {
    drafts,
    finalSchedule: [
      ...sessions.filter(
        (session) =>
          !drafts.some((draft) => draft.divisionId === session.divisionId)
      ),
      ...drafts,
    ],
  };
}
