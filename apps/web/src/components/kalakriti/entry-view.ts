import type {
  KalakritiEntryRow,
  KalakritiEntrySession,
  KalakritiEntryStudent,
} from "./entry-form-dialog";

interface EntryDivisionSource {
  ageCategory?: KalakritiEntrySession["ageCategory"];
  ageCategoryId: string;
  capacity: number;
  competition?: Omit<KalakritiEntrySession["competition"], "category"> & {
    category?: KalakritiEntrySession["competition"]["category"];
  };
  entries: readonly { id: string }[];
  id: string;
  sessions: readonly {
    cancelledAt: number | null;
    endAt: number;
    startAt: number;
    venue?: KalakritiEntrySession["venue"];
  }[];
}

interface EntrySource {
  divisionId: string;
  id: string;
  members: readonly {
    student?: Omit<KalakritiEntryStudent, "ageCategory"> & {
      ageCategory?: KalakritiEntryStudent["ageCategory"];
    };
    studentId: string;
  }[];
  participationMode: "group" | "individual";
}

export function buildKalakritiEntrySessions(
  divisions: readonly EntryDivisionSource[]
): KalakritiEntrySession[] {
  return divisions.flatMap((division) => {
    const { ageCategory, competition } = division;
    const schedule = division.sessions.find(
      (candidate) => candidate.cancelledAt === null && candidate.venue
    );
    const category = competition?.category;
    const venue = schedule?.venue;
    if (!(ageCategory && competition && category && schedule && venue)) {
      return [];
    }
    return [
      {
        ageCategory,
        ageCategoryId: division.ageCategoryId,
        capacity: division.capacity,
        competition: { ...competition, category },
        endAt: schedule.endAt,
        entries: division.entries,
        id: division.id,
        startAt: schedule.startAt,
        venue,
      },
    ];
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
    const session = sessionByDivisionId.get(entry.divisionId);
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
            participationMode: entry.participationMode,
            session,
            sessionId: entry.divisionId,
          },
        ]
      : [];
  });
}
