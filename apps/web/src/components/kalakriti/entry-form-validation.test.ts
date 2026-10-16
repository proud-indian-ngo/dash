import { describe, expect, it } from "bun:test";

import type {
  KalakritiEntryRow,
  KalakritiEntrySession,
  KalakritiEntryStudent,
} from "./entry-form-dialog";
import { getEntryValidationIssues } from "./entry-form-dialog";

const session: KalakritiEntrySession = {
  ageCategory: { name: "Juniors" },
  ageCategoryId: "juniors",
  competition: {
    category: { name: "Dance" },
    competitionCategoryId: "dance",
    genderEligibility: "both",
    id: "solo-dance",
    maximumGroupSize: 1,
    minimumGroupSize: 1,
    name: "Solo Dance",
    participationMode: "individual",
  },
  endAt: 2,
  id: "session-1",
  startAt: 1,
  venue: { name: "Hall A" },
};

const student: KalakritiEntryStudent = {
  ageCategory: {
    maxCompetitionsPerCategory: 2,
    maxTotalCompetitions: 3,
    name: "Seniors",
  },
  ageCategoryId: "seniors",
  gender: "female",
  humanId: "S-1",
  id: "student-1",
  name: "Ananya",
};

const entry: KalakritiEntryRow = {
  id: "entry-1",
  members: [],
  musicFiles: [],
  participationMode: "individual",
  session,
  sessionId: session.id,
};

function issuesFor(
  options: {
    entry?: KalakritiEntryRow;
    fixedSession?: KalakritiEntrySession;
    sessions?: KalakritiEntrySession[];
  } = {}
) {
  return getEntryValidationIssues({
    entries: [],
    entry: options.entry,
    fixedSession: options.fixedSession,
    sessionId: session.id,
    sessions: options.sessions ?? [session],
    studentIds: [student.id],
    studentMap: new Map([[student.id, student]]),
  });
}

describe("getEntryValidationIssues", () => {
  it("puts Session issues on the Session picker when it is shown", () => {
    expect(issuesFor({ sessions: [] })).toEqual([
      { message: "This Session is no longer available", path: "sessionId" },
    ]);
    expect(issuesFor()[0]?.path).toBe("sessionId");
  });

  it("puts Session issues on Students when the Session is fixed", () => {
    expect(issuesFor({ fixedSession: session, sessions: [] })).toEqual([
      { message: "This Session is no longer available", path: "studentIds" },
    ]);
    expect(issuesFor({ fixedSession: session })[0]?.path).toBe("studentIds");
  });

  it("puts Session issues on Students when an Entry is being edited", () => {
    expect(issuesFor({ entry, sessions: [] })).toEqual([
      { message: "This Session is no longer available", path: "studentIds" },
    ]);
    expect(issuesFor({ entry })).toEqual([
      { message: "This Session is for Juniors", path: "studentIds" },
    ]);
  });
});
