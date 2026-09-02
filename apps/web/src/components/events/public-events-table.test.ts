import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";

import {
  type PublicEventRow,
  rowMatchesPublicFilters,
  selectUpcomingPublicKalakritiEvent,
  toPublicDisplayRow,
} from "./public-events-table";

const NOW = Date.UTC(2026, 7, 17, 6, 30, 0);

function event(
  overrides: Partial<PublicEventRow> & { id: string }
): PublicEventRow {
  return {
    cancelledAt: undefined,
    city: "bangalore",
    createdAt: NOW,
    createdBy: "user-1",
    exceptions: [],
    isPublic: true,
    managementDomain: "kalakriti",
    members: [],
    name: "Kalakriti 2027",
    startTime: Date.UTC(2027, 10, 21),
    team: { id: "team-events", name: "Events" },
    teamId: "team-events",
    updatedAt: NOW,
    ...overrides,
  } as PublicEventRow;
}

describe("selectUpcomingPublicKalakritiEvent", () => {
  beforeEach(() => {
    setSystemTime(NOW);
  });

  afterEach(() => {});

  it("picks the soonest upcoming public Kalakriti event", () => {
    const nearer = event({
      id: "near",
      name: "Kalakriti 2026",
      startTime: Date.UTC(2026, 10, 21),
    });
    const farther = event({
      id: "far",
      name: "Kalakriti 2027",
      startTime: Date.UTC(2027, 10, 21),
    });

    expect(selectUpcomingPublicKalakritiEvent([farther, nearer])?.id).toBe(
      "near"
    );
  });

  it("skips private, past, cancelled, and non-Kalakriti events", () => {
    const draft = event({ id: "draft", isPublic: false });
    const past = event({
      id: "past",
      startTime: Date.UTC(2026, 6, 1),
    });
    const cancelled = event({
      cancelledAt: Date.UTC(2026, 7, 1),
      id: "cancelled",
    });
    const generic = event({
      id: "generic",
      managementDomain: undefined,
      name: "Workshop",
    });
    const live = event({ id: "live" });

    expect(
      selectUpcomingPublicKalakritiEvent([
        draft,
        past,
        cancelled,
        generic,
        live,
      ])?.id
    ).toBe("live");
  });

  it("returns null when no upcoming public Kalakriti event exists", () => {
    expect(selectUpcomingPublicKalakritiEvent([])).toBeNull();
    expect(
      selectUpcomingPublicKalakritiEvent([
        event({ id: "draft", isPublic: false }),
      ])
    ).toBeNull();
  });
});

describe("toPublicDisplayRow", () => {
  it("maps the source event onto a display row", () => {
    const source = event({
      endTime: Date.UTC(2027, 10, 21, 18),
      id: "kk-1",
      location: "Palace Grounds",
    });
    const row = toPublicDisplayRow(source);

    expect(row).toEqual({
      city: "bangalore",
      endTime: Date.UTC(2027, 10, 21, 18),
      eventId: "kk-1",
      isPublic: true,
      isVirtualOccurrence: false,
      location: "Palace Grounds",
      members: [],
      name: "Kalakriti 2027",
      occDate: null,
      startTime: Date.UTC(2027, 10, 21),
      team: { id: "team-events", name: "Events" },
      teamId: "team-events",
    });
  });
});

describe("rowMatchesPublicFilters", () => {
  const row = toPublicDisplayRow(event({ id: "kk-1" }));
  const eventsTeam = new Set(["team-events"]);

  it("keeps the row for All and Public filters", () => {
    expect(rowMatchesPublicFilters(row, "all", "all", "", eventsTeam)).toBe(
      true
    );
    expect(rowMatchesPublicFilters(row, "public", "all", "", eventsTeam)).toBe(
      true
    );
  });

  it("hides the row when My Teams, city, or search do not match", () => {
    expect(rowMatchesPublicFilters(row, "my-teams", "all", "", new Set())).toBe(
      false
    );
    expect(rowMatchesPublicFilters(row, "all", "mumbai", "", eventsTeam)).toBe(
      false
    );
    expect(
      rowMatchesPublicFilters(row, "all", "all", "workshop", eventsTeam)
    ).toBe(false);
  });
});
