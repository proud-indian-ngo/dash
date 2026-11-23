import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { eq, inArray } from "drizzle-orm";

/**
 * An event that started an hour ago in a team of its own with no members.
 * Its event members are an unoriented newcomer of its own, so promoting them
 * signs out no shared fixture user, and the given seeded users. Setup starts
 * from a clean slate.
 */
const ID = {
  event: "019f0000-0062-7000-8000-000000006201",
  newcomer: "019f0000-0062-7000-8000-000000006202",
  team: "019f0000-0062-7000-8000-000000006200",
} as const;
const NEWCOMER_EMAIL = "attendance-newcomer@pi-dash.test";

const HOUR = 60 * 60 * 1000;

async function cleanup() {
  // The event, its members and team members cascade with the team.
  await db.delete(team).where(eq(team.id, ID.team));
  await db.delete(user).where(eq(user.id, ID.newcomer));
}

async function userIds(emails: string[]) {
  const rows = await db
    .select({ email: user.email, id: user.id })
    .from(user)
    .where(inArray(user.email, emails));
  if (rows.length !== emails.length) {
    throw new Error("Attendance-team fixture needs the seeded users");
  }
  return rows;
}

async function setup(emails: string[]) {
  await cleanup();
  await db.insert(user).values({
    email: NEWCOMER_EMAIL,
    emailVerified: true,
    id: ID.newcomer,
    name: "Attendance Newcomer",
    role: "unoriented_volunteer",
  });
  const users = await userIds([NEWCOMER_EMAIL, ...emails]);
  const now = Date.now();
  await db.insert(team).values({
    createdAt: new Date(now),
    id: ID.team,
    name: "Attendance E2E team",
    updatedAt: new Date(now),
  });
  await db.insert(teamEvent).values({
    createdAt: new Date(now - 24 * HOUR),
    createdBy: ID.newcomer,
    endTime: new Date(now + HOUR),
    id: ID.event,
    isPublic: false,
    name: "Attendance E2E session",
    startTime: new Date(now - HOUR),
    teamId: ID.team,
    updatedAt: new Date(now - 24 * HOUR),
  });
  await db.insert(teamEventMember).values(
    users.map((u, i) => ({
      addedAt: new Date(now - 24 * HOUR),
      eventId: ID.event,
      id: `019f0000-0062-7000-8000-00000000621${i}`,
      userId: u.id,
    }))
  );
  return { eventId: ID.event, newcomerEmail: NEWCOMER_EMAIL };
}

/** The team's members and the event's attendees, with their roles. */
async function state() {
  const members = await db
    .select({ email: user.email, role: teamMember.role })
    .from(teamMember)
    .innerJoin(user, eq(user.id, teamMember.userId))
    .where(eq(teamMember.teamId, ID.team));
  const attendees = await db
    .select({
      attendance: teamEventMember.attendance,
      email: user.email,
      role: user.role,
    })
    .from(teamEventMember)
    .innerJoin(user, eq(user.id, teamEventMember.userId))
    .where(eq(teamEventMember.eventId, ID.event));
  return {
    attendees: attendees.toSorted((a, b) => a.email.localeCompare(b.email)),
    teamMembers: members.toSorted((a, b) => a.email.localeCompare(b.email)),
  };
}

const [action, ...args] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "setup" && args.length > 0) {
  result = await setup(args);
} else if (action === "state") {
  result = await state();
} else {
  throw new Error(
    `Unsupported attendance-team fixture action: ${action ?? ""}`
  );
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
