import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { team, teamMember } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { and, eq } from "drizzle-orm";

/**
 * Two events that started an hour ago, in a team of their own that the
 * volunteer leads without `events.cancel`. The volunteer is an event member
 * of `joined` and not of `other`. Setup starts from a clean slate.
 */
const ID = {
  joined: "019f0000-0061-7000-8000-000000006101",
  other: "019f0000-0061-7000-8000-000000006102",
  team: "019f0000-0061-7000-8000-000000006100",
} as const;

const HOUR = 60 * 60 * 1000;

async function cleanup() {
  // Events and their members cascade with the team.
  await db.delete(team).where(eq(team.id, ID.team));
}

async function volunteerId(email: string) {
  const volunteer = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });
  if (!volunteer) {
    throw new Error("Started-event fixture needs the seeded volunteer");
  }
  return volunteer.id;
}

async function setup(email: string) {
  await cleanup();
  const userId = await volunteerId(email);
  const now = Date.now();
  await db.insert(team).values({
    createdAt: new Date(now),
    id: ID.team,
    name: "Started event E2E team",
    updatedAt: new Date(now),
  });
  await db.insert(teamMember).values({
    id: "019f0000-0061-7000-8000-000000006110",
    joinedAt: new Date(now),
    role: "lead",
    teamId: ID.team,
    userId,
  });
  const event = (id: string, name: string) => ({
    createdAt: new Date(now - 24 * HOUR),
    createdBy: userId,
    endTime: new Date(now + HOUR),
    id,
    isPublic: true,
    name,
    startTime: new Date(now - HOUR),
    teamId: ID.team,
    updatedAt: new Date(now - 24 * HOUR),
  });
  await db
    .insert(teamEvent)
    .values([
      event(ID.joined, "Started E2E session"),
      event(ID.other, "Started E2E other session"),
    ]);
  await db.insert(teamEventMember).values({
    addedAt: new Date(now - 24 * HOUR),
    eventId: ID.joined,
    id: "019f0000-0061-7000-8000-000000006120",
    userId,
  });
  return { joinedEventId: ID.joined, otherEventId: ID.other };
}

/** What the refused mutations would have changed. */
async function state(email: string) {
  const userId = await volunteerId(email);
  const memberOf = async (eventId: string) =>
    (
      await db
        .select({ id: teamEventMember.id })
        .from(teamEventMember)
        .where(
          and(
            eq(teamEventMember.eventId, eventId),
            eq(teamEventMember.userId, userId)
          )
        )
    ).length > 0;
  const joined = await db.query.teamEvent.findFirst({
    columns: { cancelledAt: true },
    where: eq(teamEvent.id, ID.joined),
  });
  return {
    joinedCancelled: Boolean(joined?.cancelledAt),
    memberOfJoined: await memberOf(ID.joined),
    memberOfOther: await memberOf(ID.other),
  };
}

const [action, argument] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "setup" && argument) {
  result = await setup(argument);
} else if (action === "state" && argument) {
  result = await state(argument);
} else {
  throw new Error(`Unsupported started-event fixture action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
