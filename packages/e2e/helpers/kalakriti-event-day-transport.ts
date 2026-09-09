import { writeSync } from "node:fs";

import {
  createKalakritiExternalUser,
  deleteKalakritiExternalUser,
} from "@pi-dash/auth/kalakriti-external-user";
import { db } from "@pi-dash/db";
import {
  kalakritiAgeCategory,
  kalakritiAssignment,
  kalakritiCenter,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiGuardianCenter,
  kalakritiExternalIdentity,
  kalakritiOperation,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

import { KALAKRITI_ACTORS } from "../fixtures/kalakriti-actors";

const id = (suffix: string) => `019f0000-0111-7000-8000-00000000${suffix}`;
const guardianEmail = "station-guardian@pi-dash.test";
const guardianPassword = "StationGuardian!2166";
const fixture = {
  guardianEmail,
  guardianPassword,
  leadMembershipId: id("0012"),
  leadAssignmentId: id("0013"),
  foodMembershipId: id("0014"),
  foodAssignmentId: id("0015"),
  editionId: id("0001"),
  eventId: id("0002"),
  centerId: id("0003"),
  otherCenterId: id("0004"),
  ageCategoryId: id("0005"),
  studentId: id("0006"),
  otherStudentId: id("0007"),
  liaisonMembershipId: id("0008"),
  guardianMembershipId: id("0009"),
  assignmentId: id("0010"),
  guardianCenterId: id("0011"),
  year: 2166,
  humanId: "KAL-2166-0001",
  otherHumanId: "KAL-2166-0002",
} as const;

async function cleanup() {
  await db
    .delete(kalakritiOperation)
    .where(eq(kalakritiOperation.editionId, fixture.editionId));
  await db
    .delete(kalakritiGuardianCenter)
    .where(eq(kalakritiGuardianCenter.editionId, fixture.editionId));
  await db
    .delete(kalakritiAssignment)
    .where(eq(kalakritiAssignment.editionId, fixture.editionId));
  await db
    .delete(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.editionId, fixture.editionId));
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
  const guardian = await db.query.user.findFirst({
    where: (table, { eq: equal }) => equal(table.email, guardianEmail),
  });
  if (guardian) await deleteKalakritiExternalUser(guardian.id);
}

async function setup(
  adminEmail: string,
  liaisonEmail: string,
  leadEmail: string
) {
  await cleanup();
  const [admin, liaison, lead, food, team] = await Promise.all([
    db.query.user.findFirst({
      where: (table, { eq: equals }) => equals(table.email, adminEmail),
    }),
    db.query.user.findFirst({
      where: (table, { eq: equals }) => equals(table.email, liaisonEmail),
    }),
    db.query.user.findFirst({
      where: (table, { eq: equals }) => equals(table.email, leadEmail),
    }),
    db.query.user.findFirst({
      where: (table, { eq: equals }) =>
        equals(table.email, KALAKRITI_ACTORS.categoryLead.email),
    }),
    db.query.team.findFirst(),
  ]);
  if (!(admin && liaison && lead && food && team))
    throw new Error("Event-day fixture requires seeded actors and team");
  const guardian = await createKalakritiExternalUser({
    email: guardianEmail,
    password: guardianPassword,
    name: "Station Guardian",
    phone: null,
  });
  const now = new Date();
  await db
    .insert(kalakritiExternalIdentity)
    .values({ userId: guardian.id, createdAt: now, createdBy: admin.id });
  const common = { createdAt: now, updatedAt: now, createdBy: admin.id };
  await db.insert(teamEvent).values({
    ...common,
    id: fixture.eventId,
    teamId: team.id,
    name: "Event-day transport fixture",
    startTime: now,
    managementDomain: "kalakriti",
    isPublic: false,
  });
  await db.insert(kalakritiEdition).values({
    ...common,
    id: fixture.editionId,
    teamEventId: fixture.eventId,
    year: fixture.year,
    name: "Event-day transport fixture",
    lifecycle: "live",
    ageCutoffDate: `${fixture.year}-06-30`,
    eventDate: `${fixture.year}-11-21`,
    plannedRegistrationCloseAt: now,
    brandingKey: "kalakriti-student-e2e",
  });
  const editionCommon = { ...common, editionId: fixture.editionId };
  await db.insert(kalakritiCenter).values([
    {
      ...editionCommon,
      id: fixture.centerId,
      name: "Station Center A",
      normalizedName: "station center a",
    },
    {
      ...editionCommon,
      id: fixture.otherCenterId,
      name: "Station Center B",
      normalizedName: "station center b",
    },
  ]);
  await db.insert(kalakritiAgeCategory).values({
    ...editionCommon,
    id: fixture.ageCategoryId,
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
  await db.insert(kalakritiStudent).values([
    {
      ...editionCommon,
      id: fixture.studentId,
      centerId: fixture.centerId,
      humanId: fixture.humanId,
      name: "Station Student A",
      normalizedName: "station student a",
      gender: "female",
      dateOfBirth: `${fixture.year - 9}-06-15`,
      ageCategoryId: fixture.ageCategoryId,
      derivedAgeCategoryId: fixture.ageCategoryId,
      updatedBy: admin.id,
    },
    {
      ...editionCommon,
      id: fixture.otherStudentId,
      centerId: fixture.otherCenterId,
      humanId: fixture.otherHumanId,
      name: "Station Student B",
      normalizedName: "station student b",
      gender: "male",
      dateOfBirth: `${fixture.year - 9}-06-15`,
      ageCategoryId: fixture.ageCategoryId,
      derivedAgeCategoryId: fixture.ageCategoryId,
      updatedBy: admin.id,
    },
  ]);
  await db.insert(kalakritiEditionMembership).values([
    {
      ...editionCommon,
      id: fixture.liaisonMembershipId,
      userId: liaison.id,
      kind: "volunteer",
      state: "active",
      snapshotName: liaison.name,
      snapshotEmail: liaison.email,
    },
    {
      ...editionCommon,
      id: fixture.guardianMembershipId,
      userId: guardian.id,
      kind: "guardian",
      state: "active",
      snapshotName: "Station Guardian",
      snapshotEmail: guardianEmail,
    },
  ]);
  await db.insert(kalakritiEditionMembership).values([
    {
      ...editionCommon,
      id: fixture.leadMembershipId,
      userId: lead.id,
      kind: "volunteer",
      state: "active",
      snapshotName: lead.name,
    },
    {
      ...editionCommon,
      id: fixture.foodMembershipId,
      userId: food.id,
      kind: "volunteer",
      state: "active",
      snapshotName: food.name,
    },
  ]);
  await db.insert(kalakritiAssignment).values([
    {
      ...editionCommon,
      id: fixture.leadAssignmentId,
      membershipId: fixture.leadMembershipId,
      responsibility: "transport_lead",
      isPrimary: true,
    },
    {
      ...editionCommon,
      id: fixture.foodAssignmentId,
      membershipId: fixture.foodMembershipId,
      responsibility: "food_lead",
      isPrimary: true,
    },
  ]);
  await db.insert(kalakritiAssignment).values({
    ...editionCommon,
    id: fixture.assignmentId,
    membershipId: fixture.liaisonMembershipId,
    centerId: fixture.centerId,
    responsibility: "liaison",
    isPrimary: true,
  });
  await db.insert(kalakritiGuardianCenter).values({
    ...editionCommon,
    id: fixture.guardianCenterId,
    membershipId: fixture.guardianMembershipId,
    centerId: fixture.centerId,
  });
  return fixture;
}

const [action, adminEmail, liaisonEmail, leadEmail] = process.argv.slice(2);
try {
  let result: unknown;
  if (action === "setup" && adminEmail && liaisonEmail && leadEmail)
    result = await setup(adminEmail, liaisonEmail, leadEmail);
  else if (action === "state")
    result = await db
      .select({
        studentId: kalakritiOperation.studentId,
        type: kalakritiOperation.type,
        operationId: kalakritiOperation.operationId,
      })
      .from(kalakritiOperation)
      .where(eq(kalakritiOperation.editionId, fixture.editionId));
  else if (action === "close") {
    await db
      .update(kalakritiEdition)
      .set({ lifecycle: "registration_locked" })
      .where(eq(kalakritiEdition.id, fixture.editionId));
    result = { closed: true };
  } else if (action === "archive") {
    await db
      .update(kalakritiEdition)
      .set({ lifecycle: "archived" })
      .where(eq(kalakritiEdition.id, fixture.editionId));
    result = { archived: true };
  } else if (action === "cleanup") {
    await cleanup();
    result = { cleaned: true };
  } else
    throw new Error(
      "Usage: kalakriti-event-day-transport.ts setup <admin> <liaison> <lead>|state|close|cleanup"
    );
  writeSync(1, `${JSON.stringify(result)}\n`);
} finally {
  await db.$client.end();
}
