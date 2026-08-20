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
    cancelledAt: number | null;
    endAt: number;
    startAt: number;
    venue?: KalakritiEntrySession["venue"];
  }[];
}

interface EntrySource {
  division?: EntryDivisionSource;
  divisionId: string;
  id: string;
  members: readonly {
    student?: Omit<KalakritiEntryStudent, "ageCategory"> & {
      ageCategory?: KalakritiEntryStudent["ageCategory"];
    };
    studentId: string;
  }[];
  musicFileName?: string | null;
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
            id: entry.id,
            members,
            musicFileName: entry.musicFileName ?? null,
            participationMode: entry.participationMode,
            session,
            sessionId: entry.divisionId,
          },
        ]
      : [];
  });
}
