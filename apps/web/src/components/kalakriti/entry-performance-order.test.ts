import { describe, expect, it } from "bun:test";

import type { KalakritiEntryRow } from "./entry-form-dialog";
import {
  formatKalakritiNextSlotLabel,
  orderSequentialKalakritiEntries,
} from "./entry-performance-order";

function entry(
  id: string,
  name: string,
  centerName: string
): KalakritiEntryRow {
  return {
    id,
    centerId: centerName,
    center: { id: centerName, name: centerName },
    participationMode: "individual",
    sessionId: "dance",
    members: [
      {
        studentId: id,
        student: {
          id,
          humanId: `KAL-${id}`,
          name,
          ageCategoryId: "age",
          ageCategory: {
            name: "Junior",
            maxCompetitionsPerCategory: 3,
            maxTotalCompetitions: 5,
          },
          gender: "female",
        },
      },
    ],
    musicFiles: [],
    session: {
      id: "dance",
      competitionSessionId: "dance-session",
      ageCategoryId: "age",
      ageCategory: { name: "Junior" },
      competition: {
        id: "dance",
        name: "Solo Dance",
        category: { name: "Stage" },
        competitionCategoryId: "stage",
        genderEligibility: "both",
        maximumGroupSize: 1,
        minimumGroupSize: 1,
        participationMode: "individual",
        sequentialPerformances: true,
      },
      startAt: 100,
      endAt: 200,
      venue: { name: "Hall" },
    },
  };
}

describe("sequential Entry order", () => {
  it("lists the back-to-back Student first", () => {
    const later = entry("later", "Zara", "North");
    const none = entry("none", "Asha", "North");
    const immediate = entry("now", "Bina", "South");
    const { entries, nextByEntryId } = orderSequentialKalakritiEntries(
      [later, none, immediate],
      200,
      [
        {
          competitionName: "Painting",
          startAt: 200,
          studentId: "now",
          venueName: "Hall C",
        },
        {
          competitionName: "Solo Song",
          startAt: 400,
          studentId: "later",
          venueName: "Auditorium",
        },
      ]
    );
    expect(entries.map((row) => row.id)).toEqual(["now", "later", "none"]);
    expect(nextByEntryId.get("now")?.kind).toBe("immediate");
    expect(nextByEntryId.get("later")?.kind).toBe("later");
    expect(nextByEntryId.get("none")?.kind).toBe("none");
  });

  it("labels the soonest next Competition and extra group members", () => {
    expect(
      formatKalakritiNextSlotLabel(
        {
          competitionName: "Painting",
          kind: "immediate",
          memberCount: 2,
          startAt: 200,
          studentName: "Asha",
          venueName: "Hall C",
        },
        "11:00 AM",
        true
      )
    ).toBe("Asha · Painting · 11:00 AM · Hall C · +1 more");
    expect(
      formatKalakritiNextSlotLabel(
        {
          competitionName: null,
          kind: "none",
          memberCount: 0,
          startAt: null,
          studentName: null,
          venueName: null,
        },
        "",
        false
      )
    ).toBe("—");
  });
});
