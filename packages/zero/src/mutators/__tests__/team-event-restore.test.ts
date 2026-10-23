import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";

const enqueue = mock();
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue }));

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { teamEventMutators } from "../team-event";

type Row = Record<string, unknown>;

const NOW = Date.UTC(2026, 9, 1, 6);
const CANCELLED_AT = NOW - 86_400_000;
const LATER = Date.UTC(2026, 9, 10, 4, 30);
const EARLIER = Date.UTC(2026, 8, 26, 4, 30);
// The server judges start times by its own clock; these run as the server.
beforeAll(() => setSystemTime(new Date(NOW)));
afterAll(() => setSystemTime());

const event = (id: string, extra: Row = {}): Row => ({
  cancelledAt: CANCELLED_AT,
  id,
  managementDomain: null,
  name: "Class",
  recurrenceRule: null,
  seriesId: null,
  startTime: LATER,
  teamId: "team-1",
  ...extra,
});

function createDb(events: Row[]) {
  const tables: Record<string, Row[]> = {
    teamEvent: events,
    teamMember: [
      { id: "tm-1", role: "lead", teamId: "team-1", userId: "lead-1" },
    ],
  };
  const tx = {
    location: "server",
    mutate: {
      teamEvent: {
        update: async (row: Row) => {
          Object.assign(
            tables.teamEvent?.find((e) => e.id === row.id) ?? {},
            row
          );
        },
      },
    },
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
  const cancelledAt = (id: string) =>
    tables.teamEvent?.find((e) => e.id === id)?.cancelledAt;
  return { cancelledAt, tx };
}

const lead = {
  asyncTasks: [],
  permissions: [],
  role: "volunteer",
  userId: "lead-1",
};
const admin = {
  asyncTasks: [],
  permissions: ["events.cancel"],
  role: "admin",
  userId: "admin-1",
};

const restore = (
  db: ReturnType<typeof createDb>,
  id: string,
  ctx: Row = lead,
  now = NOW
) =>
  teamEventMutators.restore.fn({
    args: { id, now },
    ctx,
    tx: db.tx,
  } as never);

describe("restoring a cancelled event", () => {
  it("lets a lead restore an upcoming event, sending nothing", async () => {
    const db = createDb([event("e1")]);
    await restore(db, "e1");
    expect(db.cancelledAt("e1")).toBeNull();
    expect(lead.asyncTasks).toHaveLength(0);
  });

  it("refuses someone who is neither a lead nor holds events.cancel", async () => {
    const db = createDb([event("e1")]);
    await expect(
      restore(db, "e1", { permissions: [], role: "volunteer", userId: "v-1" })
    ).rejects.toThrow("Unauthorized");
    expect(db.cancelledAt("e1")).toBe(CANCELLED_AT);
  });

  it("refuses an event that isn't cancelled", async () => {
    const db = createDb([event("e1", { cancelledAt: null })]);
    await expect(restore(db, "e1")).rejects.toThrow(
      "This event isn't cancelled"
    );
  });

  it("refuses cancelling an event twice, so no second notice goes out", async () => {
    const db = createDb([event("e1")]);
    await expect(
      teamEventMutators.cancel.fn({
        args: { id: "e1", now: NOW },
        ctx: lead,
        tx: db.tx,
      } as never)
    ).rejects.toThrow("Event is already cancelled");
    expect(db.cancelledAt("e1")).toBe(CANCELLED_AT);
    expect(lead.asyncTasks).toHaveLength(0);
  });

  it("refuses a started event, even with events.cancel", async () => {
    const db = createDb([event("e1", { startTime: EARLIER })]);
    for (const ctx of [lead, admin]) {
      await expect(restore(db, "e1", ctx)).rejects.toThrow(
        "This event has started since it was cancelled"
      );
    }
    expect(db.cancelledAt("e1")).toBe(CANCELLED_AT);
  });

  it("refuses a started session, even with events.cancel", async () => {
    const db = createDb([
      event("series", {
        cancelledAt: null,
        recurrenceRule: { rrule: "FREQ=WEEKLY" },
        startTime: EARLIER - 7 * 86_400_000,
      }),
      event("session", {
        originalDate: "2026-09-26",
        seriesId: "series",
        startTime: EARLIER,
      }),
    ]);
    await expect(restore(db, "session", admin)).rejects.toThrow(
      "This event has started since it was cancelled"
    );
    expect(db.cancelledAt("session")).toBe(CANCELLED_AT);
  });

  it("judges by the server's clock, not a backdated one", async () => {
    const db = createDb([
      event("e1", { startTime: EARLIER }),
      event("series", {
        recurrenceRule: { rrule: "FREQ=WEEKLY" },
        startTime: EARLIER,
      }),
    ]);
    const backdated = EARLIER - 86_400_000;
    await expect(restore(db, "e1", admin, backdated)).rejects.toThrow(
      "This event has started since it was cancelled"
    );
    await expect(restore(db, "series", admin, backdated)).rejects.toThrow(
      "This series has started since it was cancelled"
    );
    expect(db.cancelledAt("e1")).toBe(CANCELLED_AT);
    expect(db.cancelledAt("series")).toBe(CANCELLED_AT);
  });

  it("restores a cancelled session of a live series", async () => {
    const db = createDb([
      event("series", {
        cancelledAt: null,
        recurrenceRule: { rrule: "FREQ=WEEKLY" },
      }),
      event("session", { originalDate: "2026-10-10", seriesId: "series" }),
    ]);
    await restore(db, "session");
    expect(db.cancelledAt("session")).toBeNull();
  });

  it("refuses a session cut off by the series' new end", async () => {
    const db = createDb([
      event("series", {
        cancelledAt: null,
        recurrenceRule: { rrule: "FREQ=WEEKLY;UNTIL=20261009T235959Z" },
      }),
      event("session", { originalDate: "2026-10-10", seriesId: "series" }),
    ]);
    await expect(restore(db, "session")).rejects.toThrow(
      "The series ends before this session"
    );
    expect(db.cancelledAt("session")).toBe(CANCELLED_AT);
  });

  it("refuses a session of a cancelled series", async () => {
    const db = createDb([
      event("series", { recurrenceRule: { rrule: "FREQ=WEEKLY" } }),
      event("session", { originalDate: "2026-10-10", seriesId: "series" }),
    ]);
    await expect(restore(db, "session")).rejects.toThrow(
      "Restore the series first"
    );
  });

  it("restores a series with the sessions cancelled alongside it", async () => {
    const db = createDb([
      event("series", { recurrenceRule: { rrule: "FREQ=WEEKLY" } }),
      event("with", { originalDate: "2026-10-17", seriesId: "series" }),
      event("before", {
        cancelledAt: CANCELLED_AT - 1000,
        originalDate: "2026-10-24",
        seriesId: "series",
      }),
    ]);
    await restore(db, "series");
    expect(db.cancelledAt("series")).toBeNull();
    expect(db.cancelledAt("with")).toBeNull();
    expect(db.cancelledAt("before")).toBe(CANCELLED_AT - 1000);
  });

  it("refuses a series that has started since it was cancelled", async () => {
    const db = createDb([
      event("series", {
        recurrenceRule: { rrule: "FREQ=WEEKLY" },
        startTime: EARLIER,
      }),
    ]);
    await expect(restore(db, "series", admin)).rejects.toThrow(
      "This series has started since it was cancelled"
    );
    expect(db.cancelledAt("series")).toBe(CANCELLED_AT);
  });
});
