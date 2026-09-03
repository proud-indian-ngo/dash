import { createHash, randomBytes } from "node:crypto";

import { db } from "@pi-dash/db";
import {
  kalakritiAgeCategory,
  kalakritiCenter,
  kalakritiCredential,
  kalakritiEdition,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

const fixture = {
  ageCategoryId: "019f0000-0000-7000-8000-00000000c106",
  centerId: "019f0000-0000-7000-8000-00000000c104",
  credentialId: "019f0000-0000-7000-8000-00000000c105",
  editionId: "019f0000-0000-7000-8000-00000000c101",
  eventId: "019f0000-0000-7000-8000-00000000c102",
  studentId: "019f0000-0000-7000-8000-00000000c103",
  year: 2025,
} as const;

function hashToken(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function cleanup() {
  await db
    .delete(kalakritiCredential)
    .where(eq(kalakritiCredential.editionId, fixture.editionId));
  await db
    .delete(kalakritiStudent)
    .where(eq(kalakritiStudent.editionId, fixture.editionId));
  await db
    .delete(kalakritiAgeCategory)
    .where(eq(kalakritiAgeCategory.editionId, fixture.editionId));
  await db
    .delete(kalakritiCenter)
    .where(eq(kalakritiCenter.editionId, fixture.editionId));
  await db
    .delete(kalakritiEdition)
    .where(eq(kalakritiEdition.id, fixture.editionId));
  await db.delete(teamEvent).where(eq(teamEvent.id, fixture.eventId));
}

async function setup(actorEmail: string) {
  await cleanup();
  const [actor, owningTeam] = await Promise.all([
    db.query.user.findFirst({
      columns: { id: true },
      where: (table, { eq: equals }) => equals(table.email, actorEmail),
    }),
    db.query.team.findFirst({ columns: { id: true } }),
  ]);
  if (!(actor && owningTeam)) {
    throw new Error("Kalakriti credential fixture requires a user and team");
  }
  const now = new Date();
  const tokenBytes = randomBytes(32);
  const humanId = `KAL-${fixture.year}-0001`;
  await db.insert(teamEvent).values({
    city: "bangalore",
    createdAt: now,
    createdBy: actor.id,
    description: "Kalakriti credential E2E fixture",
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
    brandingKey: "kalakriti-student-e2e",
    createdAt: now,
    createdBy: actor.id,
    eventDate: `${fixture.year}-11-21`,
    id: fixture.editionId,
    lifecycle: "registration_open",
    name: `Kalakriti ${fixture.year}`,
    nextStudentSequence: 2,
    nextVolunteerSequence: 1,
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
    femaleStudentLimit: 5,
    id: fixture.ageCategoryId,
    maleStudentLimit: 5,
    maxCompetitionsPerCategory: 2,
    maximumAge: 10,
    maxTotalCompetitions: 4,
    minimumAge: 6,
    name: "Junior",
    normalizedName: "junior",
    sortOrder: 0,
    updatedAt: now,
  });
  await db.insert(kalakritiStudent).values({
    ageCategoryId: fixture.ageCategoryId,
    ageCategoryOverrideAt: null,
    ageCategoryOverrideBy: null,
    ageCategoryOverrideReason: null,
    centerId: fixture.centerId,
    createdAt: now,
    createdBy: actor.id,
    dateOfBirth: `${fixture.year - 10}-06-15`,
    derivedAgeCategoryId: fixture.ageCategoryId,
    duplicateConfirmedAt: null,
    duplicateConfirmedBy: null,
    editionId: fixture.editionId,
    gender: "female",
    humanId,
    id: fixture.studentId,
    name: "Credential Student",
    normalizedName: "credential student",
    updatedAt: now,
    updatedBy: actor.id,
  });
  await db.insert(kalakritiCredential).values({
    createdAt: now,
    editionId: fixture.editionId,
    humanId,
    id: fixture.credentialId,
    issuedAt: now,
    issuedBy: actor.id,
    membershipId: null,
    revokedAt: null,
    revokedBy: null,
    studentId: fixture.studentId,
    tokenHash: hashToken(tokenBytes),
  });
  return { humanId, studentId: fixture.studentId, year: fixture.year };
}

async function readState() {
  const credentials = await db
    .select({
      humanId: kalakritiCredential.humanId,
      revokedAt: kalakritiCredential.revokedAt,
      tokenHash: kalakritiCredential.tokenHash,
    })
    .from(kalakritiCredential)
    .where(eq(kalakritiCredential.editionId, fixture.editionId));
  return { credentials };
}

const [action, argument] = process.argv.slice(2);
if (!action) {
  throw new Error("Usage: kalakriti-credentials.ts <setup|state> [actorEmail]");
}
if (action === "setup") {
  if (!argument) {
    throw new Error("setup requires actorEmail");
  }
  console.log(JSON.stringify(await setup(argument)));
} else if (action === "state") {
  console.log(JSON.stringify(await readState()));
} else if (action === "cleanup") {
  await cleanup();
} else {
  throw new Error(`Unknown action: ${action}`);
}

process.exit(0);
