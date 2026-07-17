import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAgeCategory,
  kalakritiAssignment,
  kalakritiAuditEntry,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionSession,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

const FIXTURES = {
  admin: {
    ageCategoryId: "019f0000-0000-7000-8000-00000000c105",
    assignmentId: "019f0000-0000-7000-8000-00000000c106",
    categoryId: "019f0000-0000-7000-8000-00000000c104",
    editionId: "019f0000-0000-7000-8000-00000000c102",
    eventId: "019f0000-0000-7000-8000-00000000c101",
    membershipId: "019f0000-0000-7000-8000-00000000c103",
    year: 2195,
  },
  volunteer: {
    ageCategoryId: "019f0000-0000-7000-8000-00000000c205",
    assignmentId: "019f0000-0000-7000-8000-00000000c206",
    categoryId: "019f0000-0000-7000-8000-00000000c204",
    editionId: "019f0000-0000-7000-8000-00000000c202",
    eventId: "019f0000-0000-7000-8000-00000000c201",
    membershipId: "019f0000-0000-7000-8000-00000000c203",
    year: 2194,
  },
} as const;

type FixtureKind = keyof typeof FIXTURES;

async function cleanup(kind: FixtureKind): Promise<void> {
  const fixture = FIXTURES[kind];
  await db
    .delete(kalakritiAssignment)
    .where(eq(kalakritiAssignment.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetitionSession)
    .where(eq(kalakritiCompetitionSession.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetition)
    .where(eq(kalakritiCompetition.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetitionCategory)
    .where(eq(kalakritiCompetitionCategory.editionId, fixture.editionId));
  await db
    .delete(kalakritiVenue)
    .where(eq(kalakritiVenue.editionId, fixture.editionId));
  await db
    .delete(kalakritiAgeCategory)
    .where(eq(kalakritiAgeCategory.editionId, fixture.editionId));
  await db
    .delete(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.editionId, fixture.editionId));
  await db
    .delete(kalakritiAuditEntry)
    .where(eq(kalakritiAuditEntry.editionId, fixture.editionId));
  await db
    .delete(kalakritiEdition)
    .where(eq(kalakritiEdition.id, fixture.editionId));
  await db.delete(teamEvent).where(eq(teamEvent.id, fixture.eventId));
}

async function setup(kind: FixtureKind, actorEmail: string) {
  const fixture = FIXTURES[kind];
  await cleanup(kind);
  const [actor, owningTeam] = await Promise.all([
    db.query.user.findFirst({
      columns: { email: true, id: true, name: true },
      where: eq(user.email, actorEmail),
    }),
    db.query.team.findFirst({ columns: { id: true } }),
  ]);
  if (!(actor && owningTeam)) {
    throw new Error("Kalakriti competition fixture requires a user and team");
  }
  const now = new Date();
  await db.insert(teamEvent).values({
    city: "bangalore",
    createdAt: now,
    createdBy: actor.id,
    description: "Kalakriti competition E2E fixture",
    id: fixture.eventId,
    isPublic: false,
    managementDomain: "kalakriti",
    name: `Kalakriti ${fixture.year}`,
    startTime: new Date(`${fixture.year}-11-21T04:30:00.000Z`),
    teamId: owningTeam.id,
    updatedAt: now,
  });
  await db.insert(kalakritiEdition).values({
    ageCutoffDate: `${fixture.year}-06-01`,
    brandingKey: `kalakriti-competitions-${kind}-e2e`,
    createdAt: now,
    createdBy: actor.id,
    eventDate: `${fixture.year}-11-21`,
    id: fixture.editionId,
    lifecycle: "draft",
    name: `Kalakriti ${fixture.year}`,
    plannedRegistrationCloseAt: new Date(`${fixture.year}-10-31T18:29:00.000Z`),
    teamEventId: fixture.eventId,
    updatedAt: now,
    year: fixture.year,
  });
  await db.insert(kalakritiCompetitionCategory).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    id: fixture.categoryId,
    name: "Performing Arts",
    normalizedName: "performing arts",
    sortOrder: 0,
    updatedAt: now,
  });
  await db.insert(kalakritiAgeCategory).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    id: fixture.ageCategoryId,
    maxCompetitionsPerCategory: 2,
    maximumAge: 12,
    maxTotalCompetitions: 4,
    minimumAge: 6,
    name: "Junior",
    normalizedName: "junior",
    sortOrder: 0,
    updatedAt: now,
  });
  if (kind === "volunteer") {
    await db.insert(kalakritiEditionMembership).values({
      createdAt: now,
      createdBy: actor.id,
      editionId: fixture.editionId,
      id: fixture.membershipId,
      kind: "volunteer",
      snapshotEmail: actor.email,
      snapshotName: actor.name,
      state: "active",
      updatedAt: now,
      userId: actor.id,
    });
    await db.insert(kalakritiAssignment).values({
      competitionCategoryId: fixture.categoryId,
      createdAt: now,
      createdBy: actor.id,
      editionId: fixture.editionId,
      id: fixture.assignmentId,
      isPrimary: true,
      membershipId: fixture.membershipId,
      responsibility: "competition_category_lead",
    });
  }
  return { year: fixture.year };
}

const [action, kindArgument, emailArgument] = process.argv.slice(2);
try {
  const kind = kindArgument as FixtureKind;
  if (!(kind in FIXTURES)) {
    throw new Error(`Unknown fixture kind: ${kindArgument}`);
  }
  let result: { removed: boolean } | { year: number };
  if (action === "setup") {
    result = await setup(kind, emailArgument ?? "");
  } else if (action === "cleanup") {
    await cleanup(kind);
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
