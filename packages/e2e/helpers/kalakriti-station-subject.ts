import { writeSync } from "node:fs";

import {
  createKalakritiExternalUser,
  deleteKalakritiExternalUser,
} from "@pi-dash/auth/kalakriti-external-user";
import { db } from "@pi-dash/db";
import { auditLog } from "@pi-dash/db/schema/audit-log";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAgeCategory,
  kalakritiAssignment,
  kalakritiCenter,
  kalakritiCenterScanStage,
  kalakritiGuardianCenter,
  kalakritiExternalIdentity,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionDivision,
  kalakritiCompetitionEntry,
  kalakritiCompetitionSession,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiEntryMember,
  kalakritiOperation,
  kalakritiStudent,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { and, eq, inArray, sql } from "drizzle-orm";

import { KALAKRITI_ACTORS } from "../fixtures/kalakriti-actors";

const id = (n: number) =>
  `019f0000-0112-7000-8000-${n.toString(16).padStart(12, "0")}`;
const data = {
  year: 2168,
  centerB: id(800),
  centerC: id(801),
  scopeGuardianId: id(802),
  scopeLiaisonId: id(803),
  scopeVolunteerA: id(804),
  scopeVolunteerC: id(805),
  scopeGuardianB: id(806),
  scopeGuardianC: id(807),
  extraStudentA: id(808),
  studentB: id(809),
  studentC: id(810),
  extraEntryA: id(811),
  entryB: id(812),
  entryC: id(813),
  groupEntry: id(814),
  divisionId: id(300),
  creationDivisionId: id(301),
  groupDivisionId: id(881),
  groupSessionId: id(882),
  outsideDivisionId: id(884),
  mainEntry: id(400),
  scopeGuardianEmail: "food-scope-guardian@pi-dash.test",
  yearlyGuardianEmail: "yearly-id-guardian@pi-dash.test",
  scopeGuardianPassword: "FoodScopeGuardian!2168",

  editionId: id(1),
  eventId: id(2),
  foreignEditionId: id(3),
  foreignEventId: id(4),
  centerId: id(5),
  ageCategoryId: id(6),
  categoryId: id(7),
  venueId: id(8),
  studentId: id(9),
  studentHumanId: "KAL-2168-0001",
  foreignStudentId: id(10),
  volunteerId: id(11),
  volunteerHumanId: "KALV-2168-0001",
  secondVolunteerId: id(12),
  secondVolunteerHumanId: "KALV-2168-0002",
  guardianId: id(13),
  sessionId: id(100),
  wrongDivisionSessionId: id(101),
  secondSessionId: id(102),
  cancelledSessionId: id(103),
  cancelledCompetitionSessionId: id(105),
  foreignSessionId: id(104),
};
const editions = [data.editionId, data.foreignEditionId];
async function cleanup() {
  for (const table of [
    kalakritiOperation,
    kalakritiCenterScanStage,
    kalakritiGuardianCenter,
    kalakritiAssignment,
    kalakritiEntryMember,
    kalakritiCompetitionEntry,
    kalakritiCompetitionSession,
    kalakritiCompetitionDivision,
    kalakritiCompetition,
    kalakritiCompetitionCategory,
    kalakritiVenue,
    kalakritiStudent,
    kalakritiAgeCategory,
    kalakritiCenter,
    kalakritiEditionMembership,
  ]) {
    await db.delete(table).where(inArray(table.editionId, editions));
  }
  await db
    .delete(kalakritiEdition)
    .where(inArray(kalakritiEdition.id, editions));
  await db
    .delete(teamEvent)
    .where(inArray(teamEvent.id, [data.eventId, data.foreignEventId]));
  for (const email of [data.scopeGuardianEmail, data.yearlyGuardianEmail]) {
    const guardian = await db.query.user.findFirst({
      where: eq(user.email, email),
    });
    if (guardian) await deleteKalakritiExternalUser(guardian.id);
  }
}
async function setup(adminEmail: string, scopes = false) {
  await cleanup();
  const admin = await db.query.user.findFirst({
    where: eq(user.email, adminEmail),
  });
  const team = await db.query.team.findFirst();
  if (!admin || !team)
    throw new Error("Station fixture requires seeded admin and team");
  const now = new Date();
  const common = { createdAt: now, updatedAt: now, createdBy: admin.id };
  for (const [editionId, eventId, year] of [
    [data.editionId, data.eventId, data.year],
    [data.foreignEditionId, data.foreignEventId, data.year + 1],
  ] as const) {
    await db.insert(teamEvent).values({
      ...common,
      id: eventId,
      teamId: team.id,
      name: `Stations ${year}`,
      startTime: now,
      managementDomain: "kalakriti",
      isPublic: false,
    });
    await db.insert(kalakritiEdition).values({
      ...common,
      id: editionId,
      teamEventId: eventId,
      year,
      name: `Stations ${year}`,
      lifecycle: editionId === data.editionId ? "live" : "draft",
      ageCutoffDate: `${year}-06-30`,
      eventDate: `${year}-11-21`,
      plannedRegistrationCloseAt: now,
      brandingKey: "kalakriti-student-e2e",
    });
    const foreign = editionId === data.foreignEditionId;
    await db.insert(kalakritiCenter).values({
      ...common,
      editionId,
      id: foreign ? id(25) : data.centerId,
      name: foreign ? "Foreign Station Center" : "Activity Center",
      normalizedName: foreign ? "foreign station center" : "activity center",
    });
    await db.insert(kalakritiAgeCategory).values({
      ...common,
      editionId,
      id: foreign ? id(26) : data.ageCategoryId,
      name: "Junior",
      normalizedName: "junior",
      minimumAge: 6,
      maximumAge: 10,
      sortOrder: 0,
      femaleStudentLimit: 10,
      maleStudentLimit: 10,
      maxCompetitionsPerCategory: 4,
      maxTotalCompetitions: 6,
    });
    await db.insert(kalakritiCompetitionCategory).values({
      ...common,
      editionId,
      id: foreign ? id(27) : data.categoryId,
      name: "Activities",
      normalizedName: "activities",
      sortOrder: 0,
    });
    await db.insert(kalakritiVenue).values({
      ...common,
      editionId,
      id: foreign ? id(28) : data.venueId,
      name: "Station Hall",
      normalizedName: "station hall",
    });
    await db.insert(kalakritiStudent).values({
      ...common,
      editionId,
      id: foreign ? data.foreignStudentId : data.studentId,
      centerId: foreign ? id(25) : data.centerId,
      ageCategoryId: foreign ? id(26) : data.ageCategoryId,
      derivedAgeCategoryId: foreign ? id(26) : data.ageCategoryId,
      humanId: foreign ? `KAL-${year}-0001` : data.studentHumanId,
      name: foreign ? "Foreign Station Student" : "Activity Student",
      normalizedName: foreign ? "foreign station student" : "activity student",
      gender: "female",
      dateOfBirth: `${year - 9}-06-15`,
      updatedBy: admin.id,
    });
  }
  for (let index = 0; index < 6; index++) {
    const foreign = index === 4;
    const editionId = foreign ? data.foreignEditionId : data.editionId;
    const scoped = { ...common, editionId };
    await db.insert(kalakritiCompetition).values({
      ...scoped,
      id: id(200 + index),
      competitionCategoryId: foreign ? id(27) : data.categoryId,
      name: [
        "Station Singing",
        "Unregistered Painting",
        "Station Dance",
        "Cancelled Drama",
        "Foreign Activity",
        "Cancelled Competition",
      ][index]!,
      normalizedName: `station competition ${index}`,
      cancelledAt: index === 5 ? now : null,
      genderEligibility: "both",
      participationMode: "individual",
      minimumGroupSize: 1,
      maximumGroupSize: 1,
    });
    await db.insert(kalakritiCompetitionDivision).values({
      ...scoped,
      id: id(300 + index),
      competitionId: id(200 + index),
      ageCategoryId: foreign ? id(26) : data.ageCategoryId,
    });
    await db.insert(kalakritiCompetitionSession).values({
      ...scoped,
      id: id(100 + index),
      divisionId: id(300 + index),
      venueId: foreign ? id(28) : data.venueId,
      startAt: new Date(now.getTime() + index * 3600000),
      endAt: new Date(now.getTime() + index * 3600000 + 1800000),
      cancelledAt: index === 3 ? now : null,
    });
    if (index === 0 || index === 2 || index === 3 || index === 5) {
      await db.insert(kalakritiCompetitionEntry).values({
        ...scoped,
        id: id(400 + index),
        centerId: data.centerId,
        divisionId: id(300 + index),
        participationMode: "individual",
        updatedBy: admin.id,
      });
      await db.insert(kalakritiEntryMember).values({
        createdAt: now,
        createdBy: admin.id,
        editionId,
        id: id(500 + index),
        centerId: data.centerId,
        divisionId: id(300 + index),
        entryId: id(400 + index),
        studentId: data.studentId,
      });
    }
  }
  await db.insert(kalakritiEditionMembership).values([
    {
      ...common,
      editionId: data.editionId,
      id: data.volunteerId,
      kind: "volunteer",
      state: "active",
      humanId: data.volunteerHumanId,
      snapshotName: "Activity Volunteer",
    },
    {
      ...common,
      editionId: data.editionId,
      id: data.secondVolunteerId,
      kind: "volunteer",
      state: "active",
      humanId: data.secondVolunteerHumanId,
      snapshotName: "Second Activity Volunteer",
    },
    {
      ...common,
      editionId: data.editionId,
      id: data.guardianId,
      kind: "guardian",
      state: "active",
      snapshotName: "Activity Guardian",
    },
  ]);
  const actors = [
    { email: KALAKRITI_ACTORS.categoryLead.email, roles: ["food_lead"] },
    {
      email: KALAKRITI_ACTORS.volunteerCoordinator.email,
      roles: ["hospitality_member"],
    },
    {
      email: KALAKRITI_ACTORS.overallEventsLead.email,
      roles: ["competition_volunteer"],
    },
    {
      email: KALAKRITI_ACTORS.liaison.email,
      roles: ["food_member", "hospitality_lead", "competition_coordinator"],
    },
  ] as const;
  for (const [index, actor] of actors.entries()) {
    const account = await db.query.user.findFirst({
      where: eq(user.email, actor.email),
    });
    if (!account) throw new Error("Station fixture actor is missing");
    const membershipId = id(600 + index);
    await db.insert(kalakritiEditionMembership).values({
      ...common,
      editionId: data.editionId,
      id: membershipId,
      userId: account.id,
      kind: "volunteer",
      state: "active",
      snapshotName: account.name,
    });
    for (const [roleIndex, responsibility] of actor.roles.entries())
      await db.insert(kalakritiAssignment).values({
        ...common,
        editionId: data.editionId,
        id: id(700 + index * 10 + roleIndex),
        membershipId,
        responsibility,
        competitionId:
          responsibility === "competition_volunteer" ||
          responsibility === "competition_coordinator"
            ? id(200)
            : null,
      });
  }
  if (scopes) await setupScopes(admin.id, common);
  return { ...data, sessionStartAt: now.getTime() };
}
const [action, adminEmail] = process.argv.slice(2);
try {
  let result: unknown;
  if ((action === "setup" || action === "setup-scopes") && adminEmail)
    result = await setup(adminEmail, action === "setup-scopes");
  else if (action === "audit" && adminEmail)
    result = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        outcome: auditLog.outcome,
      })
      .from(auditLog)
      .where(eq(auditLog.targetId, adminEmail));
  else if (action === "guardian-counter")
    result = await db.execute(
      sql`SELECT next_guardian_sequence AS counter FROM kalakriti_edition WHERE id = ${data.editionId}`
    );
  else if (action === "guardian-state")
    result = await db
      .select({
        id: kalakritiEditionMembership.id,
        humanId: kalakritiEditionMembership.humanId,
        state: kalakritiEditionMembership.state,
        name: kalakritiEditionMembership.snapshotName,
      })
      .from(kalakritiEditionMembership)
      .where(
        and(
          eq(
            kalakritiEditionMembership.editionId,
            adminEmail ?? data.editionId
          ),
          inArray(kalakritiEditionMembership.editionId, editions),
          eq(kalakritiEditionMembership.kind, "guardian")
        )
      )
      .orderBy(kalakritiEditionMembership.id);
  else if (action === "state")
    result = await db
      .select({
        id: kalakritiOperation.id,
        operationId: kalakritiOperation.operationId,
        studentId: kalakritiOperation.studentId,
        membershipId: kalakritiOperation.membershipId,
        type: kalakritiOperation.type,
        supersededByOperationId: kalakritiOperation.supersededByOperationId,
        sessionId: kalakritiOperation.competitionSessionId,
      })
      .from(kalakritiOperation)
      .where(eq(kalakritiOperation.editionId, data.editionId))
      .orderBy(kalakritiOperation.id);
  else if (action === "student-state")
    result = await db
      .select({
        id: kalakritiStudent.id,
        centerId: kalakritiStudent.centerId,
        name: kalakritiStudent.name,
        humanId: kalakritiStudent.humanId,
      })
      .from(kalakritiStudent)
      .where(eq(kalakritiStudent.editionId, data.editionId))
      .orderBy(kalakritiStudent.id);
  else if (action === "open-student-registration") {
    const year = new Date().getUTCFullYear();
    await db
      .update(kalakritiEdition)
      .set({
        lifecycle: "registration_open",
        ageCutoffDate: `${year}-06-30`,
        nextStudentSequence: 5,
      })
      .where(eq(kalakritiEdition.id, data.editionId));
    await db
      .update(kalakritiCenter)
      .set({ studentRegistrationEnabled: true })
      .where(eq(kalakritiCenter.editionId, data.editionId));
    await db
      .update(kalakritiAgeCategory)
      .set({ femaleStudentLimit: 3, maleStudentLimit: 3 })
      .where(eq(kalakritiAgeCategory.id, data.ageCategoryId));
    result = { birthYear: String(year - 8) };
  } else if (action === "open-scope-registration") {
    await db
      .update(kalakritiEdition)
      .set({ lifecycle: "registration_open" })
      .where(eq(kalakritiEdition.id, data.editionId));
    await db
      .update(kalakritiCenter)
      .set({ competitionEntryRegistrationEnabled: true })
      .where(eq(kalakritiCenter.editionId, data.editionId));
    result = { updated: true };
  } else if (action === "archive-scoped-guardian") {
    await db
      .update(kalakritiEditionMembership)
      .set({ state: "archived" })
      .where(eq(kalakritiEditionMembership.id, data.scopeGuardianId));
    result = { updated: true };
  } else if (action === "remove-combined-hospitality") {
    await db
      .delete(kalakritiAssignment)
      .where(eq(kalakritiAssignment.id, id(731)));
    result = { removed: true };
  } else if (action === "close" || action === "archive") {
    await db
      .update(kalakritiEdition)
      .set({
        lifecycle: action === "close" ? "registration_locked" : "archived",
      })
      .where(eq(kalakritiEdition.id, data.editionId));
    result = { updated: true };
  } else if (action === "cleanup") {
    await cleanup();
    result = { cleaned: true };
  } else
    throw new Error(
      "Usage: kalakriti-station-subject.ts setup <admin>|state|close|archive|cleanup"
    );
  writeSync(1, `${JSON.stringify(result)}\n`);
} finally {
  await db.$client.end();
}

async function setupScopes(
  adminId: string,
  common: { createdAt: Date; updatedAt: Date; createdBy: string }
) {
  const scoped = { ...common, editionId: data.editionId };
  await db.insert(kalakritiCenter).values([
    {
      ...scoped,
      id: data.centerB,
      name: "Union Center B",
      normalizedName: "union center b",
    },
    {
      ...scoped,
      id: data.centerC,
      name: "Outside Center C",
      normalizedName: "outside center c",
    },
  ]);
  const guardian = await createKalakritiExternalUser({
    email: data.scopeGuardianEmail,
    password: data.scopeGuardianPassword,
    name: "Union Guardian",
    phone: null,
  });
  await db.insert(kalakritiExternalIdentity).values({
    userId: guardian.id,
    createdAt: common.createdAt,
    createdBy: adminId,
  });
  const liaison = await db.query.user.findFirst({
    where: eq(user.email, KALAKRITI_ACTORS.unrelatedVolunteer.email),
  });
  if (!liaison) throw new Error("Scope fixture requires seeded Liaison actor");
  const editionAdmin = await db.query.user.findFirst({
    where: eq(user.email, KALAKRITI_ACTORS.editionAdmin.email),
  });
  if (!editionAdmin)
    throw new Error("Scope fixture requires seeded Edition admin");
  await db.insert(kalakritiEditionMembership).values({
    ...scoped,
    id: id(900),
    userId: editionAdmin.id,
    kind: "volunteer",
    state: "active",
    snapshotName: "Scope Edition Admin",
  });
  await db.insert(kalakritiAssignment).values({
    ...scoped,
    id: id(901),
    membershipId: id(900),
    responsibility: "edition_admin",
  });
  await db.insert(kalakritiEditionMembership).values([
    {
      ...scoped,
      id: data.scopeGuardianId,
      kind: "guardian",
      state: "active",
      userId: guardian.id,
      snapshotName: "Union Guardian",
    },
    {
      ...scoped,
      id: data.scopeLiaisonId,
      kind: "volunteer",
      state: "active",
      userId: liaison.id,
      snapshotName: "Union Liaison",
    },
    {
      ...scoped,
      id: data.scopeVolunteerA,
      kind: "volunteer",
      state: "active",
      humanId: "KALV-2168-0003",
      snapshotName: "Center A Volunteer",
    },
    {
      ...scoped,
      id: data.scopeVolunteerC,
      kind: "volunteer",
      state: "active",
      humanId: "KALV-2168-0004",
      snapshotName: "Outside Volunteer",
    },
    {
      ...scoped,
      id: data.scopeGuardianB,
      kind: "guardian",
      state: "active",
      snapshotName: "Center B Guardian",
    },
    {
      ...scoped,
      id: data.scopeGuardianC,
      kind: "guardian",
      state: "active",
      snapshotName: "Outside Guardian",
    },
  ]);
  await db.insert(kalakritiGuardianCenter).values(
    [
      { membershipId: data.scopeGuardianId, centerId: data.centerId },
      { membershipId: data.scopeGuardianId, centerId: data.centerB },
      { membershipId: data.scopeGuardianB, centerId: data.centerB },
      { membershipId: data.scopeGuardianB, centerId: data.centerC },
      { membershipId: data.scopeGuardianC, centerId: data.centerC },
    ].map((row, index) => ({ ...scoped, ...row, id: id(850 + index) }))
  );
  await db.insert(kalakritiAssignment).values(
    [
      { membershipId: data.scopeLiaisonId, centerId: data.centerId },
      { membershipId: data.scopeLiaisonId, centerId: data.centerB },
      { membershipId: data.scopeVolunteerA, centerId: data.centerId },
      { membershipId: data.scopeVolunteerA, centerId: data.centerC },
      { membershipId: data.secondVolunteerId, centerId: data.centerB },
      { membershipId: data.scopeVolunteerC, centerId: data.centerC },
    ].map((row, index) => ({
      ...scoped,
      ...row,
      responsibility: "liaison" as const,
      id: id(860 + index),
    }))
  );
  for (const [index, student] of [
    {
      id: data.extraStudentA,
      centerId: data.centerId,
      name: "Another Center A Student",
      entryId: data.extraEntryA,
    },
    {
      id: data.studentB,
      centerId: data.centerB,
      name: "Union Student B",
      entryId: data.entryB,
    },
    {
      id: data.studentC,
      centerId: data.centerC,
      name: "Outside Student C",
      entryId: data.entryC,
    },
  ].entries()) {
    await db.insert(kalakritiStudent).values({
      ...scoped,
      id: student.id,
      centerId: student.centerId,
      name: student.name,
      normalizedName: student.name.toLowerCase(),
      humanId: `KAL-2168-000${index + 2}`,
      dateOfBirth: "2159-06-15",
      gender: "female",
      ageCategoryId: data.ageCategoryId,
      derivedAgeCategoryId: data.ageCategoryId,
      updatedBy: adminId,
    });
    await db.insert(kalakritiCompetitionEntry).values({
      ...scoped,
      id: student.entryId,
      centerId: student.centerId,
      divisionId: id(300),
      participationMode: "individual",
      updatedBy: adminId,
    });
    await db.insert(kalakritiEntryMember).values({
      ...scoped,
      id: id(870 + index),
      centerId: student.centerId,
      divisionId: id(300),
      entryId: student.entryId,
      studentId: student.id,
    });
  }
  await db.insert(kalakritiCompetition).values({
    ...scoped,
    id: id(880),
    competitionCategoryId: data.categoryId,
    name: "Union Group Dance",
    normalizedName: "union group dance",
    genderEligibility: "both",
    participationMode: "group",
    minimumGroupSize: 2,
    maximumGroupSize: 5,
  });
  await db.insert(kalakritiCompetitionDivision).values({
    ...scoped,
    id: id(881),
    competitionId: id(880),
    ageCategoryId: data.ageCategoryId,
  });
  await db.insert(kalakritiCompetitionSession).values({
    ...scoped,
    id: id(882),
    divisionId: data.groupDivisionId,
    venueId: data.venueId,
    startAt: new Date(common.createdAt.getTime() + 7 * 3600000),
    endAt: new Date(common.createdAt.getTime() + 7 * 3600000 + 1800000),
  });
  await db.insert(kalakritiCompetition).values({
    ...scoped,
    id: id(883),
    competitionCategoryId: data.categoryId,
    name: "Outside Only Competition",
    normalizedName: "outside only competition",
    genderEligibility: "both",
    participationMode: "individual",
    minimumGroupSize: 1,
    maximumGroupSize: 1,
  });
  await db.insert(kalakritiCompetitionDivision).values({
    ...scoped,
    id: data.outsideDivisionId,
    competitionId: id(883),
    ageCategoryId: data.ageCategoryId,
  });
  await db.insert(kalakritiCompetitionSession).values({
    ...scoped,
    id: id(885),
    divisionId: data.outsideDivisionId,
    venueId: data.venueId,
    startAt: new Date(common.createdAt.getTime() + 8 * 3600000),
    endAt: new Date(common.createdAt.getTime() + 8 * 3600000 + 1800000),
  });
  await db.insert(kalakritiCompetitionEntry).values({
    ...scoped,
    id: id(886),
    centerId: data.centerC,
    divisionId: data.outsideDivisionId,
    participationMode: "individual",
    updatedBy: adminId,
  });
  await db.insert(kalakritiEntryMember).values({
    ...scoped,
    id: id(887),
    centerId: data.centerC,
    divisionId: data.outsideDivisionId,
    entryId: id(886),
    studentId: data.studentC,
  });
  await db.insert(kalakritiCompetitionEntry).values({
    ...scoped,
    id: data.groupEntry,
    centerId: data.centerId,
    divisionId: id(881),
    participationMode: "group",
    updatedBy: adminId,
  });
  await db.insert(kalakritiEntryMember).values(
    [data.studentId, data.extraStudentA].map((studentId, index) => ({
      ...scoped,
      id: id(890 + index),
      centerId: data.centerId,
      divisionId: id(881),
      entryId: data.groupEntry,
      studentId,
    }))
  );
}
