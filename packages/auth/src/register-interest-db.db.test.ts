import { describe, expect, it, vi } from "vitest";

/**
 * Database-backed check of the website sign-up materialiser. Opt in with
 * REGISTER_INTEREST_TEST_DATABASE_URL pointing at a local database
 * (localhost only). Uses synthetic rows and deletes them afterwards.
 */
const databaseUrl = process.env.REGISTER_INTEREST_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

vi.mock("@pi-dash/db", async () => {
  const url = process.env.REGISTER_INTEREST_TEST_DATABASE_URL;
  if (!url) {
    return { db: {} };
  }
  const { SQL } = await import("bun");
  const { drizzle } = await import("drizzle-orm/bun-sql");
  const schema = await import("@pi-dash/db/schema/index");
  return { db: drizzle({ client: new SQL(url, { max: 1 }), schema }) };
});
vi.mock("@pi-dash/jobs/enqueue", () => ({ enqueue: vi.fn() }));

import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { team } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { createDbRegisterInterestDeps } from "./register-interest-db";

const DAY = 24 * 60 * 60 * 1000;

describe("website sign-up materialiser", () => {
  it.skipIf(!localDatabase)(
    "starts a new session without the first session's recap",
    async () => {
      const ids = { series: uuidv7(), team: uuidv7(), user: uuidv7() };
      const now = Date.now();
      const firstStart = now - 7 * DAY;
      try {
        await db.insert(user).values({
          email: `${ids.user}@register-interest.test`,
          id: ids.user,
          name: "Register interest test",
        });
        await db.insert(team).values({
          createdAt: new Date(now),
          id: ids.team,
          name: `Register interest ${ids.team}`,
          updatedAt: new Date(now),
        });
        // The series parent is its own first session, already recapped.
        await db.insert(teamEvent).values({
          childrenAttended: 18,
          createdAt: new Date(now),
          createdBy: ids.user,
          endTime: new Date(firstStart + 2 * 60 * 60 * 1000),
          id: ids.series,
          isPublic: true,
          name: "Weekly class",
          recurrenceRule: { rrule: "FREQ=WEEKLY" },
          socialCompletedAt: new Date(firstStart + DAY),
          socialNotes: "Paper boats",
          startTime: new Date(firstStart),
          teamId: ids.team,
          updatedAt: new Date(now),
        });

        const nextStart = firstStart + 14 * DAY;
        const session =
          await createDbRegisterInterestDeps().materializeOccurrence({
            materializedId: uuidv7(),
            now,
            occurrence: {
              date: new Date(nextStart).toISOString().slice(0, 10),
              endTime: nextStart + 2 * 60 * 60 * 1000,
              startTime: nextStart,
            },
            series: {
              cancelledAt: null,
              endTime: firstStart + 2 * 60 * 60 * 1000,
              id: ids.series,
              isPublic: true,
              managementDomain: null,
              name: "Weekly class",
              recurrenceRule: { rrule: "FREQ=WEEKLY" },
              seriesId: null,
              startTime: firstStart,
              teamId: ids.team,
            },
            userId: ids.user,
          } as never);
        expect(session?.seriesId).toBe(ids.series);

        const [row] = await db
          .select({
            childrenAttended: teamEvent.childrenAttended,
            name: teamEvent.name,
            socialCompletedAt: teamEvent.socialCompletedAt,
            socialNotes: teamEvent.socialNotes,
          })
          .from(teamEvent)
          .where(eq(teamEvent.id, session?.id ?? ""));
        expect(row).toEqual({
          childrenAttended: null,
          name: "Weekly class",
          socialCompletedAt: null,
          socialNotes: null,
        });
      } finally {
        await db.delete(team).where(eq(team.id, ids.team));
        await db.delete(user).where(eq(user.id, ids.user));
      }
    }
  );

  it.skipIf(!localDatabase)(
    "files a sign-up for the start date on the series parent itself",
    async () => {
      const ids = { series: uuidv7(), team: uuidv7(), user: uuidv7() };
      const now = Date.now();
      const firstStart = now + 7 * DAY;
      const series = {
        cancelledAt: null,
        endTime: firstStart + 2 * 60 * 60 * 1000,
        id: ids.series,
        isPublic: true,
        managementDomain: null,
        name: "Weekly class",
        recurrenceRule: { rrule: "FREQ=WEEKLY" },
        seriesId: null,
        startTime: firstStart,
        teamId: ids.team,
      };
      try {
        await db.insert(user).values({
          email: `${ids.user}@register-interest.test`,
          id: ids.user,
          name: "Register interest test",
        });
        await db.insert(team).values({
          createdAt: new Date(now),
          id: ids.team,
          name: `Register interest ${ids.team}`,
          updatedAt: new Date(now),
        });
        await db.insert(teamEvent).values({
          createdAt: new Date(now),
          createdBy: ids.user,
          endTime: new Date(series.endTime),
          id: ids.series,
          isPublic: true,
          name: series.name,
          recurrenceRule: series.recurrenceRule,
          startTime: new Date(firstStart),
          teamId: ids.team,
          updatedAt: new Date(now),
        });

        const session =
          await createDbRegisterInterestDeps().materializeOccurrence({
            materializedId: uuidv7(),
            now,
            occurrence: {
              date: new Date(firstStart).toISOString().slice(0, 10),
              endTime: series.endTime,
              startTime: firstStart,
            },
            series,
            userId: ids.user,
          } as never);
        expect(session?.id).toBe(ids.series);
        const rows = await db
          .select({ id: teamEvent.id })
          .from(teamEvent)
          .where(eq(teamEvent.seriesId, ids.series));
        expect(rows).toEqual([]);
      } finally {
        await db.delete(team).where(eq(team.id, ids.team));
        await db.delete(user).where(eq(user.id, ids.user));
      }
    }
  );
});
