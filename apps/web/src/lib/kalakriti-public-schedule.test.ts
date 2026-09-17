import { describe, expect, it } from "bun:test";

import {
  filterKalakritiPublicSchedule,
  type KalakritiPublicSchedule,
} from "./kalakriti-public-schedule";

describe("public schedule filters", () => {
  const sessions: KalakritiPublicSchedule["sessions"] = [
    {
      ageCategory: "Junior",
      category: "Art",
      competition: "Drawing",
      endAt: 2,
      startAt: 1,
      status: "scheduled",
      venue: "Hall A",
    },
    {
      ageCategory: "Senior",
      category: "Music",
      competition: "Singing",
      endAt: 4,
      startAt: 3,
      status: "cancelled",
      venue: "Hall B",
    },
  ];

  it("combines venue, age and category without changing chronological order", () => {
    expect(
      filterKalakritiPublicSchedule(sessions, {
        ageCategory: "Senior",
        category: "Music",
        venue: "Hall B",
      }).map((session) => session.competition)
    ).toEqual(["Singing"]);
    expect(
      filterKalakritiPublicSchedule(sessions, {
        ageCategory: "",
        category: "",
        venue: "",
      })
    ).toEqual(sessions);
  });
});
