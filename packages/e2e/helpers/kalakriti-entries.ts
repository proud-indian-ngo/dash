import { createHash } from "node:crypto";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAgeCategory,
  kalakritiAssignment,
  kalakritiAuditEntry,
  kalakritiCenter,
  kalakritiCenterAgeQuota,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionEntry,
  kalakritiCompetitionSession,
  kalakritiCredential,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiEntryMember,
  kalakritiStudent,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

const FIXTURES = {
  admin: {
    ageCategoryId: "019f0000-0000-7000-8000-00000000e103",
    assignmentId: "019f0000-0000-7000-8000-00000000e10d",
    categoryId: "019f0000-0000-7000-8000-00000000e107",
    centerId: "019f0000-0000-7000-8000-00000000e104",
    competitionId: "019f0000-0000-7000-8000-00000000e108",
    credentialIds: [
      "019f0000-0000-7000-8000-00000000e10b",
      "019f0000-0000-7000-8000-00000000e10c",
    ],
    editionId: "019f0000-0000-7000-8000-00000000e101",
    eventId: "019f0000-0000-7000-8000-00000000e102",
    membershipId: "019f0000-0000-7000-8000-00000000e10e",
    quotaId: "019f0000-0000-7000-8000-00000000e105",
    sessionId: "019f0000-0000-7000-8000-00000000e10a",
    studentIds: [
      "019f0000-0000-7000-8000-00000000e106",
      "019f0000-0000-7000-8000-00000000e10f",
    ],
    venueId: "019f0000-0000-7000-8000-00000000e109",
    year: 2193,
  },
  liaison: {
    ageCategoryId: "019f0000-0000-7000-8000-00000000e203",
    assignmentId: "019f0000-0000-7000-8000-00000000e20d",
    categoryId: "019f0000-0000-7000-8000-00000000e207",
    centerId: "019f0000-0000-7000-8000-00000000e204",
    competitionId: "019f0000-0000-7000-8000-00000000e208",
    credentialIds: [
      "019f0000-0000-7000-8000-00000000e20b",
      "019f0000-0000-7000-8000-00000000e20c",
    ],
    editionId: "019f0000-0000-7000-8000-00000000e201",
    eventId: "019f0000-0000-7000-8000-00000000e202",
    membershipId: "019f0000-0000-7000-8000-00000000e20e",
    quotaId: "019f0000-0000-7000-8000-00000000e205",
    sessionId: "019f0000-0000-7000-8000-00000000e20a",
    studentIds: [
      "019f0000-0000-7000-8000-00000000e206",
      "019f0000-0000-7000-8000-00000000e20f",
    ],
    venueId: "019f0000-0000-7000-8000-00000000e209",
    year: 2192,
  },
} as const;

type FixtureKind = keyof typeof FIXTURES;

async function cleanup(kind: FixtureKind): Promise<void> {
  const fixture = FIXTURES[kind];
  await db
    .delete(kalakritiEntryMember)
    .where(eq(kalakritiEntryMember.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetitionEntry)
    .where(eq(kalakritiCompetitionEntry.editionId, fixture.editionId));
  await db
    .delete(kalakritiCredential)
    .where(eq(kalakritiCredential.editionId, fixture.editionId));
  await db
    .delete(kalakritiStudent)
    .where(eq(kalakritiStudent.editionId, fixture.editionId));
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
    .delete(kalakritiCenterAgeQuota)
    .where(eq(kalakritiCenterAgeQuota.editionId, fixture.editionId));
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
    .delete(kalakritiCenter)
    .where(eq(kalakritiCenter.editionId, fixture.editionId));
  await db
    .delete(kalakritiEdition)
    .where(eq(kalakritiEdition.id, fixture.editionId));
  await db.delete(teamEvent).where(eq(teamEvent.id, fixture.eventId));
}

async function setup(kind: FixtureKind, actorEmail: string, capacity: number) {
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
    throw new Error("Kalakriti Entry fixture requires a user and team");
  }
  const now = new Date();
  await db.insert(teamEvent).values({
    city: "bangalore",
    createdAt: now,
    createdBy: actor.id,
    description: "Kalakriti Competition Entry E2E fixture",
    id: fixture.eventId,
    isPublic: false,
    managementDomain: "kalakriti",
    name: `Kalakriti ${fixture.year}`,
    startTime: new Date(`${fixture.year}-11-21T04:30:00.000Z`),
    teamId: owningTeam.id,
    updatedAt: now,
  });
  await db.insert(kalakritiEdition).values({
    ageCutoffDate: `${fixture.year}-06-30`,
    brandingKey: `kalakriti-entries-${kind}-e2e`,
    createdAt: now,
    createdBy: actor.id,
    eventDate: `${fixture.year}-11-21`,
    id: fixture.editionId,
    lifecycle: "registration_open",
    name: `Kalakriti ${fixture.year}`,
    plannedRegistrationCloseAt: new Date(`${fixture.year}-10-31T18:29:00.000Z`),
    teamEventId: fixture.eventId,
    updatedAt: now,
    year: fixture.year,
  });
  await db.insert(kalakritiCenter).values({
    competitionEntryRegistrationEnabled: true,
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    id: fixture.centerId,
    name: "Jayanagar",
    normalizedName: "jayanagar",
    studentRegistrationEnabled: true,
    updatedAt: now,
  });
  await db.insert(kalakritiAgeCategory).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    id: fixture.ageCategoryId,
    maxCompetitionsPerCategory: 2,
    maximumAge: 10,
    maxTotalCompetitions: 4,
    minimumAge: 6,
    name: "Junior",
    normalizedName: "junior",
    sortOrder: 0,
    updatedAt: now,
  });
  await db.insert(kalakritiCenterAgeQuota).values({
    ageCategoryId: fixture.ageCategoryId,
    centerId: fixture.centerId,
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    femaleStudentLimit: 5,
    id: fixture.quotaId,
    maleStudentLimit: 5,
    updatedAt: now,
  });
  await db.insert(kalakritiStudent).values(
    fixture.studentIds.map((id, index) => ({
      ageCategoryId: fixture.ageCategoryId,
      centerId: fixture.centerId,
      createdAt: now,
      createdBy: actor.id,
      dateOfBirth: `${fixture.year - 8}-06-${index === 0 ? "10" : "11"}`,
      derivedAgeCategoryId: fixture.ageCategoryId,
      editionId: fixture.editionId,
      gender: "female" as const,
      humanId: `KAL-${fixture.year}-000${index + 1}`,
      id,
      name: `Entry Student ${index === 0 ? "A" : "B"}`,
      normalizedName: `entry student ${index === 0 ? "a" : "b"}`,
      updatedAt: now,
      updatedBy: actor.id,
    }))
  );
  await db.insert(kalakritiCredential).values(
    fixture.credentialIds.map((id, index) => ({
      createdAt: now,
      editionId: fixture.editionId,
      humanId: `KAL-${fixture.year}-000${index + 1}`,
      id,
      issuedAt: now,
      issuedBy: actor.id,
      studentId: fixture.studentIds[index] as string,
      tokenHash: createHash("sha256")
        .update(`kalakriti-entry-${kind}-${index}`)
        .digest("hex"),
    }))
  );
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
  await db.insert(kalakritiCompetition).values({
    competitionCategoryId: fixture.categoryId,
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    genderEligibility: "both",
    id: fixture.competitionId,
    maximumGroupSize: 1,
    minimumGroupSize: 1,
    name: "Solo Dance",
    normalizedName: "solo dance",
    participationMode: "individual",
    updatedAt: now,
  });
  await db.insert(kalakritiVenue).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    id: fixture.venueId,
    name: "Main Stage",
    normalizedName: "main stage",
    updatedAt: now,
  });
  await db.insert(kalakritiCompetitionSession).values({
    ageCategoryId: fixture.ageCategoryId,
    capacity,
    competitionId: fixture.competitionId,
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    endAt: new Date(`${fixture.year}-11-21T04:30:00.000Z`),
    id: fixture.sessionId,
    startAt: new Date(`${fixture.year}-11-21T03:30:00.000Z`),
    updatedAt: now,
    venueId: fixture.venueId,
  });
  if (kind === "liaison") {
    await db.insert(kalakritiEditionMembership).values({
      createdAt: now,
      createdBy: actor.id,
      editionId: fixture.editionId,
      id: fixture.membershipId,
      kind: "volunteer",
      snapshotEmail: actor.email,
      snapshotName: actor.name,
      updatedAt: now,
      userId: actor.id,
    });
    await db.insert(kalakritiAssignment).values({
      centerId: fixture.centerId,
      createdAt: now,
      createdBy: actor.id,
      editionId: fixture.editionId,
      id: fixture.assignmentId,
      isPrimary: true,
      membershipId: fixture.membershipId,
      responsibility: "liaison",
    });
  }
  return { year: fixture.year };
}

async function readState(kind: FixtureKind) {
  const fixture = FIXTURES[kind];
  const [entries, audits] = await Promise.all([
    db
      .select({ id: kalakritiCompetitionEntry.id })
      .from(kalakritiCompetitionEntry)
      .where(eq(kalakritiCompetitionEntry.editionId, fixture.editionId)),
    db
      .select({ action: kalakritiAuditEntry.action })
      .from(kalakritiAuditEntry)
      .where(eq(kalakritiAuditEntry.editionId, fixture.editionId)),
  ]);
  return { audits, entries };
}

const [action, kindArgument, email, capacityArgument] = process.argv.slice(2);
const fixtureKind = kindArgument as FixtureKind;
if (!(fixtureKind in FIXTURES)) {
  throw new Error(`Unsupported Entry fixture kind: ${kindArgument ?? ""}`);
}

let result: unknown;
if (action === "setup" && email) {
  result = await setup(fixtureKind, email, Number(capacityArgument ?? 2));
} else if (action === "state") {
  result = await readState(fixtureKind);
} else if (action === "cleanup") {
  await cleanup(fixtureKind);
  result = { cleaned: true };
} else {
  throw new Error(`Unsupported Entry helper action: ${action ?? ""}`);
}

process.stdout.write(`${JSON.stringify(result)}\n`);
