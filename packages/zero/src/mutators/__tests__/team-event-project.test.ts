import { describe, expect, it, mock } from "bun:test";

mock.module("@pi-dash/jobs/enqueue", () => ({
  enqueue: async () => undefined,
}));

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { teamEventMutators } from "../team-event";

type Row = Record<string, unknown>;

const NOW = Date.UTC(2026, 9, 1, 6);
const START = Date.UTC(2026, 10, 7, 4, 30);

const event: Row = {
  cancelledAt: null,
  costCentreId: "cc-1",
  description: null,
  endTime: START + 7_200_000,
  feedbackDeadline: null,
  feedbackEnabled: false,
  id: "event-1",
  inheritVolunteers: false,
  isPublic: false,
  location: "Iblur",
  managementDomain: null,
  name: "Class",
  originalDate: null,
  postEventNudgesEnabled: true,
  postRsvpPoll: false,
  programmeId: "edu",
  projectId: "class-2026",
  publicArea: null,
  recurrenceRule: null,
  reminderIntervals: null,
  reminderTarget: "group",
  rsvpPollLeadMinutes: 60,
  seriesId: null,
  startTime: START,
  teamId: "team-1",
  whatsappGroupId: null,
};

function createDb(events: Row[] = [{ ...event }]) {
  const tables: Record<string, Row[]> = {
    costCentre: [{ active: true, id: "cc-1" }],
    programme: [
      { active: true, id: "edu" },
      { active: true, id: "arts" },
    ],
    project: [
      { id: "class-2026", programmeId: "edu", status: "active" },
      { id: "drive-2026", programmeId: "edu", status: "active" },
      { id: "class-2025", programmeId: "edu", status: "closed" },
      { id: "kalakriti-2026", programmeId: "arts", status: "active" },
    ],
    teamEvent: events,
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
  const row = (id: string) => tables.teamEvent?.find((e) => e.id === id);
  return { row, tables, tx };
}

const finance = {
  permissions: ["events.create", "events.edit", "finance.manage"],
  role: "finance_admin",
  userId: "finance-1",
};
const lead = { permissions: [], role: "volunteer", userId: "lead-1" };

const update = (tx: unknown, ctx: unknown, args: Row) =>
  teamEventMutators.update.fn({
    args: { id: "event-1", now: NOW, ...args },
    ctx,
    tx,
  } as never);

describe("an event's project", () => {
  it("is set by finance.manage to a project of the event's programme", async () => {
    const db = createDb();
    await update(db.tx, finance, { projectId: "drive-2026" });
    expect(db.row("event-1")?.projectId).toBe("drive-2026");
    await update(db.tx, finance, { projectId: null });
    expect(db.row("event-1")?.projectId).toBeNull();
  });

  it("is kept when someone without finance.manage saves the event", async () => {
    const db = createDb();
    await update(db.tx, lead, { name: "Renamed", projectId: null });
    expect(db.row("event-1")).toMatchObject({
      name: "Renamed",
      projectId: "class-2026",
    });
    await update(db.tx, lead, { projectId: "drive-2026" });
    expect(db.row("event-1")?.projectId).toBe("class-2026");
  });

  it("refuses a project of another programme, or a closed one", async () => {
    const db = createDb();
    await expect(
      update(db.tx, finance, { projectId: "kalakriti-2026" })
    ).rejects.toThrow("Choose a project under the event's programme");
    await expect(
      update(db.tx, finance, { projectId: "class-2025" })
    ).rejects.toThrow("Choose a project that isn't closed");
    await expect(
      update(db.tx, finance, { projectId: "missing" })
    ).rejects.toThrow("Project not found");
    expect(db.row("event-1")?.projectId).toBe("class-2026");
  });

  it("is cleared when the event moves to another programme", async () => {
    const db = createDb();
    await update(db.tx, lead, { programmeId: "arts" });
    expect(db.row("event-1")).toMatchObject({
      programmeId: "arts",
      projectId: null,
    });
    // Finance can name one under the new programme in the same save.
    const again = createDb();
    await update(again.tx, finance, {
      programmeId: "arts",
      projectId: "kalakriti-2026",
    });
    expect(again.row("event-1")).toMatchObject({
      programmeId: "arts",
      projectId: "kalakriti-2026",
    });
  });

  it("is set on create only by finance.manage", async () => {
    const create = (ctx: unknown, id: string) => {
      const db = createDb([]);
      return teamEventMutators.create
        .fn({
          args: {
            id,
            name: "New",
            now: NOW,
            programmeId: "edu",
            projectId: "drive-2026",
            startTime: START,
            teamId: "team-1",
          },
          ctx,
          tx: db.tx,
        } as never)
        .then(() => db.row(id)?.projectId);
    };
    expect(await create(finance, "new-1")).toBe("drive-2026");
    expect(await create(lead, "new-2")).toBeNull();
  });

  it("is inherited by a materialised occurrence", async () => {
    const db = createDb([
      { ...event, recurrenceRule: { rrule: "FREQ=WEEKLY" } },
    ]);
    await teamEventMutators.materialize.fn({
      args: {
        id: "occ-1",
        now: NOW,
        originalDate: "2026-11-14",
        seriesId: "event-1",
      },
      ctx: lead,
      tx: db.tx,
    } as never);
    expect(db.row("occ-1")).toMatchObject({
      programmeId: "edu",
      projectId: "class-2026",
      seriesId: "event-1",
    });
  });

  it("follows an All events change onto saved sessions still on the old one", async () => {
    const session = (id: string, date: string, projectId: string | null) => ({
      ...event,
      id,
      originalDate: date,
      projectId,
      recurrenceRule: null,
      seriesId: "event-1",
      startTime: Date.parse(`${date}T04:30:00Z`),
    });
    const db = createDb([
      { ...event, recurrenceRule: { rrule: "FREQ=WEEKLY" } },
      session("occ-1", "2026-11-14", "class-2026"),
      session("occ-2", "2026-11-21", null),
    ]);
    await teamEventMutators.updateSeries.fn({
      args: {
        id: "event-1",
        mode: "all",
        now: NOW,
        projectId: "drive-2026",
      },
      ctx: finance,
      tx: db.tx,
    } as never);
    expect(db.row("event-1")?.projectId).toBe("drive-2026");
    expect(db.row("occ-1")?.projectId).toBe("drive-2026");
    expect(db.row("occ-2")?.projectId).toBeNull();
  });
});
