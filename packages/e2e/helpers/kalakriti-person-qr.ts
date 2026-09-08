import { writeSync } from "node:fs";

import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAgeCategory,
  kalakritiAuditEntry,
  kalakritiCenter,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionDivision,
  kalakritiCompetitionEntry,
  kalakritiEntryMember,
  kalakritiGuardianCenter,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

const fixture = {
  ageCategoryId: "019f0000-0000-7000-8000-00000000c106",
  centerId: "019f0000-0000-7000-8000-00000000c104",
  editionId: "019f0000-0000-7000-8000-00000000c101",
  eventId: "019f0000-0000-7000-8000-00000000c102",
  membershipId: "019f0000-0000-7000-8000-00000000c107",
  guardianId: "019f0000-0000-7000-8000-00000000c108",
  guardianCenterId: "019f0000-0000-7000-8000-00000000c109",
  categoryId: "019f0000-0000-7000-8000-00000000c110",
  studentId: "019f0000-0000-7000-8000-00000000c103",
  year: 2025,
  olderEditionId: "019f0000-0000-7000-8000-00000000c170",
  olderEventId: "019f0000-0000-7000-8000-00000000c171",
  olderMembershipId: "019f0000-0000-7000-8000-00000000c172",
  yearlyUserId: "019f0000-0000-7000-8000-00000000c173",
  noYearUserId: "019f0000-0000-7000-8000-00000000c174",
  noYearMembershipId: "019f0000-0000-7000-8000-00000000c175",
} as const;

async function cleanup() {
  await db
    .delete(kalakritiEntryMember)
    .where(eq(kalakritiEntryMember.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetitionEntry)
    .where(eq(kalakritiCompetitionEntry.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetitionDivision)
    .where(eq(kalakritiCompetitionDivision.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetition)
    .where(eq(kalakritiCompetition.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetitionCategory)
    .where(eq(kalakritiCompetitionCategory.editionId, fixture.editionId));
  await db
    .delete(kalakritiGuardianCenter)
    .where(eq(kalakritiGuardianCenter.editionId, fixture.editionId));
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
  await db
    .delete(kalakritiEdition)
    .where(eq(kalakritiEdition.id, fixture.olderEditionId));
  await db.delete(teamEvent).where(eq(teamEvent.id, fixture.olderEventId));
  await db.delete(user).where(eq(user.id, fixture.yearlyUserId));
  await db.delete(user).where(eq(user.id, fixture.noYearUserId));
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
    nextStudentSequence: 3,
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
  await db.insert(kalakritiStudent).values({
    ageCategoryId: fixture.ageCategoryId,
    centerId: fixture.centerId,
    createdAt: now,
    createdBy: actor.id,
    dateOfBirth: `${fixture.year - 10}-06-15`,
    derivedAgeCategoryId: fixture.ageCategoryId,
    editionId: fixture.editionId,
    gender: "female",
    humanId: `KAL-${fixture.year}-0002`,
    id: "019f0000-0000-7000-8000-00000000c160",
    name: "Credential Group Partner",
    normalizedName: "credential group partner",
    updatedAt: now,
    updatedBy: actor.id,
  });
  await db.insert(kalakritiEditionMembership).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    id: fixture.membershipId,
    kind: "volunteer",
    snapshotName: "Credential Volunteer",
    state: "active",
    updatedAt: now,
    userId: actor.id,
  });
  await db.insert(kalakritiEditionMembership).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    id: fixture.guardianId,
    kind: "guardian",
    snapshotName: "Credential Guardian",
    state: "active",
    updatedAt: now,
    userId: null,
  });
  await db.insert(kalakritiGuardianCenter).values({
    id: fixture.guardianCenterId,
    membershipId: fixture.guardianId,
    centerId: fixture.centerId,
    editionId: fixture.editionId,
    createdAt: now,
    createdBy: actor.id,
  });
  const common = {
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
  };
  await db.insert(kalakritiCompetitionCategory).values({
    ...common,
    id: fixture.categoryId,
    name: "Performing Arts",
    normalizedName: "performing arts",
    sortOrder: 0,
    updatedAt: now,
  });
  for (const [index, mode] of (["individual", "group"] as const).entries()) {
    const competitionId = `019f0000-0000-7000-8000-00000000c12${index}`;
    const divisionId = `019f0000-0000-7000-8000-00000000c13${index}`;
    const entryId = `019f0000-0000-7000-8000-00000000c14${index}`;
    await db.insert(kalakritiCompetition).values({
      ...common,
      id: competitionId,
      competitionCategoryId: fixture.categoryId,
      genderEligibility: "both",
      participationMode: mode,
      minimumGroupSize: mode === "group" ? 2 : 1,
      maximumGroupSize: mode === "group" ? 4 : 1,
      name: mode === "group" ? "Group Dance" : "Solo Singing",
      normalizedName: mode === "group" ? "group dance" : "solo singing",
      updatedAt: now,
    });
    await db.insert(kalakritiCompetitionDivision).values({
      ...common,
      id: divisionId,
      competitionId,
      ageCategoryId: fixture.ageCategoryId,
      updatedAt: now,
    });
    await db.insert(kalakritiCompetitionEntry).values({
      ...common,
      id: entryId,
      divisionId,
      centerId: fixture.centerId,
      participationMode: mode,
      updatedAt: now,
      updatedBy: actor.id,
    });
    await db.insert(kalakritiEntryMember).values({
      ...common,
      id: `019f0000-0000-7000-8000-00000000c15${index}`,
      divisionId,
      entryId,
      centerId: fixture.centerId,
      studentId: fixture.studentId,
    });
    if (mode === "group") {
      await db.insert(kalakritiEntryMember).values({
        ...common,
        id: "019f0000-0000-7000-8000-00000000c161",
        divisionId,
        entryId,
        centerId: fixture.centerId,
        studentId: "019f0000-0000-7000-8000-00000000c160",
      });
    }
  }
  return {
    guardianId: fixture.guardianId,
    humanId,
    membershipId: fixture.membershipId,
    studentId: fixture.studentId,
    year: fixture.year,
  };
}

async function setupYearlyIds(actorEmail: string) {
  const result = await setup(actorEmail);
  const [edition] = await db
    .select()
    .from(kalakritiEdition)
    .where(eq(kalakritiEdition.id, fixture.editionId));
  const [event] = await db
    .select()
    .from(teamEvent)
    .where(eq(teamEvent.id, fixture.eventId));
  if (!(edition && event)) {
    throw new Error("Person QR fixture Edition missing");
  }
  await db.insert(user).values([
    {
      id: fixture.yearlyUserId,
      name: "QR Multi Year Volunteer",
      registrationGroup: "Morning team",
      email: "qr-multi-year@e2e.test",
      role: "volunteer",
      emailVerified: true,
    },
    {
      id: fixture.noYearUserId,
      name: "QR No Year Volunteer",
      email: "qr-no-year@e2e.test",
      role: "volunteer",
      emailVerified: true,
    },
  ]);
  await db
    .update(kalakritiEditionMembership)
    .set({
      userId: fixture.yearlyUserId,
      snapshotName: "QR Multi Year Volunteer",
      humanId: `KALV-${fixture.year}-0001`,
    })
    .where(eq(kalakritiEditionMembership.id, fixture.membershipId));
  await db.insert(kalakritiEditionMembership).values({
    id: fixture.noYearMembershipId,
    editionId: fixture.editionId,
    userId: fixture.noYearUserId,
    kind: "volunteer",
    state: "active",
    snapshotName: "QR No Year Volunteer",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: edition.createdBy,
  });
  await db.insert(teamEvent).values({
    ...event,
    id: fixture.olderEventId,
    name: `Kalakriti ${fixture.year - 1}`,
  });
  await db.insert(kalakritiEdition).values({
    ...edition,
    id: fixture.olderEditionId,
    teamEventId: fixture.olderEventId,
    year: fixture.year - 1,
    name: `Kalakriti ${fixture.year - 1}`,
  });
  await db.insert(kalakritiEditionMembership).values({
    id: fixture.olderMembershipId,
    editionId: fixture.olderEditionId,
    userId: fixture.yearlyUserId,
    kind: "volunteer",
    state: "archived",
    snapshotName: "QR Multi Year Volunteer",
    humanId: `KALV-${fixture.year - 1}-0007`,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: edition.createdBy,
  });
  return result;
}

async function readState() {
  const audits = await db
    .select({ action: kalakritiAuditEntry.action })
    .from(kalakritiAuditEntry)
    .where(eq(kalakritiAuditEntry.editionId, fixture.editionId))
    .orderBy(kalakritiAuditEntry.id);
  return { audits };
}

const [action, argument] = process.argv.slice(2);
if (!action) {
  throw new Error("Usage: kalakriti-person-qr.ts <setup|state> [actorEmail]");
}

async function main() {
  if (action === "setup-yearly-ids") {
    if (!argument) {
      throw new Error("setup-yearly-ids requires actorEmail");
    }
    writeSync(1, `${JSON.stringify(await setupYearlyIds(argument))}\n`);
    await db.$client.end();
    process.exit(0);
  }
  if (action === "setup") {
    if (!argument) {
      throw new Error("setup requires actorEmail");
    }
    // writeSync to fd 1: async stdout writes can be truncated by process.exit
    // when output is a pipe on loaded CI runners.
    writeSync(1, `${JSON.stringify(await setup(argument))}\n`);
    await db.$client.end();
    process.exit(0);
  }
  if (action === "state") {
    writeSync(1, `${JSON.stringify(await readState())}\n`);
    await db.$client.end();
    process.exit(0);
  }
  if (action === "cleanup") {
    await cleanup();
    process.exit(0);
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
