import { describe, expect, it } from "vitest";

import {
  isValidVolunteerHourValue,
  type OutcomeGroupRow,
  parseVolunteerHourValue,
  summarizeOutcomes,
  unsavedSessionRows,
} from "./outcomes";
import { expandSeries, seriesStartDate } from "./rrule-expand";

const row = (overrides: Partial<OutcomeGroupRow>): OutcomeGroupRow => ({
  children: 0,
  events: 1,
  programmeId: "edu",
  programmeName: "Education",
  teamId: "t1",
  teamName: "Iblur",
  volunteerSeconds: 0,
  withoutAttendance: 0,
  withoutEndTime: 0,
  withoutRecap: 0,
  ...overrides,
});

describe("summarizeOutcomes", () => {
  const rows = [
    row({ children: 12, events: 3, volunteerSeconds: 6 * 3600 }),
    row({
      children: 5,
      teamId: "t2",
      teamName: "Koramangala",
      volunteerSeconds: 1800,
      withoutRecap: 1,
    }),
    row({
      children: 4,
      events: 2,
      programmeId: "arts",
      programmeName: "Arts",
      volunteerSeconds: 3600,
      withoutAttendance: 2,
      withoutEndTime: 1,
    }),
  ];

  it("rolls rows up into totals, programmes and teams", () => {
    const summary = summarizeOutcomes(rows, 200_00);
    expect(summary.totals).toEqual({
      children: 21,
      events: 6,
      key: "total",
      name: "Total",
      valuePaise: 1500_00,
      volunteerHours: 7.5,
      withoutAttendance: 2,
      withoutEndTime: 1,
      withoutRecap: 1,
    });
    expect(
      summary.byProgramme.map((l) => [l.key, l.events, l.children])
    ).toEqual([
      ["edu", 4, 17],
      ["arts", 2, 4],
    ]);
    expect(
      summary.byTeam.map((l) => [l.key, l.events, l.volunteerHours])
    ).toEqual([
      ["t1", 5, 7],
      ["t2", 1, 0.5],
    ]);
  });

  it("leaves value empty without an hourly value", () => {
    const summary = summarizeOutcomes(rows, null);
    expect(summary.totals.valuePaise).toBeNull();
    expect(summary.byProgramme.every((l) => l.valuePaise === null)).toBe(true);
  });

  it("values unrounded time so a 20-minute session is not lost", () => {
    const summary = summarizeOutcomes(
      [row({ volunteerSeconds: 1200 })],
      300_00
    );
    expect(summary.totals.valuePaise).toBe(100_00);
    expect(summary.totals.volunteerHours).toBe(0.3);
  });

  it("returns zero totals for no events", () => {
    expect(summarizeOutcomes([], 100).totals).toMatchObject({
      children: 0,
      events: 0,
      valuePaise: 0,
      volunteerHours: 0,
    });
  });
});

describe("volunteer hour value", () => {
  it("accepts whole paise from 1 to ₹1,00,000", () => {
    expect(isValidVolunteerHourValue("1")).toBe(true);
    expect(isValidVolunteerHourValue("10000000")).toBe(true);
    expect(isValidVolunteerHourValue("10000001")).toBe(false);
    expect(isValidVolunteerHourValue("0")).toBe(false);
    expect(isValidVolunteerHourValue("12.5")).toBe(false);
  });

  it("parses a missing or invalid value as not set", () => {
    expect(parseVolunteerHourValue(undefined)).toBeNull();
    expect(parseVolunteerHourValue("abc")).toBeNull();
    expect(parseVolunteerHourValue("25000")).toBe(25_000);
  });
});

describe("unsavedSessionRows", () => {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  // Weekly from Saturday 5 September 2026, 10:00 IST, two hours.
  const start = Date.UTC(2026, 8, 5, 4, 30);
  const parent = {
    endTime: start + 2 * HOUR,
    programmeId: "edu",
    programmeName: "Education",
    recurrenceRule: { exdates: ["2026-09-26"], rrule: "FREQ=WEEKLY" },
    savedDates: ["2026-09-12"],
    startTime: start,
    teamId: "t1",
    teamName: "Iblur",
  };
  // Saturday 3 October, 11:00 IST: that day's session is under way.
  const now = Date.UTC(2026, 9, 3, 5, 30);

  it("counts past sessions nobody saved as held without recap or attendance", () => {
    // 5 Sep is the parent itself, 12 Sep is saved, 26 Sep is excluded and
    // 3 Oct hasn't ended: 19 Sep is the only unsaved session held.
    expect(unsavedSessionRows([parent], { from: null, to: null }, now)).toEqual(
      [
        {
          children: 0,
          events: 1,
          programmeId: "edu",
          programmeName: "Education",
          teamId: "t1",
          teamName: "Iblur",
          volunteerSeconds: 0,
          withoutAttendance: 1,
          withoutEndTime: 0,
          withoutRecap: 1,
        },
      ]
    );
  });

  it("keeps to the range and counts no-end-time sessions", () => {
    const rows = unsavedSessionRows(
      [{ ...parent, endTime: null, recurrenceRule: { rrule: "FREQ=WEEKLY" } }],
      { from: start + 10 * DAY, to: start + 30 * DAY },
      now
    );
    // 19 Sep, 26 Sep and 3 Oct (started, no end time) fall in the range.
    expect(rows[0]).toMatchObject({ events: 3, withoutEndTime: 3 });
  });

  it("counts nothing for a series that starts after the range", () => {
    expect(
      unsavedSessionRows([parent], { from: null, to: start - DAY }, now)
    ).toEqual([]);
  });
});

describe("unsavedSessionRows on long-running series", () => {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const start = Date.UTC(2021, 0, 2, 23, 30);
  const now = Date.UTC(2026, 9, 18, 6);
  const range = { from: now - 30 * DAY, to: now };

  it.each([
    "FREQ=WEEKLY",
    "FREQ=WEEKLY;INTERVAL=2;BYDAY=SA,SU",
    "FREQ=WEEKLY;INTERVAL=3;BYDAY=MO,TH",
    "FREQ=DAILY;INTERVAL=3",
    "FREQ=MONTHLY;BYDAY=1SA",
    "FREQ=WEEKLY;COUNT=400",
  ])("counts the same sessions as expanding %s from its start", (rrule) => {
    const rule = { exdates: ["2026-10-10"], rrule };
    const expected = expandSeries(
      rule,
      start,
      start + 2 * HOUR,
      range.from,
      range.to,
      new Set([seriesStartDate(start)])
    ).filter((occ) => (occ.endTime ?? occ.startTime) <= now).length;
    const rows = unsavedSessionRows(
      [
        {
          endTime: start + 2 * HOUR,
          programmeId: "p",
          programmeName: "P",
          recurrenceRule: rule,
          savedDates: [],
          startTime: start,
          teamId: "t",
          teamName: "T",
        },
      ],
      range,
      now
    );
    expect(rows[0]?.events ?? 0).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it("skips a series whose rule ended before the range", () => {
    const rows = unsavedSessionRows(
      [
        {
          endTime: null,
          programmeId: "p",
          programmeName: "P",
          recurrenceRule: { rrule: "FREQ=WEEKLY;UNTIL=20250101T235959Z" },
          savedDates: [],
          startTime: start,
          teamId: "t",
          teamName: "T",
        },
      ],
      range,
      now
    );
    expect(rows).toEqual([]);
  });
});
