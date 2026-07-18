import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAssignment,
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { and, eq } from "drizzle-orm";

const FIXTURE = {
  editionId: "019f0000-0019-7000-8000-000000001971",
  eventId: "019f0000-0019-7000-8000-000000001972",
  year: 2093,
} as const;
const EMAIL = process.env.VOLUNTEER_EMAIL ?? "test-volunteer@pi-dash.test";

async function getUserId(email: string): Promise<string> {
  const record = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });
  if (!record) {
    throw new Error(`Missing E2E user: ${email}`);
  }
  return record.id;
}

async function cleanup() {
  await db
    .delete(kalakritiAssignment)
    .where(eq(kalakritiAssignment.editionId, FIXTURE.editionId));
  await db
    .delete(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.editionId, FIXTURE.editionId));
  await db
    .delete(teamEventMember)
    .where(eq(teamEventMember.eventId, FIXTURE.eventId));
  await db
    .delete(kalakritiEdition)
    .where(eq(kalakritiEdition.id, FIXTURE.editionId));
  await db.delete(teamEvent).where(eq(teamEvent.id, FIXTURE.eventId));
}

async function setup(email: string) {
  await cleanup();
  const [creatorId, owningTeam] = await Promise.all([
    getUserId(email),
    db.query.team.findFirst({ columns: { id: true } }),
  ]);
  if (!owningTeam) {
    throw new Error("Volunteer assignment fixture requires an owning team");
  }
  const now = new Date();
  await db.insert(teamEvent).values({
    createdAt: now,
    createdBy: creatorId,
    id: FIXTURE.eventId,
    managementDomain: "kalakriti",
    name: `Kalakriti ${FIXTURE.year}`,
    startTime: new Date(`${FIXTURE.year}-11-20T04:30:00.000Z`),
    teamId: owningTeam.id,
    updatedAt: now,
  });
  await db.insert(kalakritiEdition).values({
    ageCutoffDate: `${FIXTURE.year}-06-30`,
    brandingKey: "kalakriti-volunteer-assignment-e2e",
    createdAt: now,
    createdBy: creatorId,
    eventDate: `${FIXTURE.year}-11-20`,
    id: FIXTURE.editionId,
    lifecycle: "draft",
    name: `Kalakriti ${FIXTURE.year}`,
    plannedRegistrationCloseAt: new Date(`${FIXTURE.year}-10-31T18:29:00.000Z`),
    teamEventId: FIXTURE.eventId,
    updatedAt: now,
    year: FIXTURE.year,
  });
  return { year: FIXTURE.year };
}

async function state() {
  const userId = await getUserId(EMAIL);
  const [membership, eventMember] = await Promise.all([
    db.query.kalakritiEditionMembership.findFirst({
      columns: { id: true, state: true },
      where: and(
        eq(kalakritiEditionMembership.editionId, FIXTURE.editionId),
        eq(kalakritiEditionMembership.userId, userId)
      ),
      with: { assignments: true },
    }),
    db.query.teamEventMember.findFirst({
      columns: { id: true },
      where: and(
        eq(teamEventMember.eventId, FIXTURE.eventId),
        eq(teamEventMember.userId, userId)
      ),
    }),
  ]);
  return {
    assignments:
      membership?.assignments.map((assignment) => assignment.responsibility) ??
      [],
    eventMember: Boolean(eventMember),
    membershipState: membership?.state ?? null,
  };
}

const [action, creatorEmail] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "setup" && creatorEmail) {
  result = await setup(creatorEmail);
} else if (action === "state") {
  result = await state();
} else {
  throw new Error(
    `Unsupported volunteer assignment fixture action: ${action ?? ""}`
  );
}
process.stdout.write(`${JSON.stringify(result)}\n`);
