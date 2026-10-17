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

  it("sends the start date (or no date) to a live start-date row", async () => {
    const db = createDb([
      {
        cancelledAt: null,
        endTime: FIRST + 7_200_000,
        id: "first-row",
        location: "Iblur",
        name: "Weekly class",
        originalDate: "2026-10-03",
        seriesId: "series-1",
        startTime: FIRST,
      },
    ]);
    for (const occDate of ["2026-10-03", undefined]) {
      const target = await resolveJoinTarget(
        db.tx as never,
        ctx as never,
        series as never,
        { eventId: "series-1", now: NOW, occDate }
      );
      expect(target.eventId).toBe("first-row");
    }
  });

  it("refuses a cancelled saved session, the start date included", async () => {
    const db = createDb([
      {
        cancelledAt: NOW - 1000,
        id: "first-row",
        originalDate: "2026-10-03",
        seriesId: "series-1",
        startTime: FIRST,
      },
    ]);
    await expect(
      resolveJoinTarget(db.tx as never, ctx as never, series as never, {
        eventId: "series-1",
        now: NOW,
      })
    ).rejects.toThrow("This session was cancelled");
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

  it("starts a new series row and moves saved sessions from the split day on", async () => {
    const db = createDb([
      session("before", "2026-10-10"),
      session("on-split", split.date, {
        childrenAttended: 12,
        name: "Own edit",
      }),
      session("after", "2026-10-24"),
    ]);
    expect(await follow(db)).toEqual(["on-split", "after"]);
    expect(row(db, "series-2")).toMatchObject({
      name: "Weekly class, new room",
      recurrenceRule: { rrule: "FREQ=WEEKLY" },
      seriesId: null,
      startTime: split.start,
      teamId: "team-1",
    });
    // The split day's row keeps its own edits and recap, now as the new
    // series' start-date row.
    expect(row(db, "on-split")).toMatchObject({
      childrenAttended: 12,
      name: "Own edit",
      originalDate: split.date,
      seriesId: "series-2",
    });
    expect(row(db, "after")?.seriesId).toBe("series-2");
    expect(row(db, "before")?.seriesId).toBe("series-1");
    expect(row(db, "series-1")?.recurrenceRule).toEqual({
      rrule: "FREQ=WEEKLY;UNTIL=20261016T235959Z",
    });
    expect(db.tables.teamEvent).toHaveLength(5);
  });

  it("moves a cancelled split-day session too, still cancelled", async () => {
    const db = createDb([
      session("cancelled", split.date, { cancelledAt: NOW - DAY }),
    ]);
    await follow(db);
    expect(row(db, "cancelled")).toMatchObject({
      cancelledAt: NOW - DAY,
      seriesId: "series-2",
    });
  });

  it("hands the WhatsApp group to the new series and its inherited sessions", async () => {
    const db = createDb([
      session("before", "2026-10-10", { whatsappGroupId: "g-1" }),
      session("inherited", split.date, { whatsappGroupId: "g-1" }),
      session("own-group", "2026-10-24", { whatsappGroupId: "g-own" }),
    ]);
    const parent = db.tables.teamEvent?.[0] as Row;
    parent.whatsappGroupId = "g-1";
    await updateSeriesFollowing(
      db.tx as never,
      {
        id: "series-1",
        newSeriesId: "series-2",
        now: NOW,
        originalDate: split.date,
        startTime: split.start,
      },
      { ...series, whatsappGroupId: "g-1" } as never,
      "lead-1"
    );
    expect(row(db, "series-1")?.whatsappGroupId).toBeNull();
    expect(row(db, "series-2")?.whatsappGroupId).toBe("g-1");
    expect(row(db, "inherited")?.whatsappGroupId).toBe("g-1");
    expect(row(db, "own-group")?.whatsappGroupId).toBe("g-own");
    // Past sessions keep their stored group for history.
    expect(row(db, "before")?.whatsappGroupId).toBe("g-1");
  });
});
