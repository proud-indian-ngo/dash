import { db } from "@pi-dash/db";
import {
  kalakritiAgeCategory,
  kalakritiAuditEntry,
  kalakritiCenter,
  kalakritiCenterAgeQuota,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionSession,
  kalakritiEdition,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { inArray } from "drizzle-orm";

const fixtures = {
  cloneTarget: {
    editionId: "019f0000-0000-7000-8000-00000000a101",
    eventId: "019f0000-0000-7000-8000-00000000a102",
    year: 2188,
  },
  ready: {
    ageCategoryId: "019f0000-0000-7000-8000-00000000a203",
    categoryId: "019f0000-0000-7000-8000-00000000a204",
    centerId: "019f0000-0000-7000-8000-00000000a205",
    competitionId: "019f0000-0000-7000-8000-00000000a206",
    editionId: "019f0000-0000-7000-8000-00000000a201",
    eventId: "019f0000-0000-7000-8000-00000000a202",
    quotaId: "019f0000-0000-7000-8000-00000000a207",
    sessionId: "019f0000-0000-7000-8000-00000000a208",
    venueId: "019f0000-0000-7000-8000-00000000a209",
    year: 2189,
  },
  source: {
    ageCategoryId: "019f0000-0000-7000-8000-00000000a303",
    categoryId: "019f0000-0000-7000-8000-00000000a304",
    centerId: "019f0000-0000-7000-8000-00000000a307",
    competitionId: "019f0000-0000-7000-8000-00000000a305",
    editionId: "019f0000-0000-7000-8000-00000000a301",
    eventId: "019f0000-0000-7000-8000-00000000a302",
    sessionId: "019f0000-0000-7000-8000-00000000a308",
    venueId: "019f0000-0000-7000-8000-00000000a306",
    year: 2187,
  },
} as const;

const editionIds = Object.values(fixtures).map((fixture) => fixture.editionId);
const eventIds = Object.values(fixtures).map((fixture) => fixture.eventId);

async function cleanup() {
  await db
    .delete(kalakritiCompetitionSession)
    .where(inArray(kalakritiCompetitionSession.editionId, editionIds));
  await db
    .delete(kalakritiCenterAgeQuota)
    .where(inArray(kalakritiCenterAgeQuota.editionId, editionIds));
  await db
    .delete(kalakritiCompetition)
    .where(inArray(kalakritiCompetition.editionId, editionIds));
  await db
    .delete(kalakritiCompetitionCategory)
    .where(inArray(kalakritiCompetitionCategory.editionId, editionIds));
  await db
    .delete(kalakritiVenue)
    .where(inArray(kalakritiVenue.editionId, editionIds));
  await db
    .delete(kalakritiAgeCategory)
    .where(inArray(kalakritiAgeCategory.editionId, editionIds));
  await db
    .delete(kalakritiCenter)
    .where(inArray(kalakritiCenter.editionId, editionIds));
  await db
    .delete(kalakritiAuditEntry)
    .where(inArray(kalakritiAuditEntry.editionId, editionIds));
  await db
    .delete(kalakritiEdition)
    .where(inArray(kalakritiEdition.id, editionIds));
  await db.delete(teamEvent).where(inArray(teamEvent.id, eventIds));
}

async function setup(actorEmail: string) {
  await cleanup();
  const [actor, owningTeam] = await Promise.all([
    db.query.user.findFirst({
      columns: { id: true },
      where: (table, { eq }) => eq(table.email, actorEmail),
    }),
    db.query.team.findFirst({ columns: { id: true } }),
  ]);
  if (!(actor && owningTeam)) {
    throw new Error("Kalakriti lifecycle fixture requires a user and team");
  }
  const now = new Date();
  const fixtureRows = Object.values(fixtures);
  await db.insert(teamEvent).values(
    fixtureRows.map((fixture) => ({
      city: "bangalore",
      createdAt: now,
      createdBy: actor.id,
      description: "Kalakriti lifecycle E2E fixture",
      id: fixture.eventId,
      isPublic: false,
      managementDomain: "kalakriti",
      name: `Kalakriti ${fixture.year}`,
      startTime: new Date(`${fixture.year}-11-21T04:30:00.000Z`),
      teamId: owningTeam.id,
      updatedAt: now,
    }))
  );
  await db.insert(kalakritiEdition).values(
    fixtureRows.map((fixture) => ({
      ageCutoffDate: `${fixture.year}-06-01`,
      brandingKey: `kalakriti-lifecycle-${fixture.year}`,
      createdAt: now,
      createdBy: actor.id,
      eventDate: `${fixture.year}-11-21`,
      id: fixture.editionId,
      lifecycle: "draft",
      name: `Kalakriti ${fixture.year}`,
      plannedRegistrationCloseAt: new Date(
        `${fixture.year}-10-31T18:29:00.000Z`
      ),
      teamEventId: fixture.eventId,
      updatedAt: now,
      year: fixture.year,
    }))
  );

  await db.insert(kalakritiCenter).values([
    {
      createdAt: now,
      createdBy: actor.id,
      editionId: fixtures.ready.editionId,
      id: fixtures.ready.centerId,
      name: "Jayanagar",
      normalizedName: "jayanagar",
      updatedAt: now,
    },
    {
      createdAt: now,
      createdBy: actor.id,
      editionId: fixtures.source.editionId,
      id: fixtures.source.centerId,
      name: "Source Center",
      normalizedName: "source center",
      updatedAt: now,
    },
  ]);
  await db.insert(kalakritiAgeCategory).values([
    {
      createdAt: now,
      createdBy: actor.id,
      editionId: fixtures.ready.editionId,
      id: fixtures.ready.ageCategoryId,
      maxCompetitionsPerCategory: 2,
      maximumAge: 12,
      maxTotalCompetitions: 4,
      minimumAge: 6,
      name: "Junior",
      normalizedName: "junior",
      sortOrder: 0,
      updatedAt: now,
    },
    {
      createdAt: now,
      createdBy: actor.id,
      editionId: fixtures.source.editionId,
      id: fixtures.source.ageCategoryId,
      maxCompetitionsPerCategory: 3,
      maximumAge: 15,
      maxTotalCompetitions: 5,
      minimumAge: 8,
      name: "Source Junior",
      normalizedName: "source junior",
      sortOrder: 0,
      updatedAt: now,
    },
  ]);
  await db.insert(kalakritiCenterAgeQuota).values({
    ageCategoryId: fixtures.ready.ageCategoryId,
    centerId: fixtures.ready.centerId,
    createdAt: now,
    createdBy: actor.id,
    editionId: fixtures.ready.editionId,
    femaleStudentLimit: 20,
    id: fixtures.ready.quotaId,
    maleStudentLimit: 20,
    updatedAt: now,
  });
  await db.insert(kalakritiCompetitionCategory).values([
    {
      createdAt: now,
      createdBy: actor.id,
      editionId: fixtures.ready.editionId,
      id: fixtures.ready.categoryId,
      name: "Performing Arts",
      normalizedName: "performing arts",
      sortOrder: 0,
      updatedAt: now,
    },
    {
      createdAt: now,
      createdBy: actor.id,
      editionId: fixtures.source.editionId,
      id: fixtures.source.categoryId,
      name: "Source Arts",
      normalizedName: "source arts",
      sortOrder: 0,
      updatedAt: now,
    },
  ]);
  await db.insert(kalakritiCompetition).values([
    {
      competitionCategoryId: fixtures.ready.categoryId,
      createdAt: now,
      createdBy: actor.id,
      editionId: fixtures.ready.editionId,
      genderEligibility: "both",
      id: fixtures.ready.competitionId,
      maximumGroupSize: 1,
      minimumGroupSize: 1,
      name: "Solo Dance",
      normalizedName: "solo dance",
      participationMode: "individual",
      updatedAt: now,
    },
    {
      competitionCategoryId: fixtures.source.categoryId,
      createdAt: now,
      createdBy: actor.id,
      editionId: fixtures.source.editionId,
      genderEligibility: "female",
      id: fixtures.source.competitionId,
      maximumGroupSize: 1,
      minimumGroupSize: 1,
      name: "Source Dance",
      normalizedName: "source dance",
      participationMode: "individual",
      updatedAt: now,
    },
  ]);
  await db.insert(kalakritiVenue).values([
    {
      createdAt: now,
      createdBy: actor.id,
      editionId: fixtures.ready.editionId,
      id: fixtures.ready.venueId,
      name: "Main Stage",
      normalizedName: "main stage",
      updatedAt: now,
    },
    {
      createdAt: now,
      createdBy: actor.id,
      editionId: fixtures.source.editionId,
      id: fixtures.source.venueId,
      name: "Source Stage",
      normalizedName: "source stage",
      updatedAt: now,
    },
  ]);
  await db.insert(kalakritiCompetitionSession).values([
    {
      ageCategoryId: fixtures.ready.ageCategoryId,
      capacity: 30,
      competitionId: fixtures.ready.competitionId,
      createdAt: now,
      createdBy: actor.id,
      editionId: fixtures.ready.editionId,
      endAt: new Date(`${fixtures.ready.year}-11-21T05:30:00.000Z`),
      id: fixtures.ready.sessionId,
      startAt: new Date(`${fixtures.ready.year}-11-21T04:30:00.000Z`),
      updatedAt: now,
      venueId: fixtures.ready.venueId,
    },
    {
      ageCategoryId: fixtures.source.ageCategoryId,
      capacity: 25,
      competitionId: fixtures.source.competitionId,
      createdAt: now,
      createdBy: actor.id,
      editionId: fixtures.source.editionId,
      endAt: new Date(`${fixtures.source.year}-11-21T05:30:00.000Z`),
      id: fixtures.source.sessionId,
      startAt: new Date(`${fixtures.source.year}-11-21T04:30:00.000Z`),
      updatedAt: now,
      venueId: fixtures.source.venueId,
    },
  ]);

  return {
    cloneTargetYear: fixtures.cloneTarget.year,
    readyYear: fixtures.ready.year,
    sourceYear: fixtures.source.year,
  };
}

async function invalidateReadyEdition() {
  await db
    .delete(kalakritiCenterAgeQuota)
    .where(inArray(kalakritiCenterAgeQuota.id, [fixtures.ready.quotaId]));
  return { invalidated: true };
}

const [action, emailArgument] = process.argv.slice(2);
try {
  let result:
    | { invalidated: true }
    | { removed: true }
    | Awaited<ReturnType<typeof setup>>;
  if (action === "setup") {
    result = await setup(emailArgument ?? "");
  } else if (action === "invalidate_ready") {
    result = await invalidateReadyEdition();
  } else if (action === "cleanup") {
    await cleanup();
    result = { removed: true };
  } else {
    throw new Error(`Unknown action: ${action}`);
  }
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
