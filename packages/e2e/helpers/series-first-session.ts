import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

/**
 * A weekly series on its own team whose first session was four weeks ago,
 * led by the given user, who is also its volunteer (copied to each saved
 * session). Two upcoming sessions are saved: one in a week (the split point
 * for "this and following") and the one after.
 */
const ID = {
  lead: "019f0000-0050-7000-8000-000000005001",
  member: "019f0000-0050-7000-8000-000000005002",
  split: "019f0000-0050-7000-8000-000000005003",
  splitMember: "019f0000-0050-7000-8000-000000005004",
  later: "019f0000-0050-7000-8000-000000005005",
  series: "019f0000-0050-7000-8000-000000005006",
  team: "019f0000-0050-7000-8000-000000005000",
} as const;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function firstStart() {
  const now = new Date();
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 28,
    4,
    30
  );
}

async function cleanup() {
  // Sessions and members cascade with the team.
  await db.delete(team).where(eq(team.id, ID.team));
}

async function setup(email: string) {
  await cleanup();
  const person = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });
  if (!person) {
    throw new Error("Series fixture needs the seeded user");
  }
  const now = new Date();
  const start = firstStart();
  const session = (id: string, at: number) => ({
    createdAt: now,
    createdBy: person.id,
    endTime: new Date(at + 2 * HOUR),
    id,
    inheritVolunteers: true,
    name: "Series E2E class",
    originalDate: utcDate(at),
    seriesId: ID.series,
    startTime: new Date(at),
    teamId: ID.team,
    updatedAt: now,
  });
  await db.insert(team).values({
    createdAt: now,
    id: ID.team,
    name: "Series E2E team",
    updatedAt: now,
  });
  await db.insert(teamMember).values({
    id: ID.lead,
    joinedAt: now,
    role: "lead",
    teamId: ID.team,
    userId: person.id,
  });
  await db.insert(teamEvent).values({
    createdAt: now,
    createdBy: person.id,
    endTime: new Date(start + 2 * HOUR),
    id: ID.series,
    inheritVolunteers: true,
    name: "Series E2E class",
    recurrenceRule: { rrule: "FREQ=WEEKLY" },
    startTime: new Date(start),
    teamId: ID.team,
    updatedAt: now,
  });
  await db
    .insert(teamEvent)
    .values([
      session(ID.split, start + 35 * DAY),
      session(ID.later, start + 42 * DAY),
    ]);
  await db.insert(teamEventMember).values([
    { addedAt: now, eventId: ID.series, id: ID.member, userId: person.id },
    {
      addedAt: now,
      eventId: ID.split,
      id: ID.splitMember,
      userId: person.id,
    },
  ]);
  return {
    firstDate: utcDate(start),
    pastDate: utcDate(start + 7 * DAY),
    seriesId: ID.series,
    splitId: ID.split,
  };
}

async function inspect(pastDate: string) {
  const rows = await db
    .select({
      childrenAttended: teamEvent.childrenAttended,
      id: teamEvent.id,
      originalDate: teamEvent.originalDate,
      recurrenceRule: teamEvent.recurrenceRule,
      seriesId: teamEvent.seriesId,
      socialCompletedAt: teamEvent.socialCompletedAt,
    })
    .from(teamEvent)
    .where(eq(teamEvent.teamId, ID.team));
  const past = rows.find(
    (r) => r.seriesId === ID.series && r.originalDate === pastDate
  );
  const attendance = past
    ? await db
        .select({ attendance: teamEventMember.attendance })
        .from(teamEventMember)
        .where(eq(teamEventMember.eventId, past.id))
    : [];
  const byId = (id: string) => rows.find((r) => r.id === id);
  return {
    later: { seriesId: byId(ID.later)?.seriesId ?? null },
    past: past
      ? { attendance: attendance.map((a) => a.attendance), id: past.id }
      : null,
    series: {
      childrenAttended: byId(ID.series)?.childrenAttended ?? null,
      recapReady: byId(ID.series)?.socialCompletedAt !== null,
    },
    sessions: rows.length,
    split: {
      recurring: byId(ID.split)?.recurrenceRule !== null,
      seriesId: byId(ID.split)?.seriesId ?? null,
    },
  };
}

const [action, argument] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "setup" && argument) {
  result = await setup(argument);
} else if (action === "inspect" && argument) {
  result = await inspect(argument);
} else {
  throw new Error(`Unsupported series fixture action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
