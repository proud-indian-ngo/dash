import type {
  KalakritiEntryRow,
  KalakritiEntrySession,
  KalakritiEntryStudent,
} from "./entry-form-dialog";

interface EntryDivisionSource {
  ageCategory?: KalakritiEntrySession["ageCategory"];
  ageCategoryId: string;
  competition?: Omit<KalakritiEntrySession["competition"], "category"> & {
    category?: KalakritiEntrySession["competition"]["category"];
  };
  id: string;
  sessions: readonly {
    id?: string;
    cancelledAt: number | null;
    endAt: number;
    startAt: number;
    venue?: KalakritiEntrySession["venue"];
  }[];
}

interface EntrySource {
  centerId?: string;
  center?: KalakritiEntryRow["center"];
  division?: EntryDivisionSource;
  divisionId: string;
  id: string;
  members: readonly {
    student?: Omit<KalakritiEntryStudent, "ageCategory"> & {
      ageCategory?: KalakritiEntryStudent["ageCategory"];
    };
    studentId: string;
  }[];
  musicFiles?: readonly { id: string; fileName: string }[];
  participationMode: "group" | "individual";
}

function buildKalakritiEntrySession(
  division: EntryDivisionSource,
  includeCancelled: boolean
): KalakritiEntrySession | null {
  const { ageCategory, competition } = division;
  const schedule = division.sessions.find(
    (candidate) =>
      (includeCancelled || candidate.cancelledAt === null) && candidate.venue
  );
  const category = competition?.category;
  const venue = schedule?.venue;
  if (!(ageCategory && competition && category && schedule && venue)) {
    return null;
  }
  return {
    competitionSessionId: schedule.id,
    ageCategory,
    ageCategoryId: division.ageCategoryId,
    competition: {
      ...competition,
      category,
      musicUploadEnabled: competition.musicUploadEnabled === true,
    },
    endAt: schedule.endAt,
    id: division.id,
    scheduleActive: schedule.cancelledAt === null,
    startAt: schedule.startAt,
    venue,
  };
}

export function buildKalakritiEntrySessions(
  divisions: readonly EntryDivisionSource[]
): KalakritiEntrySession[] {
  return divisions.flatMap((division) => {
    const session = buildKalakritiEntrySession(division, false);
    return session ? [session] : [];
  });
}

export function buildKalakritiEntryRows(
  entries: readonly EntrySource[],
  sessions: readonly KalakritiEntrySession[]
): KalakritiEntryRow[] {
  const sessionByDivisionId = new Map(
    sessions.map((session) => [session.id, session])
  );
  return entries.flatMap((entry) => {
    const session =
      sessionByDivisionId.get(entry.divisionId) ??
      (entry.division
        ? buildKalakritiEntrySession(entry.division, true)
        : null);
    const members = entry.members.flatMap((member) =>
      member.student?.ageCategory
        ? [
            {
              student: {
                ...member.student,
                ageCategory: member.student.ageCategory,
              },
              studentId: member.studentId,
            },
          ]
        : []
    );
    return session && members.length === entry.members.length
      ? [
          {
            centerId: entry.centerId,
            center: entry.center,
            id: entry.id,
            members,
            musicFiles: entry.musicFiles ?? [],
            participationMode: entry.participationMode,
            session,
            sessionId: entry.divisionId,
          },
        ]
      : [];
  });
}
