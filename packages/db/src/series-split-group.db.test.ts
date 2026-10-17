import { SQL } from "bun";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "./schema";
import { user } from "./schema/auth";
import { team } from "./schema/team";
import { teamEvent } from "./schema/team-event";
import { whatsappGroup } from "./schema/whatsapp-group";

/**
 * A "this and following" split against the real
 * `team_event_whatsappGroupId_uidx` (one series row per group). Opt in with
 * SERIES_SPLIT_TEST_DATABASE_URL pointing at a local database; every test
 * transaction is rolled back.
 */
const databaseUrl = process.env.SERIES_SPLIT_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

type Database = ReturnType<typeof drizzle<typeof schema>>;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function inRolledBackTransaction(run: (tx: Tx) => Promise<void>) {
  const client = new SQL(databaseUrl as string, { max: 1 });
  const database = drizzle({ client, schema });
  try {
    await database.transaction(async (tx) => {
      await run(tx);
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

async function seriesWithGroup(tx: Tx) {
  const ids = {
    group: uuidv7(),
    series: uuidv7(),
    team: uuidv7(),
    user: uuidv7(),
  };
  await tx.insert(user).values({
    email: `${ids.user}@series-split.test`,
    id: ids.user,
    name: "Series split test",
  });
  await tx.insert(team).values({
    createdAt: NOW,
    id: ids.team,
    name: `Series split ${ids.team}`,
    updatedAt: NOW,
  });
  await tx.insert(whatsappGroup).values({
    createdAt: NOW,
    id: ids.group,
    jid: `${ids.group}@g.us`,
    name: "Series split group",
    updatedAt: NOW,
  });
  await tx.insert(teamEvent).values({
    createdAt: NOW,
    createdBy: ids.user,
    id: ids.series,
    name: "Weekly class",
    recurrenceRule: { rrule: "FREQ=WEEKLY" },
    startTime: NOW,
    teamId: ids.team,
    updatedAt: NOW,
    whatsappGroupId: ids.group,
  });
  const newSeries = (id: string) => ({
    createdAt: NOW,
    createdBy: ids.user,
    id,
    name: "Weekly class",
    recurrenceRule: { rrule: "FREQ=WEEKLY" },
    startTime: new Date(NOW.getTime() + 14 * 86_400_000),
    teamId: ids.team,
    updatedAt: NOW,
    whatsappGroupId: ids.group,
  });
  return { ids, newSeries };
}

it.skipIf(!localDatabase)(
  "a second series row on the same group breaks the unique index",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { newSeries } = await seriesWithGroup(tx);
      // What a split did before: the old series kept the group.
      await expect(
        tx.insert(teamEvent).values(newSeries(uuidv7()))
      ).rejects.toThrow();
    });
  }
);

it.skipIf(!localDatabase)(
  "the split hands the group over: old row cleared first, then the new one",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { ids, newSeries } = await seriesWithGroup(tx);
      const next = uuidv7();
      await tx
        .update(teamEvent)
        .set({ whatsappGroupId: null })
        .where(eq(teamEvent.id, ids.series));
      await tx.insert(teamEvent).values(newSeries(next));
      const [row] = await tx
        .select({ group: teamEvent.whatsappGroupId })
        .from(teamEvent)
        .where(eq(teamEvent.id, next));
      expect(row?.group).toBe(ids.group);
    });
  }
);
