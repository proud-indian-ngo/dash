import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { resolveJoinTarget, teamEventMutators } from "../team-event";
import { updateSeriesFollowing } from "../team-event-series";

type Row = Record<string, unknown>;

const NOW = Date.UTC(2026, 9, 1, 6);
// A weekly series whose first session is Saturday 3 October 2026, 10:00 IST.
const FIRST = Date.UTC(2026, 9, 3, 4, 30);
const series: Row = {
  costCentreId: "cc-1",
  description: null,
  endTime: FIRST + 2 * 3_600_000,
  feedbackDeadline: null,
  feedbackEnabled: false,
  id: "series-1",
  inheritVolunteers: false,
  isPublic: true,
  location: "Iblur",
  managementDomain: null,
  name: "Weekly class",
  postRsvpPoll: false,
  programmeId: "p-1",
  publicArea: null,
  recurrenceRule: { rrule: "FREQ=WEEKLY" },
  reminderIntervals: null,
  reminderTarget: "group",
  rsvpPollLeadMinutes: 60,
  seriesId: null,
  startTime: FIRST,
  teamId: "team-1",
  whatsappGroupId: null,
};

function createDb(exceptions: Row[] = []) {
  const tables: Record<string, Row[]> = {
    teamEvent: [{ ...series }, ...exceptions],
    teamEventMember: [],
    teamMember: [
      { id: "tm-1", role: "lead", teamId: "team-1", userId: "lead-1" },
    ],
  };
  const tx = {
    location: "server",
    mutate: Object.fromEntries(
      Object.keys(tables).map((table) => [
        table,
        {
          insert: async (row: Row) => {
            tables[table]?.push({ ...row });
          },
          update: async (row: Row) => {
            const current = tables[table]?.find((item) => item.id === row.id);
            if (!current) {
              throw new Error(`Missing ${table} ${String(row.id)}`);
            }
            Object.assign(current, row);
          },
        },
      ])
    ),
    run: async (query: { ast: ScopeAst; format: { singular: boolean } }) => {
      const result = (tables[query.ast.table] ?? []).filter((row) =>
        matchesScope(
          row as ScopeRow,
          query.ast.where,
          tables as unknown as ScopeTables
        )
      );
      return query.format.singular ? result[0] : result;
    },
  };
  return { tables, tx };
}

const ctx = { permissions: [], role: "volunteer", userId: "lead-1" };

describe("a series' first session is the parent row", () => {
  it("sends a join or interest on the start date to the parent", async () => {
    const db = createDb();
    const target = await resolveJoinTarget(
      db.tx as never,
      ctx as never,
      series as never,
      {
        eventId: "series-1",
        materializedId: "exc-1",
        now: NOW,
        occDate: "2026-10-03",
      }
    );
    expect(target).toMatchObject({ eventId: "series-1", startTime: FIRST });
    expect(db.tables.teamEvent).toHaveLength(1);
  });

  it("still saves a later date as its own session", async () => {
    const db = createDb();
    const target = await resolveJoinTarget(
      db.tx as never,
      ctx as never,
      series as never,
      {
        eventId: "series-1",
        materializedId: "exc-1",
        now: NOW,
        occDate: "2026-10-10",
      }
    );
    expect(target.eventId).toBe("exc-1");
    expect(db.tables.teamEvent?.[1]).toMatchObject({
      originalDate: "2026-10-10",
      seriesId: "series-1",
    });
  });

  it("refuses to materialise the start date as an exception", async () => {
    const db = createDb();
    await expect(
      teamEventMutators.materialize.fn({
        args: {
          id: "exc-1",
          now: NOW,
          originalDate: "2026-10-03",
          seriesId: "series-1",
        },
        ctx,
        tx: db.tx,
      } as never)
    ).rejects.toThrow("The first session is the series itself");
    expect(db.tables.teamEvent).toHaveLength(1);
  });
});

describe("this and following", () => {
  const DAY = 86_400_000;
  // Split at the third session, 17 October; same weekday and time.
  const split = { date: "2026-10-17", start: FIRST + 14 * DAY };
  const session = (id: string, date: string, extra: Row = {}): Row => ({
    cancelledAt: null,
    id,
    originalDate: date,
    recurrenceRule: null,
    seriesId: "series-1",
    startTime: Date.parse(`${date}T04:30:00Z`),
    ...extra,
  });
  const follow = (db: ReturnType<typeof createDb>) =>
    updateSeriesFollowing(
      db.tx as never,
      {
        id: "series-1",
        name: "Weekly class, new room",
        newSeriesId: "series-2",
        now: NOW,
        originalDate: split.date,
        startTime: split.start,
      },
      series as never,
      "lead-1"
    );
  const row = (db: ReturnType<typeof createDb>, id: string) =>
    db.tables.teamEvent?.find((e) => e.id === id);

  it("makes a saved session on the split date the new series and moves later ones to it", async () => {
    const db = createDb([
      session("before", "2026-10-10"),
      session("on-split", split.date, { childrenAttended: 12 }),
      session("after", "2026-10-24"),
    ]);
    expect(await follow(db)).toBe("on-split");
    expect(row(db, "on-split")).toMatchObject({
      childrenAttended: 12,
      name: "Weekly class, new room",
      originalDate: split.date,
      recurrenceRule: { rrule: "FREQ=WEEKLY" },
      seriesId: null,
      startTime: split.start,
    });
    expect(row(db, "after")?.seriesId).toBe("on-split");
    expect(row(db, "before")?.seriesId).toBe("series-1");
    expect(row(db, "series-2")).toBeUndefined();
    expect(row(db, "series-1")?.recurrenceRule).toEqual({
      rrule: "FREQ=WEEKLY;UNTIL=20261017T000000Z",
    });
  });

  it("starts a new series row when the split date has no live session", async () => {
    const db = createDb([
      session("cancelled", split.date, { cancelledAt: NOW - DAY }),
      session("after", "2026-10-24"),
    ]);
    expect(await follow(db)).toBe("series-2");
    expect(row(db, "series-2")).toMatchObject({
      seriesId: null,
      startTime: split.start,
      teamId: "team-1",
    });
    expect(row(db, "cancelled")?.seriesId).toBe("series-2");
    expect(row(db, "after")?.seriesId).toBe("series-2");
  });
});
