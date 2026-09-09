import { writeSync } from "node:fs";

import { db } from "@pi-dash/db";
import {
  kalakritiAgeCategory,
  kalakritiAssignment,
  kalakritiAuditEntry,
  kalakritiCenter,
  kalakritiCenterScanStage,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionDivision,
  kalakritiCompetitionEntry,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiEntryMember,
  kalakritiOperation,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq, inArray } from "drizzle-orm";

const id = (suffix: string) => `019f0000-0042-7000-8000-00000000${suffix}`;
const ids = {
  editionId: id("d101"),
  otherEditionId: id("d102"),
  eventId: id("d103"),
  otherEventId: id("d104"),
  centerId: id("d105"),
  ageCategoryId: id("d106"),
  studentId: id("d107"),
  volunteerId: id("d108"),
  guardianId: id("d109"),
  inactiveId: id("d110"),
  foreignVolunteerId: id("d111"),
  categoryId: id("d112"),
  competitionId: id("d113"),
  divisionId: id("d114"),
  entryId: id("d115"),
  entryMemberId: id("d116"),
  year: 2162,
  otherCenterId: id("d117"),
  otherStudentId: id("d118"),
  liaisonId: id("d119"),
  assignmentId: id("d120"),
} as const;

async function cleanup() {
  await db
    .delete(kalakritiCenterScanStage)
    .where(eq(kalakritiCenterScanStage.editionId, ids.editionId));
  await db
    .delete(kalakritiAssignment)
    .where(eq(kalakritiAssignment.editionId, ids.editionId));
  await db
    .delete(kalakritiOperation)
    .where(eq(kalakritiOperation.editionId, ids.editionId));
  await db
    .delete(kalakritiEntryMember)
    .where(eq(kalakritiEntryMember.editionId, ids.editionId));
  await db
    .delete(kalakritiCompetitionEntry)
    .where(eq(kalakritiCompetitionEntry.editionId, ids.editionId));
  await db
    .delete(kalakritiCompetitionDivision)
    .where(eq(kalakritiCompetitionDivision.editionId, ids.editionId));
  await db
    .delete(kalakritiCompetition)
    .where(eq(kalakritiCompetition.editionId, ids.editionId));
  await db
    .delete(kalakritiCompetitionCategory)
    .where(eq(kalakritiCompetitionCategory.editionId, ids.editionId));
  await db
    .delete(kalakritiStudent)
    .where(eq(kalakritiStudent.editionId, ids.editionId));
  await db
    .delete(kalakritiAgeCategory)
    .where(eq(kalakritiAgeCategory.editionId, ids.editionId));
  await db
    .delete(kalakritiCenter)
    .where(eq(kalakritiCenter.editionId, ids.editionId));
  await db
    .delete(kalakritiEdition)
    .where(inArray(kalakritiEdition.id, [ids.editionId, ids.otherEditionId]));
  await db
    .delete(teamEvent)
    .where(inArray(teamEvent.id, [ids.eventId, ids.otherEventId]));
}

async function setup(email: string, liaisonEmail: string) {
  await cleanup();
  const actor = await db.query.user.findFirst({
    where: (table, { eq: equal }) => equal(table.email, email),
  });
  const liaison = await db.query.user.findFirst({
    where: (table, { eq: equal }) => equal(table.email, liaisonEmail),
  });
  if (!liaison) {
    throw new Error("Operations fixture requires liaison actor");
  }
  const team = await db.query.team.findFirst();
  if (!(actor && team)) {
    throw new Error("Operations fixture requires actor and team");
  }
  const now = new Date();
  const common = { createdAt: now, updatedAt: now, createdBy: actor.id };
  for (const edition of [
    { editionId: ids.editionId, eventId: ids.eventId, year: ids.year },
    {
      editionId: ids.otherEditionId,
      eventId: ids.otherEventId,
      year: ids.year + 1,
    },
  ]) {
    await db.insert(teamEvent).values({
      ...common,
      id: edition.eventId,
      teamId: team.id,
      name: `Operations ${edition.year}`,
      startTime: now,
      managementDomain: "kalakriti",
      isPublic: false,
    });
    await db.insert(kalakritiEdition).values({
      ...common,
      id: edition.editionId,
      teamEventId: edition.eventId,
      year: edition.year,
      name: `Operations ${edition.year}`,
      lifecycle: edition.editionId === ids.editionId ? "live" : "draft",
      ageCutoffDate: `${edition.year}-06-30`,
      eventDate: `${edition.year}-11-21`,
      plannedRegistrationCloseAt: now,
      brandingKey: "kalakriti-student-e2e",
    });
  }
  const editionCommon = { ...common, editionId: ids.editionId };
  await db.insert(kalakritiCenter).values({
    ...editionCommon,
    id: ids.centerId,
    name: "Operations Center",
    normalizedName: "operations center",
    studentRegistrationEnabled: true,
    competitionEntryRegistrationEnabled: true,
  });
  await db.insert(kalakritiAgeCategory).values({
    ...editionCommon,
    id: ids.ageCategoryId,
    name: "Junior",
    normalizedName: "junior",
    minimumAge: 6,
    maximumAge: 10,
    sortOrder: 0,
    femaleStudentLimit: 10,
    maleStudentLimit: 10,
    maxCompetitionsPerCategory: 2,
    maxTotalCompetitions: 4,
  });
  await db.insert(kalakritiStudent).values({
    ...editionCommon,
    id: ids.studentId,
    centerId: ids.centerId,
    ageCategoryId: ids.ageCategoryId,
    derivedAgeCategoryId: ids.ageCategoryId,
    humanId: `KAL-${ids.year}-0001`,
    name: "Operations Student",
    normalizedName: "operations student",
    gender: "female",
    dateOfBirth: `${ids.year - 9}-06-15`,
    updatedBy: actor.id,
  });
  await db.insert(kalakritiCenter).values({
    ...editionCommon,
    id: ids.otherCenterId,
    name: "Outside Center",
    normalizedName: "outside center",
    studentRegistrationEnabled: true,
    competitionEntryRegistrationEnabled: true,
  });
  await db.insert(kalakritiStudent).values({
    ...editionCommon,
    id: ids.otherStudentId,
    centerId: ids.otherCenterId,
    ageCategoryId: ids.ageCategoryId,
    derivedAgeCategoryId: ids.ageCategoryId,
    humanId: `KAL-${ids.year}-0002`,
    name: "Outside Operations Student",
    normalizedName: "outside operations student",
    gender: "female",
    dateOfBirth: `${ids.year - 9}-06-15`,
    updatedBy: actor.id,
  });
  await db.insert(kalakritiEditionMembership).values([
    {
      ...editionCommon,
      id: ids.liaisonId,
      userId: liaison.id,
      kind: "volunteer",
      state: "active",
      snapshotName: "Operations Liaison",
    },
    {
      ...editionCommon,
      id: ids.volunteerId,
      userId: actor.id,
      kind: "volunteer",
      state: "active",
      humanId: `KALV-${ids.year}-0001`,
      snapshotName: "Operations Volunteer",
    },
    {
      ...editionCommon,
      id: ids.guardianId,
      kind: "guardian",
      state: "active",
      snapshotName: "Operations Guardian",
    },
    {
      ...editionCommon,
      id: ids.inactiveId,
      kind: "volunteer",
      state: "archived",
      archivedAt: now,
      snapshotName: "Inactive Volunteer",
    },
    {
      ...common,
      editionId: ids.otherEditionId,
      id: ids.foreignVolunteerId,
      kind: "volunteer",
      state: "active",
      snapshotName: "Other Edition Volunteer",
    },
  ]);
  await db.insert(kalakritiAssignment).values({
    ...editionCommon,
    id: ids.assignmentId,
    membershipId: ids.liaisonId,
    responsibility: "liaison",
    centerId: ids.centerId,
  });
  await db.insert(kalakritiCompetitionCategory).values({
    ...editionCommon,
    id: ids.categoryId,
    name: "Arts",
    normalizedName: "arts",
    sortOrder: 0,
  });
  await db.insert(kalakritiCompetition).values({
    ...editionCommon,
    id: ids.competitionId,
    competitionCategoryId: ids.categoryId,
    name: "Singing",
    normalizedName: "singing",
    genderEligibility: "both",
    participationMode: "individual",
    minimumGroupSize: 1,
    maximumGroupSize: 1,
  });
  await db.insert(kalakritiCompetitionDivision).values({
    ...editionCommon,
    id: ids.divisionId,
    competitionId: ids.competitionId,
    ageCategoryId: ids.ageCategoryId,
  });
  await db.insert(kalakritiCompetitionEntry).values({
    ...editionCommon,
    id: ids.entryId,
    centerId: ids.centerId,
    divisionId: ids.divisionId,
    participationMode: "individual",
    updatedBy: actor.id,
  });
  await db.insert(kalakritiEntryMember).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: ids.editionId,
    id: ids.entryMemberId,
    centerId: ids.centerId,
    divisionId: ids.divisionId,
    entryId: ids.entryId,
    studentId: ids.studentId,
  });
  return ids;
}

async function state() {
  const operations = await db
    .select({
      operationId: kalakritiOperation.operationId,
      studentId: kalakritiOperation.studentId,
      membershipId: kalakritiOperation.membershipId,
      type: kalakritiOperation.type,
    })
    .from(kalakritiOperation)
    .where(eq(kalakritiOperation.editionId, ids.editionId))
    .orderBy(kalakritiOperation.id);
  const audits = await db
    .select({ action: kalakritiAuditEntry.action })
    .from(kalakritiAuditEntry)
    .where(eq(kalakritiAuditEntry.editionId, ids.editionId))
    .orderBy(kalakritiAuditEntry.id);
  const students = await db
    .select({ id: kalakritiStudent.id })
    .from(kalakritiStudent)
    .where(eq(kalakritiStudent.id, ids.studentId));
  const entries = await db
    .select({ id: kalakritiCompetitionEntry.id })
    .from(kalakritiCompetitionEntry)
    .where(eq(kalakritiCompetitionEntry.id, ids.entryId));
  return { operations, audits, students, entries };
}

const [action, email, liaisonEmail] = process.argv.slice(2);
try {
  let result: unknown;
  if (action === "setup" && email && liaisonEmail) {
    result = await setup(email, liaisonEmail);
  } else if (action === "state") {
    result = await state();
  } else if (action === "registration-open") {
    // Reach the deletion history guard instead of failing the lifecycle guard first.
    await db
      .update(kalakritiEdition)
      .set({ lifecycle: "registration_open" })
      .where(eq(kalakritiEdition.id, ids.editionId));
    result = { updated: true };
  } else if (action === "cleanup") {
    await cleanup();
    result = { cleaned: true };
  } else {
    throw new Error(
      "Usage: kalakriti-operations.ts setup <email>|state|registration-open|cleanup"
    );
  }
  writeSync(1, `${JSON.stringify(result)}\n`);
} finally {
  await db.$client.end();
}
