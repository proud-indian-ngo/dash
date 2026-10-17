import { describe, expect, it, mock } from "bun:test";

// Sessions saved before a split go through SQL on the server; capture them.
const sqlSaved: { sessions: Row[]; volunteers: Row[] }[] = [];
mock.module("@pi-dash/db/series-sessions", () => ({
  saveSeriesSessions: async (
    _tx: unknown,
    sessions: Row[],
    volunteers: Row[]
  ) => {
    sqlSaved.push({ sessions, volunteers });
    return sessions.map((session) => session.id);
  },
}));

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
    dbTransaction: { wrappedTransaction: {} },
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
        location: "New hall",
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
    // The split day's row is the session the edit came from: it takes the
    // submitted fields and keeps its recap, now as the new series'
    // start-date row. Later rows keep their own details.
    expect(row(db, "on-split")).toMatchObject({
      childrenAttended: 12,
      location: "New hall",
      name: "Weekly class, new room",
      originalDate: split.date,
      seriesId: "series-2",
      startTime: split.start,
    });
    expect(row(db, "after")?.seriesId).toBe("series-2");
    expect(row(db, "after")).not.toHaveProperty("location");
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

  const handOver = async (now: number) => {
    sqlSaved.length = 0;
    const db = createDb();
    (db.tables.teamEventMember as Row[]).push({
      addedAt: NOW - DAY,
      eventId: "series-1",
      id: "m-1",
      userId: "vol-1",
    });
    await updateSeriesFollowing(
      db.tx as never,
      {
        id: "series-1",
        newSeriesId: "series-2",
        now,
        originalDate: split.date,
        startTime: split.start,
      },
      { ...series, inheritVolunteers: true, whatsappGroupId: "g-1" } as never,
      "lead-1"
    );
    return db;
  };

  it("saves the old series' upcoming sessions with its group before handing it over", async () => {
    const db = await handOver(NOW);
    // 3 Oct is the series row itself; 10 Oct was unsaved and is saved now,
    // on the group, with the series' volunteer and no recap.
    expect(sqlSaved).toHaveLength(1);
    expect(sqlSaved[0]?.sessions).toHaveLength(1);
    expect(sqlSaved[0]?.sessions[0]).toMatchObject({
      originalDate: "2026-10-10",
      seriesId: "series-1",
      whatsappGroupId: "g-1",
    });
    expect(sqlSaved[0]?.sessions[0]).not.toHaveProperty("childrenAttended");
    expect(sqlSaved[0]?.volunteers).toMatchObject([{ userId: "vol-1" }]);
    expect(row(db, "series-2")?.whatsappGroupId).toBe("g-1");
  });

  it("saves a session under way too, but not one that has ended", async () => {
    // 10 Oct, 11:00 IST: that session (10:00 to 12:00) is under way.
    await handOver(Date.UTC(2026, 9, 10, 5, 30));
    expect(sqlSaved[0]?.sessions.map((r) => r.originalDate)).toEqual([
      "2026-10-10",
    ]);
    // 10 Oct, 13:00 IST: it has ended, and nothing else comes before 17 Oct.
    await handOver(Date.UTC(2026, 9, 10, 7, 30));
    expect(sqlSaved).toEqual([]);
  });

  it("keeps the split-day row's own times when the new series moves its first date", async () => {
    const db = createDb([
      session("on-split", split.date, { endTime: split.start + 7_200_000 }),
    ]);
    const sunday = split.start + DAY;
    await updateSeriesFollowing(
      db.tx as never,
      {
        endTime: sunday + 7_200_000,
        id: "series-1",
        name: "Sunday class",
        newSeriesId: "series-2",
        now: NOW,
        originalDate: split.date,
        startTime: sunday,
      },
      series as never,
      "lead-1"
    );
    expect(row(db, "on-split")).toMatchObject({
      name: "Sunday class",
      seriesId: "series-2",
      startTime: split.start,
    });
    expect(row(db, "series-2")?.startTime).toBe(sunday);
  });
});

describe("this and following on the series' start date", () => {
  const db = () => {
    const tables: Record<string, Row[]> = {
      eventPartner: [],
      teamEvent: [
        { ...series, programmeId: "p-1" },
        {
          cancelledAt: null,
          id: "first-row",
          name: "Weekly class",
          originalDate: "2026-10-03",
          seriesId: "series-1",
          startTime: FIRST,
          teamId: "team-1",
        },
      ],
      teamEventMember: [],
      teamMember: [
        { id: "tm-1", role: "lead", teamId: "team-1", userId: "lead-1" },
      ],
      costCentre: [{ active: true, code: "BLR", id: "cc-1", name: "BLR" }],
      programme: [
        { active: true, id: "p-1" },
        { active: true, id: "p-2" },
      ],
      reimbursement: [],
      vendorPayment: [],
    };
    const update = (table: string) => async (row: Row) => {
      Object.assign(
        tables[table]?.find((item) => item.id === row.id) ?? {},
        row
      );
    };
    const insert = (table: string) => async (row: Row) => {
      tables[table]?.push({ ...row });
    };
    const tx = {
      location: "client",
      mutate: Object.fromEntries(
        Object.keys(tables).map((table) => [
          table,
          {
            delete: async () => {},
            insert: insert(table),
            update: update(table),
          },
        ])
      ),
      run: async (query: { ast: ScopeAst; format: { singular: boolean } }) => {
        const result = (tables[query.ast.table] ?? []).filter((r) =>
          matchesScope(
            r as ScopeRow,
            query.ast.where,
            tables as unknown as ScopeTables
          )
        );
        return query.format.singular ? result[0] : result;
      },
    };
    return { tables, tx };
  };

  it("edits the whole series and the start-date row instead of splitting", async () => {
    const d = db();
    await teamEventMutators.updateSeries.fn({
      args: {
        id: "series-1",
        location: "New hall",
        mode: "following",
        newSeriesId: "series-2",
        now: NOW,
        originalDate: "2026-10-03",
      },
      ctx,
      tx: d.tx,
    } as never);
    expect(d.tables.teamEvent?.map((e) => e.id)).toEqual([
      "series-1",
      "first-row",
    ]);
    expect(d.tables.teamEvent?.[0]).toMatchObject({
      location: "New hall",
      recurrenceRule: { rrule: "FREQ=WEEKLY" },
    });
    expect(d.tables.teamEvent?.[1]?.location).toBe("New hall");
  });

  it("cancels the whole series instead of truncating it", async () => {
    const d = db();
    await teamEventMutators.cancelSeries.fn({
      args: {
        id: "series-1",
        mode: "following",
        now: NOW,
        originalDate: "2026-10-03",
      },
      ctx: { ...ctx, permissions: ["events.cancel"] },
      tx: d.tx,
    } as never);
    expect(d.tables.teamEvent?.[0]).toMatchObject({
      cancelledAt: NOW,
      recurrenceRule: { rrule: "FREQ=WEEKLY" },
    });
    expect(d.tables.teamEvent?.[1]?.cancelledAt).toBe(NOW);
  });

  // What the scope dialog sends for "All events": no originalDate.
  const editAll = (d: ReturnType<typeof db>, now: number, extra: Row) =>
    teamEventMutators.updateSeries.fn({
      args: { id: "series-1", mode: "all", now, ...extra },
      ctx,
      tx: d.tx,
    } as never);

  it("moves a live start-date row with an All events time change", async () => {
    const d = db();
    const later = FIRST + 3_600_000;
    await editAll(d, NOW, { endTime: later + 7_200_000, startTime: later });
    expect(d.tables.teamEvent?.[0]?.startTime).toBe(later);
    expect(d.tables.teamEvent?.[1]).toMatchObject({
      endTime: later + 7_200_000,
      startTime: later,
    });
  });

  it("lets All events change the programme until the series starts", async () => {
    const d = db();
    await editAll(d, NOW, { programmeId: "p-2" });
    expect(d.tables.teamEvent?.[0]?.programmeId).toBe("p-2");
    expect(d.tables.teamEvent?.[1]?.programmeId).toBe("p-2");
  });

  it("refuses an All events programme change once the series has started", async () => {
    const started = FIRST + 3_600_000;
    await expect(
      editAll(db(), started, { programmeId: "p-2" })
    ).rejects.toThrow("Past sessions keep their programme");
    // Also through "following" on the start date, which becomes "all".
    await expect(
      editAll(db(), started, {
        mode: "following",
        newSeriesId: "series-2",
        originalDate: "2026-10-03",
        programmeId: "p-2",
      })
    ).rejects.toThrow("Past sessions keep their programme");
  });

  it("refuses it before the start once money is charged to a session", async () => {
    const d = db();
    d.tables.reimbursement?.push({
      eventId: "first-row",
      id: "r-1",
      status: "pending",
      voidedAt: null,
    });
    await expect(editAll(d, NOW, { programmeId: "p-2" })).rejects.toThrow(
      "Past sessions keep their programme"
    );
  });

  it("lets a rejected or voided claim pass", async () => {
    const d = db();
    d.tables.reimbursement?.push(
      { eventId: "first-row", id: "r-1", status: "rejected", voidedAt: null },
      { eventId: "series-1", id: "r-2", status: "approved", voidedAt: NOW }
    );
    await editAll(d, NOW, { programmeId: "p-2" });
    expect(d.tables.teamEvent?.[0]?.programmeId).toBe("p-2");
  });

  it("moves saved sessions still on the old programme with an All events change", async () => {
    const d = db();
    d.tables.teamEvent?.push(
      {
        id: "later",
        originalDate: "2026-10-10",
        programmeId: "p-1",
        seriesId: "series-1",
        startTime: FIRST + 7 * 86_400_000,
      },
      {
        id: "own",
        originalDate: "2026-10-17",
        programmeId: "p-own",
        seriesId: "series-1",
        startTime: FIRST + 14 * 86_400_000,
      }
    );
    await editAll(d, NOW, { programmeId: "p-2" });
    const programmeOf = (id: string) =>
      d.tables.teamEvent?.find((e) => e.id === id)?.programmeId;
    expect(programmeOf("later")).toBe("p-2");
    expect(programmeOf("own")).toBe("p-own");
  });

  it("keeps the start-date row's own details when All events renames the series", async () => {
    const d = db();
    Object.assign(d.tables.teamEvent?.[1] ?? {}, {
      location: "Own hall",
      startTime: FIRST + 1_800_000,
    });
    // The dialog submits every field, prefilled from the series row.
    await editAll(d, NOW, {
      endTime: series.endTime,
      location: series.location,
      name: "Weekly class, renamed",
      programmeId: "p-1",
      startTime: FIRST,
    });
    expect(d.tables.teamEvent?.[1]).toMatchObject({
      location: "Own hall",
      name: "Weekly class, renamed",
      startTime: FIRST + 1_800_000,
    });
  });
});
