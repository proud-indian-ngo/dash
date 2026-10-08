import { describe, expect, it } from "vitest";

import {
  buildPublicEvents,
  buildPublicSignUpUrl,
  type PublicEventSourceRow,
  type PublicEventsQuery,
  parsePublicEventsQuery,
  PublicEventsQueryError,
  toPublicArea,
  toPublicProgramme,
  summarizePublicSession,
  toPublicSummary,
} from "./public-events";

const BASE_URL = "https://dash.proudindian.ngo";
// 2026-10-08T00:00:00Z
const NOW = Date.UTC(2026, 9, 8);
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const QUERY: PublicEventsQuery = {
  city: "bangalore",
  from: NOW,
  limit: 20,
  to: NOW + 30 * DAY,
};

const PUBLIC_EVENT_KEYS = [
  "area",
  "city",
  "endTime",
  "id",
  "name",
  "occurrenceDate",
  "programme",
  "signUpUrl",
  "startTime",
  "summary",
  "team",
];

function row(overrides: Partial<PublicEventSourceRow>): PublicEventSourceRow {
  return {
    cancelledAt: null,
    city: "bangalore",
    description: "Help children with maths.",
    endTime: NOW + 2 * DAY + 2 * HOUR,
    id: "019a0000-0000-7000-8000-000000000001",
    isPublic: true,
    managementDomain: null,
    name: "Maths class",
    originalDate: null,
    publicArea: "Iblur",
    recurrenceRule: null,
    seriesId: null,
    startTime: NOW + 2 * DAY + 4.5 * HOUR,
    teamName: "Education",
    ...overrides,
  };
}

describe("buildPublicEvents", () => {
  it("returns the contract shape for a public, upcoming event", () => {
    const [event] = buildPublicEvents([row({})], QUERY, BASE_URL);

    expect(event).toEqual({
      area: "Iblur, Bengaluru",
      city: "bangalore",
      endTime: "2026-10-10T02:00:00.000Z",
      id: "019a0000-0000-7000-8000-000000000001",
      name: "Maths class",
      occurrenceDate: "2026-10-10",
      programme: "education",
      signUpUrl:
        "https://dash.proudindian.ngo/register?interestEventId=019a0000-0000-7000-8000-000000000001",
      startTime: "2026-10-10T04:30:00.000Z",
      summary: "Help children with maths.",
      team: "Education",
    });
    expect(Object.keys(event ?? {}).sort()).toEqual(PUBLIC_EVENT_KEYS);
  });

  it("excludes private (draft), cancelled, past, out-of-window and Kalakriti events", () => {
    const events = buildPublicEvents(
      [
        row({ id: "kalakriti", managementDomain: "kalakriti" }),
        row({ id: "private", isPublic: false }),
        row({ cancelledAt: NOW - DAY, id: "cancelled" }),
        row({ id: "past", startTime: NOW - HOUR }),
        row({ id: "too-far", startTime: NOW + 31 * DAY }),
        row({ city: "mumbai", id: "other-city" }),
        row({ id: "listed" }),
      ],
      QUERY,
      BASE_URL
    );

    expect(events.map((e) => e.id)).toEqual(["listed"]);
  });

  it("never exposes location, members, creators or other source fields", () => {
    const source = {
      ...row({}),
      createdBy: "user-1",
      location: "https://maps.google.com/?q=12.9,77.6",
      members: [{ email: "a@b.c", phone: "+919999999999" }],
      whatsappGroupId: "wa-1",
    };
    const [event] = buildPublicEvents([source], QUERY, BASE_URL);
    const json = JSON.stringify(event);

    expect(Object.keys(event ?? {}).sort()).toEqual(PUBLIC_EVENT_KEYS);
    expect(json).not.toContain("maps.google.com");
    expect(json).not.toContain("user-1");
    expect(json).not.toContain("+919999999999");
    expect(json).not.toContain("wa-1");
  });

  it("falls back to the city when no public area is set", () => {
    const [event] = buildPublicEvents(
      [row({ publicArea: null })],
      QUERY,
      BASE_URL
    );
    expect(event?.area).toBe("Bengaluru");
  });

  it("sorts by start time and applies the limit", () => {
    const events = buildPublicEvents(
      [
        row({ id: "c", startTime: NOW + 3 * DAY }),
        row({ id: "a", startTime: NOW + DAY }),
        row({ id: "b", startTime: NOW + 2 * DAY }),
      ],
      { ...QUERY, limit: 2 },
      BASE_URL
    );
    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("dates occurrences in India while keeping the series' UTC date key", () => {
    // 01:00 IST on Sat 2026-10-10 is 19:30Z on Fri 2026-10-09.
    const seriesStart = Date.UTC(2026, 8, 4, 19, 30);
    const [event] = buildPublicEvents(
      [
        row({
          endTime: null,
          id: "late-night",
          recurrenceRule: { rrule: "FREQ=WEEKLY;BYDAY=FR" },
          startTime: seriesStart,
        }),
      ],
      QUERY,
      BASE_URL
    );
    expect(event?.occurrenceDate).toBe("2026-10-10");
    expect(event?.signUpUrl).toContain("occDate=2026-10-09");
  });

  it("uses the start time as end time for open-ended events", () => {
    const [event] = buildPublicEvents(
      [row({ endTime: null })],
      QUERY,
      BASE_URL
    );
    expect(event?.endTime).toBe(event?.startTime);
  });

  describe("recurring series", () => {
    // Weekly on Saturdays from 2026-09-05 10:00 IST (a series that already started).
    const seriesStart = Date.UTC(2026, 8, 5, 4, 30);
    const series = row({
      endTime: seriesStart + 2 * HOUR,
      id: "series",
      recurrenceRule: {
        exdates: ["2026-10-17"],
        rrule: "FREQ=WEEKLY;BYDAY=SA",
      },
      startTime: seriesStart,
    });

    it("expands occurrences in the window, applying exdates and exceptions", () => {
      const events = buildPublicEvents(
        [
          series,
          // 10-24 moved to the afternoon with its own area.
          row({
            endTime: Date.UTC(2026, 9, 24, 11),
            id: "moved",
            originalDate: "2026-10-24",
            publicArea: "HSR Layout",
            seriesId: "series",
            startTime: Date.UTC(2026, 9, 24, 9),
          }),
          // 10-31 cancelled.
          row({
            cancelledAt: NOW,
            id: "cancelled-occurrence",
            originalDate: "2026-10-31",
            seriesId: "series",
            startTime: Date.UTC(2026, 9, 31, 4, 30),
          }),
          // 11-07 materialized without its own area: inherits the series'.
          row({
            endTime: Date.UTC(2026, 10, 7, 6, 30),
            id: "materialized",
            originalDate: "2026-11-07",
            publicArea: null,
            seriesId: "series",
            startTime: Date.UTC(2026, 10, 7, 4, 30),
          }),
        ],
        // Through midday on 11-07, so the next virtual Saturday is outside.
        { ...QUERY, to: Date.UTC(2026, 10, 7, 12) },
        BASE_URL
      );

      expect(
        events.map((e) => [e.id, e.occurrenceDate, e.startTime, e.area])
      ).toEqual([
        [
          "series",
          "2026-10-10",
          "2026-10-10T04:30:00.000Z",
          "Iblur, Bengaluru",
        ],
        [
          "moved",
          "2026-10-24",
          "2026-10-24T09:00:00.000Z",
          "HSR Layout, Bengaluru",
        ],
        [
          "materialized",
          "2026-11-07",
          "2026-11-07T04:30:00.000Z",
          "Iblur, Bengaluru",
        ],
      ]);
      expect(events[0]?.signUpUrl).toBe(
        "https://dash.proudindian.ngo/register?interestEventId=series&occDate=2026-10-10"
      );
      expect(events[0]?.endTime).toBe("2026-10-10T06:30:00.000Z");
    });

    it("hides every occurrence of a cancelled or private series", () => {
      const exception = row({
        id: "exception",
        originalDate: "2026-10-24",
        seriesId: "series",
        startTime: Date.UTC(2026, 9, 24, 4, 30),
      });
      expect(
        buildPublicEvents(
          [{ ...series, cancelledAt: NOW }, exception],
          QUERY,
          BASE_URL
        )
      ).toEqual([]);
      expect(
        buildPublicEvents(
          [{ ...series, isPublic: false }, exception],
          QUERY,
          BASE_URL
        )
      ).toEqual([]);
    });
  });
});

describe("parsePublicEventsQuery", () => {
  it("applies the documented defaults", () => {
    expect(parsePublicEventsQuery(new URLSearchParams(), NOW)).toEqual({
      city: "bangalore",
      from: NOW,
      limit: 20,
      to: NOW + 30 * DAY,
    });
  });

  it("clamps days and limit, and never starts in the past", () => {
    const query = parsePublicEventsQuery(
      new URLSearchParams("days=400&limit=500&from=2020-01-01&city=mumbai"),
      NOW
    );
    expect(query).toEqual({
      city: "mumbai",
      from: NOW,
      limit: 50,
      to: NOW + 90 * DAY,
    });
  });

  it("reads a bare date as the start of that day in India", () => {
    const query = parsePublicEventsQuery(
      new URLSearchParams("from=2026-10-18"),
      NOW
    );
    expect(new Date(query.from).toISOString()).toBe("2026-10-17T18:30:00.000Z");
  });

  it.each(["city=delhi", "days=0", "days=abc", "limit=-1", "from=not-a-date"])(
    "rejects %s",
    (params) => {
      expect(() =>
        parsePublicEventsQuery(new URLSearchParams(params), NOW)
      ).toThrow(PublicEventsQueryError);
    }
  );
});

describe("toPublicSummary", () => {
  it("strips markdown, HTML, links and contact details", () => {
    expect(
      toPublicSummary(
        "## Maths day\n\n**Bring** a [notebook](https://x.y/z). <b>Call</b> +91 98765 43210, 98765-43210 or (080) 2345 6789 or mail lead@proudindian.ngo. See https://maps.app.goo.gl/abc"
      )
    ).toBe("Maths day Bring a notebook. Call, or or mail. See");
  });

  it("keeps times, dates and age ranges", () => {
    expect(
      toPublicSummary(
        "Session 10:00 - 12:00 on 18-10-2026, ages 6 - 12 years. Timings 9.30 - 11.30. Batch 2026-27."
      )
    ).toBe(
      "Session 10:00 - 12:00 on 18-10-2026, ages 6 - 12 years. Timings 9.30 - 11.30. Batch 2026-27."
    );
  });

  it("truncates to about 200 characters on a word boundary", () => {
    const summary = toPublicSummary("word ".repeat(100));
    expect(summary.length).toBeLessThanOrEqual(200);
    expect(summary.endsWith("word…")).toBe(true);
  });

  it("returns an empty string without a description", () => {
    expect(toPublicSummary(null)).toBe("");
  });
});

describe("toPublicArea", () => {
  it("does not repeat the city, under either name", () => {
    expect(toPublicArea("Iblur, Bengaluru", "bangalore")).toBe(
      "Iblur, Bengaluru"
    );
    expect(toPublicArea("Iblur, Bangalore", "bangalore")).toBe(
      "Iblur, Bangalore"
    );
    expect(toPublicArea("Dadar, Bombay", "mumbai")).toBe("Dadar, Bombay");
    expect(toPublicArea("  ", "mumbai")).toBe("Mumbai");
  });
});

describe("toPublicProgramme", () => {
  it("maps Kalakriti events and team names, and omits unknown teams", () => {
    expect(toPublicProgramme("Ops", "kalakriti")).toBe("kalakriti");
    expect(toPublicProgramme("Nutrition Drive", null)).toBe("nutrition");
    expect(toPublicProgramme("Weekend Classes", null)).toBe("education");
    expect(toPublicProgramme("Fundraising", null)).toBeUndefined();
  });
});

describe("buildPublicSignUpUrl", () => {
  it("links to the dashboard register page", () => {
    expect(buildPublicSignUpUrl(BASE_URL, "abc")).toBe(
      "https://dash.proudindian.ngo/register?interestEventId=abc"
    );
  });
});

describe("summarizePublicSession", () => {
  const seriesStart = Date.UTC(2026, 8, 5, 4, 30);
  const series = row({
    id: "series",
    recurrenceRule: { rrule: "FREQ=WEEKLY;BYDAY=SA" },
    startTime: seriesStart,
  });

  it("describes an open one-off event", () => {
    expect(summarizePublicSession(row({}), null, undefined, NOW)).toEqual({
      area: "Iblur, Bengaluru",
      name: "Maths class",
      open: true,
      startTime: "2026-10-10T04:30:00.000Z",
    });
  });

  it("reveals nothing about private or Kalakriti events", () => {
    expect(
      summarizePublicSession(row({ isPublic: false }), null, undefined, NOW)
    ).toBeNull();
    expect(
      summarizePublicSession(
        row({ managementDomain: "kalakriti" }),
        null,
        undefined,
        NOW
      )
    ).toBeNull();
    expect(summarizePublicSession(null, null, undefined, NOW)).toBeNull();
  });

  it("marks cancelled and started events as closed", () => {
    expect(
      summarizePublicSession(row({ cancelledAt: NOW }), null, undefined, NOW)
        ?.open
    ).toBe(false);
    expect(
      summarizePublicSession(
        row({ startTime: NOW - HOUR }),
        null,
        undefined,
        NOW
      )?.open
    ).toBe(false);
  });

  it("describes a session of a series, preferring its materialized row", () => {
    expect(
      summarizePublicSession(series, null, "2026-10-10", NOW)
    ).toMatchObject({ open: true, startTime: "2026-10-10T04:30:00.000Z" });
    expect(
      summarizePublicSession(
        series,
        row({
          cancelledAt: NOW,
          id: "exception",
          publicArea: null,
          seriesId: "series",
        }),
        "2026-10-10",
        NOW
      )
    ).toMatchObject({ area: "Iblur, Bengaluru", open: false });
    expect(summarizePublicSession(series, null, "2026-10-11", NOW)).toBeNull();
    expect(summarizePublicSession(series, null, undefined, NOW)).toBeNull();
  });
});
