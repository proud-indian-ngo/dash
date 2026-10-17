import {
  summarizeOutcomes,
  unsavedSessionRows,
} from "@pi-dash/shared/outcomes";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

import { loadOutcomeRows, loadOutcomeSeriesParents } from "./queries/outcomes";
// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "./schema";
import { user } from "./schema/auth";
import { programme } from "./schema/finance-dimensions";
import { team } from "./schema/team";
import { teamEvent, teamEventMember } from "./schema/team-event";

/**
 * Database-backed outcome aggregates. Opt in with OUTCOMES_TEST_DATABASE_URL
 * pointing at a local database (localhost only). Every test transaction is
 * rolled back and uses synthetic records only.
 */

const databaseUrl = process.env.OUTCOMES_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

type Tx = Parameters<typeof loadOutcomeRows>[1] &
  Pick<ReturnType<typeof drizzle<typeof schema>>, "insert">;

async function inRolledBackTransaction(run: (tx: Tx) => Promise<void>) {
  const client = new SQL(databaseUrl as string, { max: 1 });
  const database = drizzle({ client, schema });
  try {
    await database.transaction(async (tx) => {
      await run(tx as unknown as Tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  } finally {
    await client.close();
  }
}

const NOW = new Date("2026-10-14T06:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

type EventValues = Partial<typeof teamEvent.$inferInsert>;
type Attendance = "present" | "absent" | null;

async function seed(tx: Tx) {
  const ids = {
    programme: uuidv7(),
    teamA: uuidv7(),
    teamB: uuidv7(),
  };
  const users = Array.from({ length: 5 }, () => uuidv7());
  await tx.insert(user).values(
    users.map((id) => ({
      email: `${id}@outcomes.test`,
      id,
      name: `Outcomes ${id}`,
    }))
  );
  await tx.insert(programme).values({
    code: `OUT${ids.programme.slice(-6)}`,
    createdAt: NOW,
    id: ids.programme,
    name: `Outcomes ${ids.programme}`,
    updatedAt: NOW,
  });
  await tx.insert(team).values([
    { createdAt: NOW, id: ids.teamA, name: `A ${ids.teamA}`, updatedAt: NOW },
    { createdAt: NOW, id: ids.teamB, name: `B ${ids.teamB}`, updatedAt: NOW },
  ]);

  async function event(values: EventValues, attendance: Attendance[] = []) {
    const id = values.id ?? uuidv7();
    await tx.insert(teamEvent).values({
      createdAt: NOW,
      createdBy: users[0] as string,
      id,
      name: "Session",
      programmeId: ids.programme,
      startTime: at(-2 * DAY),
      teamId: ids.teamA,
      updatedAt: NOW,
      ...values,
    });
    if (attendance.length > 0) {
      await tx.insert(teamEventMember).values(
        attendance.map((status, i) => ({
          addedAt: NOW,
          attendance: status,
          eventId: id,
          id: uuidv7(),
          userId: users[i] as string,
        }))
      );
    }
    return id;
  }

  return { event, ids };
}

const recap = { socialCompletedAt: at(-DAY) };

it.skipIf(!localDatabase)(
  "counts held events, children and present volunteer time without fan-out",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { event, ids } = await seed(tx);
      // Two hours, 3 present of 5: 6 volunteer hours, 12 children (not 60).
      await event(
        {
          childrenAttended: 12,
          endTime: at(-2 * DAY + 2 * HOUR),
          ...recap,
        },
        ["present", "present", "present", "absent", null]
      );
      // Recap undone: its number stays on the row but isn't counted; still
      // 2 present × 1.5 hours.
      await event(
        {
          childrenAttended: 40,
          endTime: at(-3 * DAY + 1.5 * HOUR),
          startTime: at(-3 * DAY),
        },
        ["present", "present"]
      );
      // Team B, no end time: children count, hours don't.
      await event({ childrenAttended: 5, teamId: ids.teamB, ...recap }, [
        "present",
        "present",
      ]);
      // A recap for a session without children: not missing, adds nothing.
      await event({ endTime: at(-2 * DAY + HOUR), ...recap }, ["present"]);
      // No members, and members with nothing marked: no attendance.
      await event({ endTime: at(-2 * DAY + HOUR), ...recap });
      await event({ endTime: at(-2 * DAY + HOUR), ...recap }, [null, null]);
      // A series parent is its first session; a saved occurrence counts too.
      const parent = await event(
        {
          childrenAttended: 50,
          endTime: at(-30 * DAY + HOUR),
          recurrenceRule: { rrule: "FREQ=WEEKLY" },
          startTime: at(-30 * DAY),
          ...recap,
        },
        ["present"]
      );
      await event(
        {
          childrenAttended: 4,
          endTime: at(-DAY + HOUR),
          originalDate: "2026-10-13",
          seriesId: parent,
          startTime: at(-DAY),
          ...recap,
        },
        ["present"]
      );
      // Excluded: cancelled, not over yet, Kalakriti-managed, out of range.
      await event(
        {
          cancelledAt: at(-DAY),
          childrenAttended: 99,
          endTime: at(-2 * DAY + HOUR),
          ...recap,
        },
        ["present"]
      );
      await event({ endTime: at(HOUR), startTime: at(-HOUR) }, [
        "present",
        "present",
      ]);
      await event({ endTime: at(2 * DAY), startTime: at(DAY) }, ["present"]);
      await event(
        {
          childrenAttended: 7,
          endTime: at(-2 * DAY + HOUR),
          managementDomain: "kalakriti",
          ...recap,
        },
        ["present"]
      );
      await event(
        {
          childrenAttended: 30,
          endTime: at(-60 * DAY + HOUR),
          startTime: at(-60 * DAY),
          ...recap,
        },
        ["present"]
      );

      const rows = await loadOutcomeRows(
        { from: at(-45 * DAY), now: NOW, programmeId: ids.programme, to: NOW },
        tx
      );
      const summary = summarizeOutcomes(rows, 250_00);

      expect(summary.totals).toMatchObject({
        children: 71,
        events: 8,
        valuePaise: 12 * 250_00,
        volunteerHours: 12,
        withoutAttendance: 2,
        withoutEndTime: 1,
        withoutRecap: 1,
      });
      expect(summary.byTeam.find((l) => l.key === ids.teamB)).toMatchObject({
        children: 5,
        events: 1,
        volunteerHours: 0,
      });

      const teamB = await loadOutcomeRows(
        {
          now: NOW,
          programmeId: ids.programme,
          teamId: ids.teamB,
        },
        tx
      );
      expect(teamB).toHaveLength(1);
      expect(teamB[0]).toMatchObject({ children: 5, events: 1 });
    });
  }
);

it.skipIf(!localDatabase)(
  "counts one first session when a legacy row sits on the series' start date",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { event, ids } = await seed(tx);
      const start = at(-10 * DAY);
      const firstDate = start.toISOString().slice(0, 10);
      const weekly = { rrule: "FREQ=WEEKLY" };
      // The legacy row stands for the first session; its parent doesn't.
      const parent = await event(
        {
          childrenAttended: 5,
          endTime: at(-10 * DAY + HOUR),
          recurrenceRule: weekly,
          startTime: start,
          ...recap,
        },
        ["present"]
      );
      await event(
        {
          childrenAttended: 6,
          endTime: at(-10 * DAY + HOUR),
          originalDate: firstDate,
          seriesId: parent,
          startTime: start,
          ...recap,
        },
        ["present", "present"]
      );
      // A cancelled legacy row cancels the first session: neither counts.
      const cancelledFirst = await event(
        {
          childrenAttended: 9,
          endTime: at(-10 * DAY + HOUR),
          recurrenceRule: weekly,
          startTime: start,
          teamId: ids.teamB,
          ...recap,
        },
        ["present"]
      );
      await event({
        cancelledAt: at(-11 * DAY),
        originalDate: firstDate,
        seriesId: cancelledFirst,
        startTime: start,
        teamId: ids.teamB,
      });

      const rows = await loadOutcomeRows(
        { now: NOW, programmeId: ids.programme },
        tx
      );
      expect(summarizeOutcomes(rows, null).totals).toMatchObject({
        children: 6,
        events: 1,
        volunteerHours: 2,
      });
    });
  }
);

it.skipIf(!localDatabase)(
  "adds the past sessions of a series that nobody saved",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { event, ids } = await seed(tx);
      const start = at(-28 * DAY);
      const weekly = { rrule: "FREQ=WEEKLY" };
      // The first session (the parent) and the third, saved with a recap.
      const parent = await event(
        {
          childrenAttended: 5,
          endTime: at(-28 * DAY + HOUR),
          recurrenceRule: weekly,
          startTime: start,
          ...recap,
        },
        ["present"]
      );
      await event(
        {
          childrenAttended: 7,
          endTime: at(-14 * DAY + HOUR),
          originalDate: at(-14 * DAY)
            .toISOString()
            .slice(0, 10),
          seriesId: parent,
          startTime: at(-14 * DAY),
          ...recap,
        },
        ["present"]
      );
      // A cancelled series adds nothing.
      await event({
        cancelledAt: at(-30 * DAY),
        endTime: at(-28 * DAY + HOUR),
        recurrenceRule: weekly,
        startTime: start,
        teamId: ids.teamB,
      });

      const filters = { now: NOW, programmeId: ids.programme };
      const parents = await loadOutcomeSeriesParents(filters, tx);
      expect(parents).toHaveLength(1);
      const rows = [
        ...(await loadOutcomeRows(filters, tx)),
        ...unsavedSessionRows(parents, { from: null, to: null }, NOW.getTime()),
      ];
      // Saved: the parent and the third session. Unsaved and over: the
      // second and the fourth, a week ago. The fifth starts at NOW and
      // hasn't ended, so it isn't held yet.
      expect(summarizeOutcomes(rows, null).totals).toMatchObject({
        children: 12,
        events: 4,
        volunteerHours: 2,
        withoutAttendance: 2,
        withoutRecap: 2,
      });
    });
  }
);
