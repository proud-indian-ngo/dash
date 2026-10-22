import { describe, expect, it } from "bun:test";

import {
  matchesScope,
  type ScopeAst,
  type ScopeRow,
  type ScopeTables,
} from "../../queries/query-scope-test-utils";
import { appConfigMutators } from "../app-config";
import { eventPhotoMutators } from "../event-photo";
import { resolveSeriesWriteTarget, teamEventMutators } from "../team-event";
import { replaceEventPartners } from "../team-event-social";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

type Row = Record<string, unknown>;

function createDb(seed: Partial<Record<string, Row[]>> = {}) {
  const tables: Record<string, Row[]> = {
    appConfig: [],
    eventPartner: [],
    eventPhoto: [],
    teamEvent: [],
    teamEventMember: [],
    teamMember: [],
    ...seed,
  };
  const writes: { action: string; row: Row; table: string }[] = [];
  const tableApi = (table: string) => ({
    delete: async (row: Row) => {
      writes.push({ action: "delete", row, table });
      const key = "id" in row ? "id" : "key";
      tables[table] = (tables[table] ?? []).filter(
        (item) => item[key] !== row[key]
      );
    },
    insert: async (row: Row) => {
      writes.push({ action: "insert", row, table });
      tables[table]?.push({ ...row });
    },
    update: async (row: Row) => {
      writes.push({ action: "update", row, table });
      const current = tables[table]?.find((item) => item.id === row.id);
      if (!current) {
        throw new Error(`Missing ${table} ${String(row.id)}`);
      }
      Object.assign(current, row);
    },
    upsert: async (row: Row) => {
      writes.push({ action: "upsert", row, table });
    },
  });
  const tx = {
    location: "server",
    mutate: Object.fromEntries(
      Object.keys(tables).map((table) => [table, tableApi(table)])
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
  return { tables, tx, writes };
}

function pastEvent(overrides: Row = {}): Row {
  return {
    childrenAttended: null,
    endTime: NOW - HOUR,
    id: "event-1",
    managementDomain: null,
    recurrenceRule: null,
    seriesId: null,
    socialCompletedAt: null,
    socialNotes: null,
    startTime: NOW - 3 * HOUR,
    teamId: "team-1",
    ...overrides,
  };
}

const leadMembership = {
  id: "tm-1",
  role: "lead",
  teamId: "team-1",
  userId: "lead-1",
};
const leadCtx = { permissions: [], role: "volunteer", userId: "lead-1" };
const volunteerCtx = { permissions: [], role: "volunteer", userId: "vol-1" };
const adminCtx = {
  permissions: [
    "events.manage_attendance",
    "events.manage_photos",
    "settings.app_config",
  ],
  role: "admin",
  userId: "admin-1",
};

function run(
  mutator: { fn: (input: never) => Promise<unknown> },
  db: ReturnType<typeof createDb>,
  ctx: Row,
  args: Row
) {
  return mutator.fn({ args, ctx, tx: db.tx } as never);
}

describe("teamEvent.saveSocialRecap", () => {
  const recap = {
    childrenAttended: 18,
    eventId: "event-1",
    markReady: true,
    now: NOW,
    socialNotes: "Built paper boats",
  };

  it("keeps the first completion time when the lead edits later", async () => {
    const db = createDb({
      teamEvent: [pastEvent({ socialCompletedAt: NOW - HOUR })],
      teamMember: [leadMembership],
    });
    await run(teamEventMutators.saveSocialRecap, db, leadCtx, {
      ...recap,
      childrenAttended: 20,
      now: NOW + HOUR,
    });
    expect(db.tables.teamEvent?.[0]).toMatchObject({
      childrenAttended: 20,
      socialCompletedAt: NOW - HOUR,
    });
  });

  it("rejects volunteers who are neither lead nor attendance managers", async () => {
    const db = createDb({ teamEvent: [pastEvent()] });
    await expect(
      run(teamEventMutators.saveSocialRecap, db, volunteerCtx, recap)
    ).rejects.toThrow("Unauthorized");
    expect(db.writes).toHaveLength(0);
  });

  it("rejects events that have not ended", async () => {
    const db = createDb({
      teamEvent: [pastEvent({ endTime: NOW + HOUR })],
      teamMember: [leadMembership],
    });
    await expect(
      run(teamEventMutators.saveSocialRecap, db, leadCtx, recap)
    ).rejects.toThrow("after the event ends");
  });

  it("records the recap on a series parent, its first session", async () => {
    const db = createDb({
      teamEvent: [pastEvent({ recurrenceRule: { rrule: "FREQ=WEEKLY" } })],
    });
    await run(teamEventMutators.saveSocialRecap, db, adminCtx, recap);
    expect(db.tables.teamEvent?.[0]).toMatchObject({
      childrenAttended: 18,
      socialCompletedAt: NOW,
    });
  });

  it("rejects Kalakriti-managed events", async () => {
    const db = createDb({
      teamEvent: [pastEvent({ managementDomain: "kalakriti" })],
    });
    await expect(
      run(teamEventMutators.saveSocialRecap, db, adminCtx, recap)
    ).rejects.toThrow("Manage this event from Kalakriti");
  });

  it("rejects notes over 280 characters", () => {
    const result = teamEventMutators.saveSocialRecap.validator?.[
      "~standard"
    ].validate({ ...recap, socialNotes: "x".repeat(281) });
    expect(result && "issues" in result && result.issues?.length).toBeTruthy();
  });
});

describe("teamEvent.undoSocialRecap", () => {
  it("clears completion and keeps the entered figures", async () => {
    const db = createDb({
      teamEvent: [pastEvent({ childrenAttended: 9, socialCompletedAt: NOW })],
      teamMember: [leadMembership],
    });
    await run(teamEventMutators.undoSocialRecap, db, leadCtx, {
      eventId: "event-1",
      now: NOW,
    });
    expect(db.tables.teamEvent?.[0]).toMatchObject({
      childrenAttended: 9,
      socialCompletedAt: null,
    });
  });

  it("rejects users without the attendance gate", async () => {
    const db = createDb({ teamEvent: [pastEvent({ socialCompletedAt: NOW })] });
    await expect(
      run(teamEventMutators.undoSocialRecap, db, volunteerCtx, {
        eventId: "event-1",
        now: NOW,
      })
    ).rejects.toThrow("Unauthorized");
  });
});

describe("eventPhoto.setDoNotUse", () => {
  const photo = {
    eventId: "event-1",
    id: "photo-1",
    status: "approved",
    doNotUse: false,
  };

  it("lets a team lead flag an approved photo", async () => {
    const db = createDb({
      eventPhoto: [photo],
      teamEvent: [pastEvent()],
      teamMember: [leadMembership],
    });
    await run(eventPhotoMutators.setDoNotUse, db, leadCtx, {
      doNotUse: true,
      id: "photo-1",
    });
    expect(db.tables.eventPhoto?.[0]?.doNotUse).toBe(true);
  });

  it("allows photo moderators without the attendance permission", async () => {
    const db = createDb({ eventPhoto: [photo], teamEvent: [pastEvent()] });
    await run(
      eventPhotoMutators.setDoNotUse,
      db,
      {
        permissions: ["events.manage_photos"],
        role: "volunteer",
        userId: "mod-1",
      },
      { doNotUse: true, id: "photo-1" }
    );
    expect(db.tables.eventPhoto?.[0]?.doNotUse).toBe(true);
  });

  it("rejects pending photos and other volunteers", async () => {
    const db = createDb({
      eventPhoto: [{ ...photo, status: "pending" }],
      teamEvent: [pastEvent()],
    });
    await expect(
      run(eventPhotoMutators.setDoNotUse, db, adminCtx, {
        doNotUse: true,
        id: "photo-1",
      })
    ).rejects.toThrow("approved");

    const other = createDb({ eventPhoto: [photo], teamEvent: [pastEvent()] });
    await expect(
      run(eventPhotoMutators.setDoNotUse, other, volunteerCtx, {
        doNotUse: true,
        id: "photo-1",
      })
    ).rejects.toThrow("Unauthorized");
  });
});

describe("event partners and volunteers needed", () => {
  const partners = [
    {
      id: "p-new-1",
      instagram: "nss_sfs",
      linkedin: " nss-sfs ",
      name: " NSS SFS ",
    },
    { id: "p-new-2", name: "Ethos" },
  ];

  it("replaces partners in order and normalises handles", async () => {
    const db = createDb({
      eventPartner: [{ eventId: "event-1", id: "p-old", name: "Old" }],
      teamEvent: [pastEvent()],
    });
    await replaceEventPartners(
      db.tx as never,
      "event-1",
      "team-1",
      partners,
      NOW
    );
    expect(db.tables.eventPartner).toEqual([
      {
        createdAt: NOW,
        eventId: "event-1",
        id: "p-new-1",
        instagram: "@nss_sfs",
        linkedin: "nss-sfs",
        name: "NSS SFS",
      },
      {
        createdAt: NOW + 1,
        eventId: "event-1",
        id: "p-new-2",
        instagram: null,
        linkedin: null,
        name: "Ethos",
      },
    ]);
  });

  it("update writes volunteersNeeded and partners for a team lead", async () => {
    const db = createDb({
      teamEvent: [pastEvent({ volunteersNeeded: null })],
      teamMember: [leadMembership],
    });
    await run(teamEventMutators.update, db, leadCtx, {
      id: "event-1",
      now: NOW,
      partners,
      volunteersNeeded: 12,
    });
    expect(db.tables.teamEvent?.[0]?.volunteersNeeded).toBe(12);
    expect(db.tables.eventPartner?.map((p) => p.id)).toEqual([
      "p-new-1",
      "p-new-2",
    ]);
  });

  it("update rejects users without events.edit", async () => {
    const db = createDb({ teamEvent: [pastEvent()] });
    await expect(
      run(teamEventMutators.update, db, volunteerCtx, {
        id: "event-1",
        now: NOW,
        partners,
      })
    ).rejects.toThrow("Unauthorized");
    expect(db.tables.eventPartner).toHaveLength(0);
  });

  it("rejects more than six partners", () => {
    const result = teamEventMutators.update.validator?.["~standard"].validate({
      id: "event-1",
      now: NOW,
      partners: Array.from({ length: 7 }, (_, i) => ({
        id: `p-${i}`,
        name: `P${i}`,
      })),
    });
    expect(result && "issues" in result && result.issues?.length).toBeTruthy();
  });

  it("updateSeries 'this' on a virtual occurrence writes partners to the new exception", async () => {
    const series = pastEvent({
      id: "series-1",
      recurrenceRule: { rrule: "FREQ=WEEKLY" },
    });
    const db = createDb({ teamEvent: [series], teamMember: [leadMembership] });
    await run(teamEventMutators.updateSeries, db, leadCtx, {
      id: "series-1",
      mode: "this",
      newExceptionId: "exception-1",
      now: NOW,
      originalDate: "2027-01-14",
      partners,
      volunteersNeeded: 4,
    });
    expect(
      db.tables.teamEvent?.find((e) => e.id === "exception-1")
    ).toMatchObject({
      seriesId: "series-1",
      volunteersNeeded: 4,
    });
    expect(new Set(db.tables.eventPartner?.map((p) => p.eventId))).toEqual(
      new Set(["exception-1"])
    );
  });

  it("replaceEventPartners refuses a row owned by another team", async () => {
    const db = createDb({
      eventPartner: [{ eventId: "event-1", id: "p-old", name: "Old" }],
      teamEvent: [pastEvent({ teamId: "team-2" })],
    });
    await expect(
      replaceEventPartners(db.tx as never, "event-1", "team-1", partners, NOW)
    ).rejects.toThrow("does not belong to this team");
    expect(db.tables.eventPartner?.map((p) => p.id)).toEqual(["p-old"]);
  });

  describe("id collisions with another team's event", () => {
    const foreignPartner = { eventId: "foreign-1", id: "p-foreign", name: "F" };
    const foreignEvent = () =>
      pastEvent({
        id: "foreign-1",
        recurrenceRule: null,
        teamId: "team-2",
      });
    const series = () =>
      pastEvent({ id: "series-1", recurrenceRule: { rrule: "FREQ=WEEKLY" } });

    it("create rejects an id that already exists", async () => {
      const db = createDb({
        eventPartner: [foreignPartner],
        teamEvent: [foreignEvent()],
        teamMember: [leadMembership],
      });
      await expect(
        run(teamEventMutators.create, db, leadCtx, {
          id: "foreign-1",
          name: "Hijack",
          now: NOW,
          partners,
          startTime: NOW + HOUR,
          teamId: "team-1",
        })
      ).rejects.toThrow("Event id already exists");
      expect(db.tables.eventPartner).toEqual([foreignPartner]);
      expect(db.tables.teamEvent).toHaveLength(1);
    });

    it("updateSeries 'this' rejects a newExceptionId that already exists", async () => {
      const db = createDb({
        eventPartner: [foreignPartner],
        teamEvent: [series(), foreignEvent()],
        teamMember: [leadMembership],
      });
      await expect(
        run(teamEventMutators.updateSeries, db, leadCtx, {
          id: "series-1",
          mode: "this",
          newExceptionId: "foreign-1",
          now: NOW,
          originalDate: "2027-01-14",
          partners,
        })
      ).rejects.toThrow("Event id already exists");
      expect(db.tables.eventPartner).toEqual([foreignPartner]);
      expect(db.tables.teamEvent).toHaveLength(2);
    });

    it("updateSeries 'following' rejects a newSeriesId that already exists", async () => {
      const db = createDb({
        eventPartner: [foreignPartner],
        teamEvent: [series(), foreignEvent()],
        teamMember: [leadMembership],
      });
      await expect(
        run(teamEventMutators.updateSeries, db, leadCtx, {
          id: "series-1",
          mode: "following",
          newSeriesId: "foreign-1",
          now: NOW,
          originalDate: "2027-01-14",
          partners,
        })
      ).rejects.toThrow("Event id already exists");
      expect(db.tables.eventPartner).toEqual([foreignPartner]);
      expect(
        db.tables.teamEvent?.find((e) => e.id === "series-1")?.recurrenceRule
      ).toEqual({ rrule: "FREQ=WEEKLY" });
    });

    it("materialize rejects an id that already exists", async () => {
      const db = createDb({
        teamEvent: [series(), foreignEvent()],
        teamMember: [leadMembership],
      });
      await expect(
        run(teamEventMutators.materialize, db, leadCtx, {
          id: "foreign-1",
          now: NOW,
          originalDate: "2027-01-14",
          seriesId: "series-1",
        })
      ).rejects.toThrow("Event id already exists");
      expect(db.tables.teamEvent).toHaveLength(2);
    });
  });

  it("resolves the written row for each series edit mode", () => {
    const parent = { recurrenceRule: { rrule: "FREQ=WEEKLY" }, seriesId: null };
    const exception = { recurrenceRule: null, seriesId: "series-1" };
    expect(
      resolveSeriesWriteTarget({ id: "series-1", mode: "all" }, parent)
    ).toBe("series-1");
    expect(
      resolveSeriesWriteTarget(
        {
          id: "series-1",
          mode: "following",
          newSeriesId: "s2",
          originalDate: "2027-01-14",
        },
        parent
      )
    ).toBe("s2");
    expect(
      resolveSeriesWriteTarget(
        {
          id: "series-1",
          mode: "this",
          newExceptionId: "x1",
          originalDate: "2027-01-14",
        },
        parent
      )
    ).toBe("x1");
    expect(
      resolveSeriesWriteTarget({ id: "exc-1", mode: "this" }, exception)
    ).toBe("exc-1");
  });
});

describe("appConfig.remove", () => {
  it("requires settings.app_config", async () => {
    const db = createDb({
      appConfig: [{ key: "social_all_time_hours", value: "1" }],
    });
    await expect(
      run(appConfigMutators.remove, db, volunteerCtx, {
        key: "social_all_time_hours",
      })
    ).rejects.toThrow("Unauthorized");
    await run(appConfigMutators.remove, db, adminCtx, {
      key: "social_all_time_hours",
    });
    expect(db.tables.appConfig).toHaveLength(0);
  });
});
