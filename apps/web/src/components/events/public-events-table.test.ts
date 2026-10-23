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
  rowMapUrl,
  rowMatchesPublicFilters,
  rowPlace,
  selectUpcomingPublicKalakritiEvent,
  toPublicDisplayRow,
} from "./public-events-table";

const NOW = Date.UTC(2026, 7, 17, 6, 30, 0);
const BLR = "cc-blr";
const cityNameOf = (id: string | null | undefined) =>
  id === BLR ? "Bengaluru" : "";

function event(
  overrides: Partial<PublicEventRow> & { id: string }
): PublicEventRow {
  return {
    cancelledAt: undefined,
    costCentreId: BLR,
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

describe("rowPlace and rowMapUrl", () => {
  const place = (
    location: string | null,
    publicArea: string | null,
    cityName = "Bengaluru"
  ) => ({ cityName, location, publicArea });

  it("prefers a typed address and has no map link for it", () => {
    const row = place("PI Center, Indiranagar", "Indiranagar");
    expect(rowPlace(row)).toBe("PI Center, Indiranagar");
    expect(rowMapUrl(row)).toBeNull();
  });

  it("falls back to the area and city when the location is a link", () => {
    const row = place("https://maps.app.goo.gl/abc", "Indiranagar");
    expect(rowPlace(row)).toBe("Indiranagar, Bengaluru");
    expect(rowMapUrl(row)).toBe("https://maps.app.goo.gl/abc");
  });

  it("uses the city alone without an area, and the area without a city", () => {
    expect(rowPlace(place(null, null))).toBe("Bengaluru");
    expect(rowPlace(place(null, "Gubbachi", ""))).toBe("Gubbachi");
    expect(rowPlace(place(null, null, ""))).toBeNull();
  });

  it("lets search match the place shown on the row", () => {
    const row = toPublicDisplayRow(
      event({ id: "kk-2", location: "https://maps.app.goo.gl/abc" }),
      cityNameOf
    );
    expect(
      rowMatchesPublicFilters(row, "all", "all", "bengaluru", new Set())
    ).toBe(true);
  });
});
