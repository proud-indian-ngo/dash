import { db } from "@pi-dash/db";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { user } from "@pi-dash/db/schema/auth";
import { team } from "@pi-dash/db/schema/team";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { eq, inArray } from "drizzle-orm";

/**
 * A team of its own with one past two-hour session: a recap with 17
 * children, two volunteers present and one absent. Filtering Analytics →
 * Outcomes to the team shows only this session.
 */
const ID = {
  event: "019f0000-0040-7000-8000-000000004001",
  members: [
    "019f0000-0040-7000-8000-000000004002",
    "019f0000-0040-7000-8000-000000004003",
    "019f0000-0040-7000-8000-000000004004",
  ],
  team: "019f0000-0040-7000-8000-000000004000",
} as const;

const HOUR = 60 * 60 * 1000;
const VOLUNTEER_HOUR_VALUE_CONFIG_KEY = "volunteer_hour_value_paise";

async function cleanup() {
  await db
    .delete(appConfig)
    .where(eq(appConfig.key, VOLUNTEER_HOUR_VALUE_CONFIG_KEY));
  // The event and its members cascade with the team.
  await db.delete(team).where(eq(team.id, ID.team));
}

async function setup(emails: string[]) {
  await cleanup();
  const users = await db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.email, emails));
  if (users.length !== ID.members.length) {
    throw new Error("Outcomes fixture needs three seeded users");
  }
  const now = new Date();
  const start = now.getTime() - 3 * 24 * HOUR;
  await db.insert(team).values({
    createdAt: now,
    id: ID.team,
    name: "Outcomes E2E team",
    updatedAt: now,
  });
  await db.insert(teamEvent).values({
    childrenAttended: 17,
    createdAt: now,
    createdBy: users[0]?.id as string,
    endTime: new Date(start + 2 * HOUR),
    id: ID.event,
    name: "Outcomes E2E session",
    socialCompletedAt: new Date(start + 3 * HOUR),
    startTime: new Date(start),
    teamId: ID.team,
    updatedAt: now,
  });
  await db.insert(teamEventMember).values(
    users.map((u, i) => ({
      addedAt: now,
      attendance: i < 2 ? ("present" as const) : ("absent" as const),
      attendanceMarkedAt: now,
      eventId: ID.event,
      id: ID.members[i] as string,
      userId: u.id,
    }))
  );
  return { teamId: ID.team };
}

const [action, ...args] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "setup") {
  result = await setup(args);
} else {
  throw new Error(`Unsupported outcomes fixture action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
