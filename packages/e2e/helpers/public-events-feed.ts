import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { team } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq, inArray, sql } from "drizzle-orm";

/**
 * Rows for the public events feed spec, dated relative to now: one listed
 * event plus one of each kind the feed must leave out, and a weekly series
 * with a moved and a cancelled session.
 */
const ID = {
  cancelled: "019f0000-0020-7000-8000-000000002002",
  kalakriti: "019f0000-0020-7000-8000-000000002003",
  listed: "019f0000-0020-7000-8000-000000002001",
  moved: "019f0000-0020-7000-8000-000000002007",
  mumbai: "019f0000-0020-7000-8000-000000002004",
  private: "019f0000-0020-7000-8000-000000002005",
  series: "019f0000-0020-7000-8000-000000002006",
  skipped: "019f0000-0020-7000-8000-000000002008",
} as const;

/** Dashboard "Show Interest" on one session; its own team and series. */
const SESSION = {
  series: "019f0000-0020-7000-8000-000000002101",
  team: "019f0000-0020-7000-8000-000000002100",
} as const;

// A jsonb object, as the app writes it (Drizzle on bun-sql would store a
// JSON string instead).
const WEEKLY = sql<{ rrule: string }>`'{"rrule":"FREQ=WEEKLY"}'::jsonb`;

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const dateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function cleanup() {
  // Exceptions cascade with their series.
  await db.delete(teamEvent).where(inArray(teamEvent.id, Object.values(ID)));
}

async function setup(creatorEmail: string) {
  await cleanup();
  const creator = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, creatorEmail),
  });
  const owningTeam = await db.query.team.findFirst({
    columns: { id: true, name: true },
  });
  if (!(creator && owningTeam)) {
    throw new Error("Public feed fixture requires a creator and owning team");
  }
  const now = new Date();
  // 10:00 IST today; the series started two weeks ago on this weekday.
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    4,
    30
  );
  const base = {
    createdAt: now,
    createdBy: creator.id,
    isPublic: true,
    location: "https://maps.google.com/?q=12.9,77.6 Flat 4B, Secret Road",
    teamId: owningTeam.id,
    updatedAt: now,
  };
  const at = (ms: number) => ({
    endTime: new Date(ms + 2 * HOUR),
    startTime: new Date(ms),
  });
  await db.insert(teamEvent).values([
    {
      ...base,
      ...at(today + 3 * DAY),
      description: "Help with maths. Call +91 98765 43210.",
      id: ID.listed,
      name: "Public feed E2E listed",
      publicArea: "Iblur",
    },
    {
      ...base,
      ...at(today + 3 * DAY),
      cancelledAt: now,
      id: ID.cancelled,
      name: "Public feed E2E cancelled",
    },
    {
      ...base,
      ...at(today + 3 * DAY),
      id: ID.kalakriti,
      managementDomain: "kalakriti",
      name: "Public feed E2E kalakriti",
    },
    {
      ...base,
      ...at(today + 3 * DAY),
      city: "mumbai",
      id: ID.mumbai,
      name: "Public feed E2E mumbai",
    },
    {
      ...base,
      ...at(today + 3 * DAY),
      id: ID.private,
      isPublic: false,
      name: "Public feed E2E private",
    },
    {
      ...base,
      ...at(today - 14 * DAY),
      id: ID.series,
      name: "Public feed E2E weekly",
      publicArea: "HSR Layout",
      recurrenceRule: WEEKLY,
    },
  ]);
  const movedDate = today + 7 * DAY;
  const skippedDate = today + 14 * DAY;
  await db.insert(teamEvent).values([
    {
      ...base,
      ...at(movedDate + 5 * HOUR),
      id: ID.moved,
      name: "Public feed E2E weekly (moved)",
      originalDate: dateKey(movedDate),
      seriesId: ID.series,
    },
    {
      ...base,
      ...at(skippedDate),
      cancelledAt: now,
      id: ID.skipped,
      name: "Public feed E2E weekly",
      originalDate: dateKey(skippedDate),
      seriesId: ID.series,
    },
  ]);
  return {
    ids: ID,
    movedStart: new Date(movedDate + 5 * HOUR).toISOString(),
    skippedDate: dateKey(skippedDate),
    teamName: owningTeam.name,
    virtualDate: dateKey(today + 21 * DAY),
  };
}

async function sessionCleanup() {
  // Events (and their sessions and interests) cascade with the team.
  await db.delete(team).where(eq(team.id, SESSION.team));
}

async function sessionSetup(creatorEmail: string) {
  await sessionCleanup();
  const creator = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, creatorEmail),
  });
  if (!creator) {
    throw new Error("Session interest fixture requires a creator");
  }
  const now = new Date();
  await db.insert(team).values({
    createdAt: now,
    id: SESSION.team,
    name: "Public feed E2E session team",
    updatedAt: now,
  });
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 14,
    4,
    30
  );
  await db.insert(teamEvent).values({
    createdAt: now,
    createdBy: creator.id,
    endTime: new Date(start + 2 * HOUR),
    id: SESSION.series,
    isPublic: true,
    name: "Public feed E2E session series",
    recurrenceRule: WEEKLY,
    startTime: new Date(start),
    teamId: SESSION.team,
    updatedAt: now,
  });
  return { occDate: dateKey(start + 21 * DAY), seriesId: SESSION.series };
}

const [action, argument] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "setup" && argument) {
  result = await setup(argument);
} else if (action === "session-cleanup") {
  await sessionCleanup();
  result = { cleaned: true };
} else if (action === "session-setup" && argument) {
  result = await sessionSetup(argument);
} else {
  throw new Error(`Unsupported public feed fixture action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
