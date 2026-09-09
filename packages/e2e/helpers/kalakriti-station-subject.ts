import { writeSync } from "node:fs";

import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAgeCategory,
  kalakritiAssignment,
  kalakritiCenter,
  kalakritiCenterScanStage,
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
import { eq, inArray } from "drizzle-orm";

import { KALAKRITI_ACTORS } from "../fixtures/kalakriti-actors";

const id = (n: number) =>
  `019f0000-0112-7000-8000-${n.toString(16).padStart(12, "0")}`;
const data = {
  year: 2168,
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
}
async function setup(adminEmail: string) {
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
  return data;
}
const [action, adminEmail] = process.argv.slice(2);
try {
  let result: unknown;
  if (action === "setup" && adminEmail) result = await setup(adminEmail);
  else if (action === "state")
    result = await db
      .select({
        id: kalakritiOperation.id,
        operationId: kalakritiOperation.operationId,
        studentId: kalakritiOperation.studentId,
        membershipId: kalakritiOperation.membershipId,
        type: kalakritiOperation.type,
        sessionId: kalakritiOperation.competitionSessionId,
      })
      .from(kalakritiOperation)
      .where(eq(kalakritiOperation.editionId, data.editionId))
      .orderBy(kalakritiOperation.id);
  else if (action === "remove-combined-hospitality") {
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
