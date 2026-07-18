import { db } from "@pi-dash/db";
import {
  kalakritiAgeCategory,
  kalakritiAuditEntry,
  kalakritiCenter,
  kalakritiCenterAgeQuota,
  kalakritiCredential,
  kalakritiEdition,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

const fixture = {
  ageCategoryId: "019f0000-0000-7000-8000-00000000b103",
  centerId: "019f0000-0000-7000-8000-00000000b104",
  editionId: "019f0000-0000-7000-8000-00000000b101",
  eventId: "019f0000-0000-7000-8000-00000000b102",
  quotaId: "019f0000-0000-7000-8000-00000000b105",
  year: 2026,
} as const;

async function cleanup() {
  await db
    .delete(kalakritiCredential)
    .where(eq(kalakritiCredential.editionId, fixture.editionId));
  await db
    .delete(kalakritiStudent)
    .where(eq(kalakritiStudent.editionId, fixture.editionId));
  await db
    .delete(kalakritiAuditEntry)
    .where(eq(kalakritiAuditEntry.editionId, fixture.editionId));
  await db
    .delete(kalakritiCenterAgeQuota)
    .where(eq(kalakritiCenterAgeQuota.editionId, fixture.editionId));
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

async function setup(actorEmail: string, femaleLimit: number) {
  await cleanup();
  const [actor, owningTeam] = await Promise.all([
    db.query.user.findFirst({
      columns: { id: true },
      where: (table, { eq: equals }) => equals(table.email, actorEmail),
    }),
    db.query.team.findFirst({ columns: { id: true } }),
  ]);
  if (!(actor && owningTeam)) {
    throw new Error("Kalakriti Student fixture requires a user and team");
  }
  const now = new Date();
  await db.insert(teamEvent).values({
    city: "bangalore",
    createdAt: now,
    createdBy: actor.id,
    description: "Kalakriti Student registration E2E fixture",
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
    nextStudentSequence: 1,
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
    femaleStudentLimit: femaleLimit,
    id: fixture.quotaId,
    maleStudentLimit: 5,
    updatedAt: now,
  });
  return { centerName: "Jayanagar", year: fixture.year };
}

async function readState() {
  const [students, credentials, audits, edition] = await Promise.all([
    db
      .select({
        humanId: kalakritiStudent.humanId,
        name: kalakritiStudent.name,
      })
      .from(kalakritiStudent)
      .where(eq(kalakritiStudent.editionId, fixture.editionId)),
    db
      .select({
        humanId: kalakritiCredential.humanId,
        revokedAt: kalakritiCredential.revokedAt,
        tokenHash: kalakritiCredential.tokenHash,
      })
      .from(kalakritiCredential)
      .where(eq(kalakritiCredential.editionId, fixture.editionId)),
    db
      .select({ action: kalakritiAuditEntry.action })
      .from(kalakritiAuditEntry)
      .where(eq(kalakritiAuditEntry.editionId, fixture.editionId)),
    db.query.kalakritiEdition.findFirst({
      columns: { nextStudentSequence: true },
      where: (table, { eq: equals }) => equals(table.id, fixture.editionId),
    }),
  ]);
  return {
    audits,
    credentials,
    nextStudentSequence: edition?.nextStudentSequence ?? null,
    students,
  };
}

const [action, argument, limitArgument] = process.argv.slice(2);
let result: unknown;
if (action === "setup" && argument) {
  result = await setup(argument, Number(limitArgument ?? 5));
} else if (action === "state") {
  result = await readState();
} else if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else {
  throw new Error(`Unsupported Student helper action: ${action ?? ""}`);
}

process.stdout.write(`${JSON.stringify(result)}\n`);
