import { describe, expect, it } from "vitest";
import {
  canAccessKalakritiEntries,
  canRemoveKalakritiEntries,
  getEntryRegistrationAvailability,
  getGroupEntryValidationErrors,
  getIndividualEntryValidationError,
  selectKalakritiEntryCenters,
} from "./kalakriti-entry-policy";

const noAccess = { isGlobalAdmin: false, membership: null };

describe("Kalakriti Entry policy", () => {
  it("allows only global admins and assigned registration roles", () => {
    expect(canAccessKalakritiEntries(noAccess)).toBe(false);
    expect(
      canAccessKalakritiEntries({
        isGlobalAdmin: false,
        membership: {
          assignments: [],
          kind: "volunteer",
          responsibilities: ["transport_coordinator"],
        },
      })
    ).toBe(false);
    expect(
      canAccessKalakritiEntries({
        isGlobalAdmin: false,
        membership: {
          assignments: [],
          kind: "guardian",
          responsibilities: [],
        },
      })
    ).toBe(true);
  });

  it.each([
    [
      "group Session",
      { participationMode: "group" },
      {},
      [],
      "Choose an individual Competition Session",
    ],
    [
      "wrong Age Category",
      {},
      { ageCategoryId: "age-2" },
      [],
      "This Session is for Junior",
    ],
    [
      "gender restriction",
      { genderEligibility: "male" },
      {},
      [],
      "This Competition is limited to male Students",
    ],
    [
      "full Session",
      {},
      {},
      [],
      "This Session is full. Choose another Session.",
      [{ id: "taken" }],
    ],
    [
      "duplicate Session",
      {},
      {},
      [{ categoryId: "category-1", endAt: 90, sessionId: "session-1" }],
      "This Student is already registered for this Session",
    ],
    [
      "total limit",
      {},
      { maxTotalCompetitions: 1 },
      [{ categoryId: "category-2", endAt: 90, sessionId: "session-2" }],
      "This Student has reached the total Competition limit",
    ],
    [
      "category limit",
      {},
      { maxCompetitionsPerCategory: 1 },
      [{ categoryId: "category-1", endAt: 90, sessionId: "session-2" }],
      "This Student has reached the Art limit",
    ],
    [
      "schedule overlap",
      {},
      {},
      [{ categoryId: "category-2", endAt: 150, sessionId: "session-2" }],
      "This Session overlaps another Entry for this Student",
    ],
  ])(
    "returns an actionable message for a %s",
    (_case, competitionOverrides, studentOverrides, existingEntries, expected, sessionEntries = []) => {
      const student = {
        ageCategory: {
          maxCompetitionsPerCategory: 2,
          maxTotalCompetitions: 3,
          ...studentOverrides,
        },
        ageCategoryId:
          "ageCategoryId" in studentOverrides
            ? String(studentOverrides.ageCategoryId)
            : "age-1",
        gender: "female" as const,
        id: "student-1",
      };
      const session = {
        ageCategory: { name: "Junior" },
        ageCategoryId: "age-1",
        capacity: 1,
        competition: {
          category: { name: "Art" },
          competitionCategoryId: "category-1",
          genderEligibility: "both" as "both" | "female" | "male",
          maximumGroupSize: 1,
          minimumGroupSize: 1,
          participationMode: "individual" as "group" | "individual",
          ...competitionOverrides,
        } as Parameters<
          typeof getIndividualEntryValidationError
        >[0]["session"]["competition"],
        endAt: 200,
        entries: sessionEntries,
        id: "session-1",
        startAt: 100,
      };
      const entries = existingEntries.map((entry, index) => ({
        members: [{ studentId: student.id }],
        session: {
          ...session,
          competition: {
            ...session.competition,
            competitionCategoryId: entry.categoryId,
          },
          endAt: entry.endAt,
          entries: [],
          id: `existing-session-${index}`,
          startAt: entry.endAt - 50,
        },
        sessionId: entry.sessionId,
      }));

      expect(
        getIndividualEntryValidationError({ entries, session, student })
      ).toBe(expected);
    }
  );

  it("returns member-specific group validation errors", () => {
    const session = {
      ageCategory: { name: "Junior" },
      ageCategoryId: "age-1",
      capacity: 2,
      competition: {
        category: { name: "Art" },
        competitionCategoryId: "category-1",
        genderEligibility: "female" as const,
        maximumGroupSize: 3,
        minimumGroupSize: 2,
        participationMode: "group" as const,
      },
      endAt: 200,
      entries: [] as { id: string }[],
      id: "session-1",
      startAt: 100,
    };
    const student = {
      ageCategory: {
        maxCompetitionsPerCategory: 2,
        maxTotalCompetitions: 3,
      },
      ageCategoryId: "age-1",
      gender: "female" as const,
      humanId: "KAL-2027-0001",
      id: "student-1",
      name: "Ananya Rao",
    };

    expect(
      getGroupEntryValidationErrors({
        entries: [],
        session,
        students: [student],
      })
    ).toEqual(["Select at least 2 Students for this group"]);
    expect(
      getGroupEntryValidationErrors({
        entries: [],
        session,
        students: [student, { ...student, gender: "male", id: "student-2" }],
      })
    ).toEqual([
      "KAL-2027-0001 · Ananya Rao: This Competition is limited to female Students",
    ]);
  });

  it("excludes the edited group from capacity and Student limits", () => {
    const student = {
      ageCategory: {
        maxCompetitionsPerCategory: 1,
        maxTotalCompetitions: 1,
      },
      ageCategoryId: "age-1",
      gender: "female" as const,
      humanId: "KAL-2027-0001",
      id: "student-1",
      name: "Ananya Rao",
    };
    const session = {
      ageCategory: { name: "Junior" },
      ageCategoryId: "age-1",
      capacity: 1,
      competition: {
        category: { name: "Art" },
        competitionCategoryId: "category-1",
        genderEligibility: "both" as const,
        maximumGroupSize: 2,
        minimumGroupSize: 2,
        participationMode: "group" as const,
      },
      endAt: 200,
      entries: [{ id: "entry-1" }],
      id: "session-1",
      startAt: 100,
    };
    const entry = {
      id: "entry-1",
      members: [{ studentId: student.id }],
      session,
      sessionId: session.id,
    };

    expect(
      getGroupEntryValidationErrors({
        editingEntryId: entry.id,
        entries: [entry],
        session,
        students: [student, { ...student, id: "student-2" }],
      })
    ).toEqual([]);
  });

  it("limits a Liaison to explicitly assigned Centers", () => {
    const centers = [{ id: "center-1" }, { id: "center-2" }];
    expect(
      selectKalakritiEntryCenters(centers, {
        isGlobalAdmin: false,
        membership: {
          assignments: [
            { centerId: "center-2", responsibility: "liaison" },
            {
              centerId: "center-1",
              responsibility: "transport_coordinator",
            },
          ],
          kind: "volunteer",
          responsibilities: ["liaison", "transport_coordinator"],
        },
      })
    ).toEqual([{ id: "center-2" }]);
  });

  it("distinguishes closed and incomplete registration states", () => {
    const base = {
      centerEnabled: true,
      lifecycle: "registration_open",
      referenceDataLoading: false,
      sessionCount: 1,
      studentCount: 1,
    };
    expect(getEntryRegistrationAvailability(base)).toBe("open");
    expect(
      getEntryRegistrationAvailability({ ...base, centerEnabled: false })
    ).toBe("center_closed");
    expect(
      getEntryRegistrationAvailability({ ...base, lifecycle: "draft" })
    ).toBe("edition_closed");
    expect(getEntryRegistrationAvailability({ ...base, studentCount: 0 })).toBe(
      "missing_students"
    );
    expect(getEntryRegistrationAvailability({ ...base, sessionCount: 0 })).toBe(
      "missing_sessions"
    );
    expect(
      canRemoveKalakritiEntries({
        centerEnabled: true,
        lifecycle: "registration_open",
      })
    ).toBe(true);
    expect(
      canRemoveKalakritiEntries({
        centerEnabled: false,
        lifecycle: "registration_open",
      })
    ).toBe(false);
  });
});
