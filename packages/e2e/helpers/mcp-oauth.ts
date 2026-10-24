import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { eventInterest } from "@pi-dash/db/schema/event-interest";
import { oauthClient } from "@pi-dash/db/schema/private/oauth";
import { team } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { and, eq } from "drizzle-orm";

/**
 * Rows for the connected-assistant spec: its own team (so the volunteer is
 * not a member) with one public session far in the future, and the OAuth
 * client the spec registers as "E2E Assistant".
 */
const TEAM_ID = "019f0000-0022-7000-8000-000000002300";
const EVENT_ID = "019f0000-0022-7000-8000-000000002301";
export const CLIENT_NAME = "E2E Assistant";

async function cleanup() {
  // Interests cascade with the event; consents and tokens with the client.
  await db.delete(teamEvent).where(eq(teamEvent.id, EVENT_ID));
  await db.delete(team).where(eq(team.id, TEAM_ID));
  await db.delete(oauthClient).where(eq(oauthClient.name, CLIENT_NAME));
}

async function setup(creatorEmail: string) {
  await cleanup();
  const creator = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, creatorEmail),
  });
  if (!creator) {
    throw new Error("The connected-assistant fixture needs a creator");
  }
  const now = new Date();
  await db.insert(team).values({
    createdAt: now,
    id: TEAM_ID,
    name: "E2E Assistant Team",
    updatedAt: now,
  });
  await db.insert(teamEvent).values({
    createdAt: now,
    createdBy: creator.id,
    id: EVENT_ID,
    isPublic: true,
    name: "Assistant connected session",
    publicArea: "Iblur",
    startTime: new Date("2096-12-01T04:30:00.000Z"),
    teamId: TEAM_ID,
    updatedAt: now,
  });
  return { eventId: EVENT_ID };
}

/** The volunteer's interest in the fixture session. */
async function state(email: string) {
  const volunteer = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });
  const [interest] = volunteer
    ? await db
        .select({ status: eventInterest.status })
        .from(eventInterest)
        .where(
          and(
            eq(eventInterest.eventId, EVENT_ID),
            eq(eventInterest.userId, volunteer.id)
          )
        )
    : [];
  return { interestStatus: interest?.status ?? null };
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
  throw new Error(`Unsupported connected-assistant fixture action: ${action}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
