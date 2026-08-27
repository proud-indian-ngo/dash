import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { and, eq } from "drizzle-orm";

const FIXTURE = {
  editionId: "019f0000-0019-7000-8000-000000001981",
  kalakritiEventId: "019f0000-0019-7000-8000-000000001982",
  normalEventId: "019f0000-0019-7000-8000-000000001983",
  year: 2095,
} as const;

async function getUserId(email: string): Promise<string | null> {
  const record = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });
  return record?.id ?? null;
}

async function cleanup() {
  await db
    .delete(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.editionId, FIXTURE.editionId));
  await db
    .delete(teamEventMember)
    .where(eq(teamEventMember.eventId, FIXTURE.kalakritiEventId));
  await db
    .delete(teamEventMember)
    .where(eq(teamEventMember.eventId, FIXTURE.normalEventId));
  await db
    .delete(kalakritiEdition)
    .where(eq(kalakritiEdition.id, FIXTURE.editionId));
  await db.delete(teamEvent).where(eq(teamEvent.id, FIXTURE.kalakritiEventId));
  await db.delete(teamEvent).where(eq(teamEvent.id, FIXTURE.normalEventId));
}

async function setup(creatorEmail: string) {
  await cleanup();
  const creatorId = await getUserId(creatorEmail);
  const owningTeam = await db.query.team.findFirst({ columns: { id: true } });
  if (!(creatorId && owningTeam)) {
    throw new Error("Register URL fixture requires a creator and owning team");
  }
  const now = new Date();
  const startTime = new Date(`${FIXTURE.year}-11-20T04:30:00.000Z`);
  await db.insert(teamEvent).values({
    createdAt: now,
    createdBy: creatorId,
    id: FIXTURE.normalEventId,
    name: "Register URL future event",
    startTime,
    teamId: owningTeam.id,
    updatedAt: now,
  });
  await db.insert(teamEvent).values({
    createdAt: now,
    createdBy: creatorId,
    id: FIXTURE.kalakritiEventId,
    managementDomain: "kalakriti",
    name: `Kalakriti ${FIXTURE.year}`,
    startTime,
    teamId: owningTeam.id,
    updatedAt: now,
  });
  await db.insert(kalakritiEdition).values({
    ageCutoffDate: `${FIXTURE.year}-06-30`,
    brandingKey: "kalakriti-register-url-e2e",
    createdAt: now,
    createdBy: creatorId,
    eventDate: `${FIXTURE.year}-11-20`,
    id: FIXTURE.editionId,
    lifecycle: "draft",
    name: `Kalakriti ${FIXTURE.year}`,
    plannedRegistrationCloseAt: new Date(`${FIXTURE.year}-10-31T18:29:00.000Z`),
    teamEventId: FIXTURE.kalakritiEventId,
    updatedAt: now,
    year: FIXTURE.year,
  });
  return {
    kalakritiEventId: FIXTURE.kalakritiEventId,
    normalEventId: FIXTURE.normalEventId,
  };
}

async function state(email: string) {
  const userId = await getUserId(email);
  if (!userId) {
    return {
      eventMember: false,
      kalakritiEventMember: false,
      membershipState: null,
      registrationGroup: null,
    };
  }
  const [record, eventMember, kalakritiMember, membership] = await Promise.all([
    db.query.user.findFirst({
      columns: { registrationGroup: true },
      where: eq(user.id, userId),
    }),
    db.query.teamEventMember.findFirst({
      columns: { id: true },
      where: and(
        eq(teamEventMember.eventId, FIXTURE.normalEventId),
        eq(teamEventMember.userId, userId)
      ),
    }),
    db.query.teamEventMember.findFirst({
      columns: { id: true },
      where: and(
        eq(teamEventMember.eventId, FIXTURE.kalakritiEventId),
        eq(teamEventMember.userId, userId)
      ),
    }),
    db.query.kalakritiEditionMembership.findFirst({
      columns: { state: true },
      where: and(
        eq(kalakritiEditionMembership.editionId, FIXTURE.editionId),
        eq(kalakritiEditionMembership.userId, userId)
      ),
      with: { assignments: true },
    }),
  ]);
  return {
    assignmentCount: membership?.assignments.length ?? 0,
    eventMember: Boolean(eventMember),
    kalakritiEventMember: Boolean(kalakritiMember),
    membershipState: membership?.state ?? null,
    registrationGroup: record?.registrationGroup ?? null,
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
  throw new Error(`Unsupported register URL fixture action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
