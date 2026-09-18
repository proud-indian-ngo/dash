import { describe, expect, it } from "vitest";

import {
  compareKalakritiPerformanceOrder,
  getKalakritiEntryNextSlot,
  indexKalakritiNextSlotsByStudent,
  pickSoonestKalakritiNextSlot,
} from "./kalakriti-performance-order";

const painting = {
  competitionName: "Painting",
  startAt: 200,
  studentId: "a",
  venueName: "Hall C",
};
const singing = {
  competitionName: "Solo Song",
  startAt: 300,
  studentId: "a",
  venueName: "Auditorium",
};

describe("Kalakriti performance order", () => {
  it("picks the earliest later Session and ignores earlier ones", () => {
    expect(
      pickSoonestKalakritiNextSlot(200, [
        { ...singing, startAt: 100 },
        painting,
        singing,
      ])
    ).toEqual(painting);
    expect(
      pickSoonestKalakritiNextSlot(200, [{ ...singing, startAt: 100 }])
    ).toBe(null);
  });

  it("marks back-to-back Sessions as immediate and later Sessions as later", () => {
    const members = [{ studentId: "a", name: "Asha" }];
    expect(
      getKalakritiEntryNextSlot({
        currentEndAt: 200,
        members,
        slotsByStudent: new Map([["a", painting]]),
      })
    ).toEqual({
      competitionName: "Painting",
      kind: "immediate",
      memberCount: 1,
      startAt: 200,
      studentName: "Asha",
      venueName: "Hall C",
    });
    expect(
      getKalakritiEntryNextSlot({
        currentEndAt: 200,
        members,
        slotsByStudent: new Map([["a", singing]]),
      }).kind
    ).toBe("later");
    expect(
      getKalakritiEntryNextSlot({
        currentEndAt: 200,
        members,
        slotsByStudent: new Map(),
      }).kind
    ).toBe("none");
  });

  it("uses the soonest group member and counts distinct members with a next slot", () => {
    const slot = getKalakritiEntryNextSlot({
      currentEndAt: 200,
      members: [
        { studentId: "b", name: "Bina" },
        { studentId: "a", name: "Asha" },
        { studentId: "a", name: "Asha" },
        { studentId: "c", name: "Chetan" },
      ],
      slotsByStudent: new Map([
        ["b", singing],
        ["a", painting],
      ]),
    });
    expect(slot).toEqual({
      competitionName: "Painting",
      kind: "immediate",
      memberCount: 2,
      startAt: 200,
      studentName: "Asha",
      venueName: "Hall C",
    });
  });

  it("sorts soonest next slots first and keeps none last with a stable name", () => {
    const rows = [
      { centerName: "Beta", nextStartAt: null, sortName: "Zara" },
      { centerName: "Alpha", nextStartAt: 300, sortName: "Dev" },
      { centerName: "Alpha", nextStartAt: 200, sortName: "Bina" },
      { centerName: "Alpha", nextStartAt: 200, sortName: "Asha" },
      { centerName: "Beta", nextStartAt: null, sortName: "Asha" },
    ];
    expect(
      [...rows]
        .sort(compareKalakritiPerformanceOrder)
        .map((row) => row.sortName)
    ).toEqual(["Asha", "Bina", "Dev", "Asha", "Zara"]);
  });

  it("indexes the soonest slot per Student", () => {
    expect(
      indexKalakritiNextSlotsByStudent([
        singing,
        painting,
        { ...painting, studentId: "b", startAt: 400 },
      ]).get("a")
    ).toEqual(painting);
  });
});
