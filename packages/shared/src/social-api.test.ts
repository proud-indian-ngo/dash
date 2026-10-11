import { describe, expect, it } from "vitest";

import {
  applyAllTimeOverrides,
  parseVirtualSocialEventId,
  buildSocialEvents,
  formatSocialDigest,
  parseSocialEventsWindow,
  parseSocialStatsMonth,
  sessionHours,
  SocialApiQueryError,
  type SocialEventFacts,
  summarizeSocialSessions,
  type SocialEventSourceRow,
  toIndiaTime,
} from "./social-api";

const BASE_URL = "https://dash.proudindian.ngo";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Saturday 3 October 2026, 10:00 in India.
const SAT = Date.UTC(2026, 9, 3, 4, 30);
const WINDOW = parseSocialEventsWindow(
  new URLSearchParams({ from: "2026-10-01", to: "2026-10-31" })
);

const SERIES_ID = "019a0000-0000-7000-8000-00000000000a";

function row(overrides: Partial<SocialEventSourceRow>): SocialEventSourceRow {
  return {
    cancelledAt: null,
    childrenAttended: null,
    city: "bangalore",
    description: "Weekly spoken English.",
    endTime: SAT + 2 * HOUR,
    id: "019a0000-0000-7000-8000-000000000001",
    isPublic: true,
    managementDomain: null,
    name: "Spoken English Class",
    originalDate: null,
    publicArea: "Bellandur",
    recurrenceRule: null,
    seriesId: null,
    socialCompletedAt: null,
    socialNotes: null,
    startTime: SAT,
    teamName: "Teach",
    volunteersNeeded: null,
    ...overrides,
  };
}

function facts(overrides: Partial<SocialEventFacts>): SocialEventFacts {
  return {
    approvedInterests: 0,
    approvedPhotos: 0,
    partners: [],
    pendingInterests: 0,
    presentVolunteers: 0,
    ...overrides,
  };
}

const series = (overrides: Partial<SocialEventSourceRow> = {}) =>
  row({
    id: SERIES_ID,
    recurrenceRule: { rrule: "FREQ=WEEKLY" },
    ...overrides,
  });

describe("parseSocialEventsWindow", () => {
  it("spans whole India days, inclusive, and accepts past dates", () => {
    expect(
      parseSocialEventsWindow(
        new URLSearchParams({ from: "2020-01-01", to: "2020-01-02" })
      )
    ).toEqual({
      from: Date.parse("2020-01-01T00:00:00+05:30"),
      to: Date.parse("2020-01-03T00:00:00+05:30") - 1,
    });
  });

  it.each([
    [{}, "from must be a date"],
    [{ from: "2026-10-01" }, "to must be a date"],
    [{ from: "2026-10-1", to: "2026-10-02" }, "from must be a date"],
    [{ from: "2026-02-30", to: "2026-03-02" }, "from must be a date"],
    [{ from: "2026-13-01", to: "2026-12-02" }, "from must be a date"],
    [{ from: "2026-10-01", to: "2026-10-32" }, "to must be a date"],
    [{ from: "2026-00-10", to: "2026-10-02" }, "from must be a date"],
    [{ from: "2026-10-05", to: "2026-10-04" }, "to must not be before from"],
    [{ from: "2026-01-01", to: "2026-05-02" }, "at most 120 days"],
    // 121 days counting both ends.
    [
      { from: "2026-01-01", to: "2026-05-01" },
      "at most 120 days, counting from and to inclusively",
    ],
  ])("rejects %o", (params, message) => {
    expect(() =>
      parseSocialEventsWindow(new URLSearchParams(params))
    ).toThrowError(new RegExp(message));
    expect(() => parseSocialEventsWindow(new URLSearchParams(params))).toThrow(
      SocialApiQueryError
    );
  });

  it("accepts exactly 120 days counting both ends", () => {
    expect(() =>
      parseSocialEventsWindow(
        new URLSearchParams({ from: "2026-01-01", to: "2026-04-30" })
      )
    ).not.toThrow();
  });
});

describe("parseSocialStatsMonth", () => {
  it("returns India-time month bounds, rolling over December", () => {
    expect(
      parseSocialStatsMonth(new URLSearchParams({ month: "2026-12" }))
    ).toEqual({
      from: Date.parse("2026-12-01T00:00:00+05:30"),
      month: "2026-12",
      to: Date.parse("2027-01-01T00:00:00+05:30") - 1,
    });
  });

  it.each(["", "2026-13", "2026-1", "2026-00", "202610", "2026-10-01"])(
    "rejects %o",
    (month) => {
      expect(() =>
        parseSocialStatsMonth(new URLSearchParams({ month }))
      ).toThrow(SocialApiQueryError);
    }
  );
});

describe("buildSocialEvents", () => {
  it("returns the consumer shape for a scheduled standalone event", () => {
    const [event] = buildSocialEvents(
      [row({ volunteersNeeded: 8 })],
      WINDOW,
      BASE_URL,
      new Map([
        [
          "019a0000-0000-7000-8000-000000000001",
          facts({
            approvedInterests: 5,
            partners: [{ instagram: "@nss", linkedin: null, name: "NSS" }],
            pendingInterests: 1,
          }),
        ],
      ])
    );

    expect(event).toEqual({
      area: "Bellandur, Bengaluru",
      attendance: null,
      city: "bangalore",
      endTime: "12:00",
      id: "019a0000-0000-7000-8000-000000000001",
      name: "Spoken English Class",
      occurrenceDate: "2026-10-03",
      partners: [{ instagram: "@nss", linkedin: null, name: "NSS" }],
      photos: { consentCleared: false, count: null },
      programme: "education",
      signUpUrl:
        "https://dash.proudindian.ngo/register?interestEventId=019a0000-0000-7000-8000-000000000001",
      socialNotes: null,
      startTime: "10:00",
      status: "scheduled",
      summary: "Weekly spoken English.",
      team: "Teach",
      venue: { instagram: null, name: "Bellandur" },
      volunteers: { approved: 5, needed: 8, waitlisted: 1 },
    });
  });

  it("includes both cities, past dates and cancelled events, but not private or Kalakriti ones", () => {
    const events = buildSocialEvents(
      [
        row({ city: "mumbai", id: "mumbai" }),
        row({ cancelledAt: SAT - DAY, id: "cancelled" }),
        row({ id: "private", isPublic: false }),
        row({ id: "kalakriti", managementDomain: "kalakriti" }),
        row({ id: "outside", startTime: SAT + 40 * DAY }),
      ],
      WINDOW,
      BASE_URL,
      new Map()
    );

    expect(events.map((e) => [e.id, e.status])).toEqual([
      ["cancelled", "cancelled"],
      ["mumbai", "scheduled"],
    ]);
  });

  it("reports completed occurrences with attendance, photos and notes", () => {
    const [event] = buildSocialEvents(
      [
        row({
          childrenAttended: 42,
          endTime: SAT + 2.25 * HOUR,
          socialCompletedAt: SAT + 3 * HOUR,
          socialNotes: "Great turnout.",
        }),
      ],
      WINDOW,
      BASE_URL,
      new Map([
        [
          "019a0000-0000-7000-8000-000000000001",
          facts({ approvedPhotos: 6, presentVolunteers: 7 }),
        ],
      ])
    );

    expect(event?.status).toBe("completed");
    expect(event?.attendance).toEqual({
      children: 42,
      hours: 2.3,
      volunteers: 7,
    });
    expect(event?.photos).toEqual({ consentCleared: false, count: 6 });
    expect(event?.socialNotes).toBe("Great turnout.");
  });

  it("prefers cancelled over completed", () => {
    const [event] = buildSocialEvents(
      [row({ cancelledAt: SAT, socialCompletedAt: SAT })],
      WINDOW,
      BASE_URL,
      new Map()
    );
    expect(event?.status).toBe("cancelled");
  });

  it("expands a series with a distinct id per week, its interests and needed count, and reports exdates as cancelled", () => {
    const events = buildSocialEvents(
      [
        series({
          recurrenceRule: { exdates: ["2026-10-10"], rrule: "FREQ=WEEKLY" },
          socialCompletedAt: SAT,
          volunteersNeeded: 6,
        }),
      ],
      WINDOW,
      BASE_URL,
      new Map([[SERIES_ID, facts({ approvedInterests: 2 })]])
    );

    expect(events.map((e) => [e.occurrenceDate, e.status])).toEqual([
      ["2026-10-03", "scheduled"],
      ["2026-10-10", "cancelled"],
      ["2026-10-17", "scheduled"],
      ["2026-10-24", "scheduled"],
      ["2026-10-31", "scheduled"],
    ]);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    for (const event of events) {
      expect(event.id).toBe(`${SERIES_ID}:${event.occurrenceDate}`);
      // A virtual occurrence has no row of its own, so it is never completed.
      expect(event.attendance).toBeNull();
      expect(event.volunteers).toEqual({
        approved: 2,
        needed: 6,
        waitlisted: 0,
      });
    }
    // Sign-up keeps the register link (series id + occurrence date).
    expect(events[2]?.signUpUrl).toBe(
      `${BASE_URL}/register?interestEventId=${SERIES_ID}&occDate=2026-10-17`
    );
  });

  it("reports exdates of a series in the window as cancelled, but not dates the rule never produces or exception dates", () => {
    const events = buildSocialEvents(
      [
        series({
          recurrenceRule: {
            // 2026-10-11 is a Sunday, never produced by the Saturday rule;
            // 2026-11-07 is outside the window.
            exdates: ["2026-10-11", "2026-10-17", "2026-10-24", "2026-11-07"],
            rrule: "FREQ=WEEKLY",
          },
        }),
        row({
          id: "exc-24",
          originalDate: "2026-10-24",
          seriesId: SERIES_ID,
          startTime: SAT + 21 * DAY,
        }),
      ],
      WINDOW,
      BASE_URL,
      new Map()
    );
    expect(events.map((e) => [e.id, e.status])).toEqual([
      [`${SERIES_ID}:2026-10-03`, "scheduled"],
      [`${SERIES_ID}:2026-10-10`, "scheduled"],
      [`${SERIES_ID}:2026-10-17`, "cancelled"],
      ["exc-24", "scheduled"],
      [`${SERIES_ID}:2026-10-31`, "scheduled"],
    ]);
  });

  it("does not report exdates of a private series", () => {
    expect(
      buildSocialEvents(
        [
          series({
            isPublic: false,
            recurrenceRule: { exdates: ["2026-10-10"], rrule: "FREQ=WEEKLY" },
          }),
        ],
        WINDOW,
        BASE_URL,
        new Map()
      )
    ).toEqual([]);
  });

  it("gives exceptions their own row id and partners, falling back to the series' partners and needed count", () => {
    const parentPartner = {
      instagram: "@ethos",
      linkedin: "ethos",
      name: "Ethos",
    };
    const ownPartner = { instagram: null, linkedin: null, name: "NSS" };
    const events = buildSocialEvents(
      [
        series({ volunteersNeeded: 6 }),
        row({
          id: "exc-own",
          originalDate: "2026-10-10",
          publicArea: null,
          seriesId: SERIES_ID,
          startTime: SAT + 7 * DAY,
        }),
        row({
          id: "exc-inherit",
          originalDate: "2026-10-17",
          seriesId: SERIES_ID,
          startTime: SAT + 14 * DAY,
          volunteersNeeded: 3,
        }),
      ],
      WINDOW,
      BASE_URL,
      new Map([
        [SERIES_ID, facts({ partners: [parentPartner] })],
        ["exc-own", facts({ partners: [ownPartner] })],
      ])
    );
    const byDate = new Map(events.map((e) => [e.occurrenceDate, e]));

    expect(byDate.get("2026-10-03")?.partners).toEqual([parentPartner]);
    expect(byDate.get("2026-10-10")).toMatchObject({
      id: "exc-own",
      partners: [ownPartner],
      venue: { name: "Bellandur" },
      volunteers: { needed: 6 },
    });
    expect(byDate.get("2026-10-17")).toMatchObject({
      id: "exc-inherit",
      partners: [parentPartner],
      volunteers: { needed: 3 },
    });
    expect(events).toHaveLength(5);
  });

  it("marks every occurrence of a cancelled series, and cancelled exceptions, as cancelled", () => {
    const cancelledSeries = buildSocialEvents(
      [series({ cancelledAt: SAT - DAY })],
      WINDOW,
      BASE_URL,
      new Map()
    );
    expect(cancelledSeries).toHaveLength(5);
    expect(new Set(cancelledSeries.map((e) => e.status))).toEqual(
      new Set(["cancelled"])
    );

    const withCancelledException = buildSocialEvents(
      [
        series(),
        row({
          cancelledAt: SAT,
          id: "exc-cancelled",
          originalDate: "2026-10-10",
          seriesId: SERIES_ID,
          startTime: SAT + 7 * DAY,
        }),
      ],
      WINDOW,
      BASE_URL,
      new Map()
    );
    expect(
      withCancelledException
        .filter((e) => e.occurrenceDate === "2026-10-10")
        .map((e) => [e.id, e.status])
    ).toEqual([["exc-cancelled", "cancelled"]]);
  });

  it('falls back to programme "general" when the team name says nothing', () => {
    const [event] = buildSocialEvents(
      [row({ teamName: "Weekend Crew" })],
      WINDOW,
      BASE_URL,
      new Map()
    );
    expect(event?.programme).toBe("general");
  });
});

describe("summarizeSocialSessions", () => {
  const session = (id: string, overrides: Record<string, unknown> = {}) => ({
    cancelledAt: null,
    childrenAttended: 10,
    endTime: SAT + 2 * HOUR,
    id,
    isPublic: true,
    seriesId: null,
    startTime: SAT,
    ...overrides,
  });
  const ethos = { instagram: null, linkedin: "ethos", name: "Ethos" };
  const secret = { instagram: null, linkedin: null, name: "Private Partner" };
  const nss = { instagram: null, linkedin: null, name: "NSS" };

  it("drops cancelled rows and keeps private sessions in the totals but not their partners", () => {
    const summary = summarizeSocialSessions(
      [
        session("public"),
        session("private", { childrenAttended: 5, isPublic: false }),
        session("cancelled", { cancelledAt: SAT, childrenAttended: 99 }),
        session("exception", { childrenAttended: 1, seriesId: "series" }),
      ],
      new Map([
        ["public", [ethos]],
        ["private", [secret]],
        ["cancelled", [nss]],
        ["series", [{ ...ethos, name: " ethos " }, nss]],
      ])
    );
    expect(summary).toEqual({
      children: 16,
      hours: 6,
      partners: [ethos, nss],
      sessionIds: ["public", "private", "exception"],
      sessions: 3,
    });
  });
});

describe("helpers", () => {
  it("parses composite virtual occurrence ids and leaves row ids alone", () => {
    expect(parseVirtualSocialEventId(`${SERIES_ID}:2026-10-10`)).toEqual({
      occDate: "2026-10-10",
      seriesId: SERIES_ID,
    });
    expect(parseVirtualSocialEventId(SERIES_ID)).toBeNull();
    expect(parseVirtualSocialEventId(":2026-10-10")).toBeNull();
    expect(parseVirtualSocialEventId(`${SERIES_ID}:soon`)).toBeNull();
  });

  it("formats India times as HH:mm", () => {
    expect(toIndiaTime(Date.UTC(2026, 9, 3, 18, 45))).toBe("00:15");
    expect(toIndiaTime(SAT)).toBe("10:00");
  });

  it("rounds session hours to one decimal and counts open-ended sessions as zero", () => {
    expect(sessionHours(0, 90 * 60 * 1000)).toBe(1.5);
    expect(sessionHours(0, 100 * 60 * 1000)).toBe(1.7);
    expect(sessionHours(0, null)).toBe(0);
  });

  it("applies numeric all-time overrides and ignores invalid ones", () => {
    expect(
      applyAllTimeOverrides(
        { hours: 10, optimists: 20, reached: 30 },
        new Map([
          ["social_all_time_optimists", "3600"],
          ["social_all_time_hours", "not a number"],
          ["social_all_time_reached", "-5"],
        ])
      )
    ).toEqual({ hours: 10, optimists: 3600, reached: 30 });
  });

  it("formats the digest", () => {
    expect(formatSocialDigest(["a", "b"])).toBe("Social digest\n\na\nb");
  });
});
