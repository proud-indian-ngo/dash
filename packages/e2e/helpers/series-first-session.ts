import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

/**
 * A weekly series on its own team whose first session was four weeks ago,
 * led by the given user, who is also its volunteer (copied to each saved
 * session). Two upcoming sessions are saved: one in a week (the split point
 * for "this and following") and the one after. `record` gives the first
 * session a recap and saves the second with the volunteer present.
 */
const ID = {
  lead: "019f0000-0050-7000-8000-000000005001",
  member: "019f0000-0050-7000-8000-000000005002",
  split: "019f0000-0050-7000-8000-000000005003",
  splitMember: "019f0000-0050-7000-8000-000000005004",
  later: "019f0000-0050-7000-8000-000000005005",
  past: "019f0000-0050-7000-8000-000000005007",
  pastMember: "019f0000-0050-7000-8000-000000005008",
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
    splitDate: utcDate(start + 35 * DAY),
    splitStart: start + 35 * DAY,
    pastDate: utcDate(start + 7 * DAY),
    seriesId: ID.series,
    splitId: ID.split,
  };
}

async function record() {
  const series = await db.query.teamEvent.findFirst({
    columns: { createdBy: true, startTime: true },
    where: eq(teamEvent.id, ID.series),
  });
  if (!series) {
    throw new Error("Run setup first");
  }
  const now = new Date();
  const at = series.startTime.getTime() + 7 * DAY;
  await db
    .update(teamEvent)
    .set({ childrenAttended: 9, socialCompletedAt: now })
    .where(eq(teamEvent.id, ID.series));
  await db.insert(teamEvent).values({
    createdAt: now,
    createdBy: series.createdBy,
    endTime: new Date(at + 2 * HOUR),
    id: ID.past,
    name: "Series E2E class",
    originalDate: utcDate(at),
    seriesId: ID.series,
    startTime: new Date(at),
    teamId: ID.team,
    updatedAt: now,
  });
  await db.insert(teamEventMember).values({
    addedAt: now,
    attendance: "present",
    eventId: ID.past,
    id: ID.pastMember,
    userId: series.createdBy,
  });
  return { recorded: true };
}

async function inspect(pastDate: string) {
  const rows = await db
    .select({
      cancelledAt: teamEvent.cancelledAt,
      childrenAttended: teamEvent.childrenAttended,
      id: teamEvent.id,
      originalDate: teamEvent.originalDate,
      recurrenceRule: teamEvent.recurrenceRule,
      seriesId: teamEvent.seriesId,
      socialCompletedAt: teamEvent.socialCompletedAt,
      startTime: teamEvent.startTime,
    })
    .from(teamEvent)
    .where(eq(teamEvent.teamId, ID.team));
  const members = await db
    .select({
      attendance: teamEventMember.attendance,
      eventId: teamEventMember.eventId,
    })
    .from(teamEventMember)
    .innerJoin(teamEvent, eq(teamEvent.id, teamEventMember.eventId))
    .where(eq(teamEvent.teamId, ID.team));
  const membersOf = (id: string | undefined) =>
    members.filter((m) => m.eventId === id);
  const past = rows.find(
    (r) => r.seriesId === ID.series && r.originalDate === pastDate
  );
  const byId = (id: string) => rows.find((r) => r.id === id);
  const newSeries = rows.find((r) => r.seriesId === null && r.id !== ID.series);
  const cancelled = (row: { cancelledAt: Date | null } | undefined) =>
    row?.cancelledAt != null;
  const seriesRow = byId(ID.series);
  const firstRow = seriesRow
    ? rows.find(
        (r) =>
          r.seriesId === ID.series &&
          r.originalDate === utcDate(seriesRow.startTime.getTime())
      )
    : undefined;
  return {
    cancelled: {
      later: cancelled(byId(ID.later)),
      past: cancelled(past),
      series: cancelled(seriesRow),
      split: cancelled(byId(ID.split)),
    },
    firstRow: firstRow ? { cancelled: cancelled(firstRow) } : null,
    later: { seriesId: byId(ID.later)?.seriesId ?? null },
    newSeries: newSeries
      ? { id: newSeries.id, members: membersOf(newSeries.id).length }
      : null,
    oldRule:
      (byId(ID.series)?.recurrenceRule as { rrule?: string } | null)?.rrule ??
      null,
    past: past
      ? { attendance: membersOf(past.id).map((m) => m.attendance), id: past.id }
      : null,
    series: {
      childrenAttended: byId(ID.series)?.childrenAttended ?? null,
      recapReady: byId(ID.series)?.socialCompletedAt !== null,
    },
    seriesRows: rows.filter((r) => r.seriesId === null).length,
    split: {
      members: membersOf(ID.split).length,
      seriesId: byId(ID.split)?.seriesId ?? null,
      startTime: byId(ID.split)?.startTime.getTime() ?? null,
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
} else if (action === "record") {
  result = await record();
} else if (action === "inspect" && argument) {
  result = await inspect(argument);
} else {
  throw new Error(`Unsupported series fixture action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
