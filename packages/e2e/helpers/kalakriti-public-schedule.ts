import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAgeCategory,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionSession,
  kalakritiEdition,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq, inArray } from "drizzle-orm";

const FIXTURE = {
  ageCategoryId: "019f0000-0000-7000-8000-00000000f103",
  cancelledCompetitionId: "019f0000-0000-7000-8000-00000000f109",
  cancelledSessionId: "019f0000-0000-7000-8000-00000000f10b",
  categoryId: "019f0000-0000-7000-8000-00000000f107",
  competitionId: "019f0000-0000-7000-8000-00000000f108",
  draftEditionId: "019f0000-0000-7000-8000-00000000f201",
  draftEventId: "019f0000-0000-7000-8000-00000000f202",
  draftYear: 2190,
  editionId: "019f0000-0000-7000-8000-00000000f101",
  eventId: "019f0000-0000-7000-8000-00000000f102",
  sessionId: "019f0000-0000-7000-8000-00000000f10a",
  venueId: "019f0000-0000-7000-8000-00000000f106",
  year: 2191,
} as const;

async function cleanup() {
  await db
    .delete(kalakritiCompetitionSession)
    .where(
      inArray(kalakritiCompetitionSession.editionId, [
        FIXTURE.editionId,
        FIXTURE.draftEditionId,
      ])
    );
  await db
    .delete(kalakritiCompetition)
    .where(
      inArray(kalakritiCompetition.editionId, [
        FIXTURE.editionId,
        FIXTURE.draftEditionId,
      ])
    );
  await db
    .delete(kalakritiCompetitionCategory)
    .where(
      inArray(kalakritiCompetitionCategory.editionId, [
        FIXTURE.editionId,
        FIXTURE.draftEditionId,
      ])
    );
  await db
    .delete(kalakritiVenue)
    .where(
      inArray(kalakritiVenue.editionId, [
        FIXTURE.editionId,
        FIXTURE.draftEditionId,
      ])
    );
  await db
    .delete(kalakritiAgeCategory)
    .where(
      inArray(kalakritiAgeCategory.editionId, [
        FIXTURE.editionId,
        FIXTURE.draftEditionId,
      ])
    );
  await db
    .delete(kalakritiEdition)
    .where(
      inArray(kalakritiEdition.id, [FIXTURE.editionId, FIXTURE.draftEditionId])
    );
  await db
    .delete(teamEvent)
    .where(inArray(teamEvent.id, [FIXTURE.eventId, FIXTURE.draftEventId]));
}

async function setup(email?: string) {
  await cleanup();
  const [actor, owningTeam] = await Promise.all([
    email
      ? db.query.user.findFirst({
          columns: { id: true },
          where: eq(user.email, email),
        })
      : db.query.user.findFirst({ columns: { id: true } }),
    db.query.team.findFirst({ columns: { id: true } }),
  ]);
  if (!(actor && owningTeam)) {
    throw new Error("Public schedule fixture requires a user and team");
  }

  const now = new Date();
  await db.insert(teamEvent).values([
    {
      city: "bangalore",
      createdAt: now,
      createdBy: actor.id,
      description: "Kalakriti public schedule E2E fixture",
      id: FIXTURE.eventId,
      isPublic: false,
      managementDomain: "kalakriti",
      name: `Kalakriti ${FIXTURE.year}`,
      startTime: new Date(`${FIXTURE.year}-11-21T03:30:00.000Z`),
      teamId: owningTeam.id,
      updatedAt: now,
    },
    {
      city: "bangalore",
      createdAt: now,
      createdBy: actor.id,
      description: "Kalakriti draft schedule E2E fixture",
      id: FIXTURE.draftEventId,
      isPublic: false,
      managementDomain: "kalakriti",
      name: `Kalakriti ${FIXTURE.draftYear}`,
      startTime: new Date(`${FIXTURE.draftYear}-11-21T03:30:00.000Z`),
      teamId: owningTeam.id,
      updatedAt: now,
    },
  ]);
  await db.insert(kalakritiEdition).values([
    {
      ageCutoffDate: `${FIXTURE.year}-06-30`,
      brandingKey: "kalakriti-public-schedule-e2e",
      createdAt: now,
      createdBy: actor.id,
      eventDate: `${FIXTURE.year}-11-21`,
      id: FIXTURE.editionId,
      lifecycle: "registration_open",
      name: `Kalakriti ${FIXTURE.year}`,
      plannedRegistrationCloseAt: new Date(
        `${FIXTURE.year}-10-31T18:29:00.000Z`
      ),
      teamEventId: FIXTURE.eventId,
      updatedAt: now,
      year: FIXTURE.year,
    },
    {
      ageCutoffDate: `${FIXTURE.draftYear}-06-30`,
      brandingKey: "kalakriti-draft-schedule-e2e",
      createdAt: now,
      createdBy: actor.id,
      eventDate: `${FIXTURE.draftYear}-11-21`,
      id: FIXTURE.draftEditionId,
      lifecycle: "draft",
      name: `Kalakriti ${FIXTURE.draftYear}`,
      plannedRegistrationCloseAt: new Date(
        `${FIXTURE.draftYear}-10-31T18:29:00.000Z`
      ),
      teamEventId: FIXTURE.draftEventId,
      updatedAt: now,
      year: FIXTURE.draftYear,
    },
  ]);
  await db.insert(kalakritiAgeCategory).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: FIXTURE.editionId,
    id: FIXTURE.ageCategoryId,
    maxCompetitionsPerCategory: 2,
    maximumAge: 10,
    maxTotalCompetitions: 4,
    minimumAge: 6,
    name: "Juniors",
    normalizedName: "juniors",
    sortOrder: 0,
    updatedAt: now,
  });
  await db.insert(kalakritiCompetitionCategory).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: FIXTURE.editionId,
    id: FIXTURE.categoryId,
    name: "Visual Arts",
    normalizedName: "visual arts",
    sortOrder: 0,
    updatedAt: now,
  });
  await db.insert(kalakritiCompetition).values([
    {
      competitionCategoryId: FIXTURE.categoryId,
      createdAt: now,
      createdBy: actor.id,
      editionId: FIXTURE.editionId,
      genderEligibility: "both",
      id: FIXTURE.competitionId,
      maximumGroupSize: 1,
      minimumGroupSize: 1,
      name: "Drawing",
      normalizedName: "drawing",
      participationMode: "individual",
      updatedAt: now,
    },
    {
      cancelledAt: now,
      competitionCategoryId: FIXTURE.categoryId,
      createdAt: now,
      createdBy: actor.id,
      editionId: FIXTURE.editionId,
      genderEligibility: "both",
      id: FIXTURE.cancelledCompetitionId,
      maximumGroupSize: 1,
      minimumGroupSize: 1,
      name: "Painting",
      normalizedName: "painting",
      participationMode: "individual",
      updatedAt: now,
    },
  ]);
  await db.insert(kalakritiVenue).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: FIXTURE.editionId,
    id: FIXTURE.venueId,
    name: "Art Room",
    normalizedName: "art room",
    updatedAt: now,
  });
  await db.insert(kalakritiCompetitionSession).values([
    {
      ageCategoryId: FIXTURE.ageCategoryId,
      capacity: 25,
      competitionId: FIXTURE.competitionId,
      createdAt: now,
      createdBy: actor.id,
      editionId: FIXTURE.editionId,
      endAt: new Date(`${FIXTURE.year}-11-21T05:30:00.000Z`),
      id: FIXTURE.sessionId,
      startAt: new Date(`${FIXTURE.year}-11-21T04:30:00.000Z`),
      updatedAt: now,
      venueId: FIXTURE.venueId,
    },
    {
      ageCategoryId: FIXTURE.ageCategoryId,
      capacity: 30,
      competitionId: FIXTURE.cancelledCompetitionId,
      createdAt: now,
      createdBy: actor.id,
      editionId: FIXTURE.editionId,
      endAt: new Date(`${FIXTURE.year}-11-21T07:00:00.000Z`),
      id: FIXTURE.cancelledSessionId,
      startAt: new Date(`${FIXTURE.year}-11-21T06:00:00.000Z`),
      updatedAt: now,
      venueId: FIXTURE.venueId,
    },
  ]);

  return { draftYear: FIXTURE.draftYear, year: FIXTURE.year };
}

async function updateVenue() {
  await db
    .update(kalakritiVenue)
    .set({
      name: "Updated Hall",
      normalizedName: "updated hall",
      updatedAt: new Date(),
    })
    .where(eq(kalakritiVenue.id, FIXTURE.venueId));
}

async function archiveEdition() {
  await db
    .update(kalakritiEdition)
    .set({ lifecycle: "archived", updatedAt: new Date() })
    .where(eq(kalakritiEdition.id, FIXTURE.editionId));
}

const [action, emailArgument] = process.argv.slice(2);
let result: unknown;
if (action === "setup") {
  result = await setup(emailArgument);
} else if (action === "update-venue") {
  await updateVenue();
  result = { updated: true };
} else if (action === "archive") {
  await archiveEdition();
  result = { archived: true };
} else if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else {
  throw new Error(`Unknown action: ${action ?? ""}`);
}

process.stdout.write(`${JSON.stringify(result)}\n`);
