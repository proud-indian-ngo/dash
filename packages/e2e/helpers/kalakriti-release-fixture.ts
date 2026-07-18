import { auth } from "@pi-dash/auth";
import {
  createKalakritiExternalUser,
  setKalakritiExternalUserBlocked,
} from "@pi-dash/auth/kalakriti-external-user";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAgeCategory,
  kalakritiAssignment,
  kalakritiCenter,
  kalakritiCenterAgeQuota,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionEntry,
  kalakritiCompetitionSession,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiEntryMember,
  kalakritiExternalIdentity,
  kalakritiGuardianCenter,
  kalakritiStudent,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent, teamEventMember } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";
import {
  KALAKRITI_ACTORS,
  type KalakritiActorName,
} from "../fixtures/kalakriti-actors";

const prefix = "019f0000-0019-7000-8000-00000000";

export const KALAKRITI_RELEASE_FIXTURE_IDS = {
  categoryId: `${prefix}1909`,
  centerAssignedId: `${prefix}1903`,
  centerOutsideId: `${prefix}1904`,
  editionId: `${prefix}1901`,
  eventId: `${prefix}1902`,
  previousEditionId: `${prefix}1919`,
  previousEventId: `${prefix}1920`,
} as const;

type SeededActorIds = Record<KalakritiActorName, string>;

const membershipIds = {
  categoryLead: `${prefix}1915`,
  editionAdmin: `${prefix}1911`,
  guardian: `${prefix}1916`,
  liaison: `${prefix}1914`,
  overallEventsLead: `${prefix}1913`,
  unrelatedVolunteer: `${prefix}1917`,
  volunteerCoordinator: `${prefix}1912`,
} as const;

const assignmentIds = {
  categoryLead: `${prefix}1925`,
  editionAdmin: `${prefix}1921`,
  liaison: `${prefix}1924`,
  overallEventsLead: `${prefix}1923`,
  volunteerCoordinator: `${prefix}1922`,
} as const;

async function ensureVolunteerActor(
  name: Exclude<KalakritiActorName, "dormantExternalUser" | "guardian">
): Promise<string> {
  const actor = KALAKRITI_ACTORS[name];
  let existing = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, actor.email),
  });

  if (!existing) {
    await auth.api.createUser({
      body: { email: actor.email, name, password: actor.password },
    });
    existing = await db.query.user.findFirst({
      columns: { id: true },
      where: eq(user.email, actor.email),
    });
  }
  if (!existing) {
    throw new Error(`Unable to create Kalakriti actor: ${name}`);
  }

  await db
    .update(user)
    .set({
      banExpires: null,
      banned: false,
      banReason: null,
      emailVerified: true,
      isActive: true,
      role: "volunteer",
    })
    .where(eq(user.id, existing.id));
  return existing.id;
}

async function ensureExternalActor(
  name: "dormantExternalUser" | "guardian"
): Promise<string> {
  const actor = KALAKRITI_ACTORS[name];
  const existing = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, actor.email),
  });
  const actorId =
    existing?.id ??
    (
      await createKalakritiExternalUser({
        email: actor.email,
        name,
        password: actor.password,
        phone: null,
      })
    ).id;

  await db.transaction((tx) =>
    setKalakritiExternalUserBlocked(tx, { blocked: false, userId: actorId })
  );
  return actorId;
}

async function cleanupEdition(
  editionId: string,
  eventId: string
): Promise<void> {
  await db
    .delete(kalakritiEntryMember)
    .where(eq(kalakritiEntryMember.editionId, editionId));
  await db
    .delete(kalakritiCompetitionEntry)
    .where(eq(kalakritiCompetitionEntry.editionId, editionId));
  await db
    .delete(kalakritiStudent)
    .where(eq(kalakritiStudent.editionId, editionId));
  await db
    .delete(kalakritiGuardianCenter)
    .where(eq(kalakritiGuardianCenter.editionId, editionId));
  await db
    .delete(kalakritiAssignment)
    .where(eq(kalakritiAssignment.editionId, editionId));
  await db
    .delete(kalakritiCompetitionSession)
    .where(eq(kalakritiCompetitionSession.editionId, editionId));
  await db
    .delete(kalakritiCompetition)
    .where(eq(kalakritiCompetition.editionId, editionId));
  await db
    .delete(kalakritiCompetitionCategory)
    .where(eq(kalakritiCompetitionCategory.editionId, editionId));
  await db
    .delete(kalakritiVenue)
    .where(eq(kalakritiVenue.editionId, editionId));
  await db
    .delete(kalakritiCenterAgeQuota)
    .where(eq(kalakritiCenterAgeQuota.editionId, editionId));
  await db
    .delete(kalakritiAgeCategory)
    .where(eq(kalakritiAgeCategory.editionId, editionId));
  await db
    .delete(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.editionId, editionId));
  await db
    .delete(kalakritiCenter)
    .where(eq(kalakritiCenter.editionId, editionId));
  await db.delete(kalakritiEdition).where(eq(kalakritiEdition.id, editionId));
  await db.delete(teamEventMember).where(eq(teamEventMember.eventId, eventId));
  await db.delete(teamEvent).where(eq(teamEvent.id, eventId));
}

export async function seedKalakritiReleaseFixture(
  globalAdminId: string,
  teamId: string
): Promise<SeededActorIds> {
  const ids = {} as SeededActorIds;
  const volunteerNames = [
    "editionAdmin",
    "volunteerCoordinator",
    "overallEventsLead",
    "categoryLead",
    "liaison",
    "unrelatedVolunteer",
  ] as const;
  const volunteerIds = await Promise.all(
    volunteerNames.map((name) => ensureVolunteerActor(name))
  );
  volunteerNames.forEach((name, index) => {
    ids[name] = volunteerIds[index]!;
  });
  ids.guardian = await ensureExternalActor("guardian");
  ids.dormantExternalUser = await ensureExternalActor("dormantExternalUser");
  await db.transaction((tx) =>
    setKalakritiExternalUserBlocked(tx, {
      blocked: true,
      userId: ids.dormantExternalUser,
    })
  );

  await db
    .insert(kalakritiExternalIdentity)
    .values([
      { createdAt: new Date(), createdBy: globalAdminId, userId: ids.guardian },
      {
        createdAt: new Date(),
        createdBy: globalAdminId,
        userId: ids.dormantExternalUser,
      },
    ])
    .onConflictDoNothing();

  await cleanupEdition(
    KALAKRITI_RELEASE_FIXTURE_IDS.editionId,
    KALAKRITI_RELEASE_FIXTURE_IDS.eventId
  );
  await cleanupEdition(
    KALAKRITI_RELEASE_FIXTURE_IDS.previousEditionId,
    KALAKRITI_RELEASE_FIXTURE_IDS.previousEventId
  );

  const now = new Date();
  const fixture = KALAKRITI_RELEASE_FIXTURE_IDS;
  await db.insert(teamEvent).values([
    {
      city: "bangalore",
      createdAt: now,
      createdBy: globalAdminId,
      description: "Kalakriti role fixture",
      id: fixture.eventId,
      isPublic: false,
      managementDomain: "kalakriti",
      name: "Kalakriti 2186",
      startTime: new Date("2186-11-21T04:30:00.000Z"),
      teamId,
      updatedAt: now,
    },
    {
      city: "bangalore",
      createdAt: now,
      createdBy: globalAdminId,
      description: "Kalakriti cross-edition role fixture",
      id: fixture.previousEventId,
      isPublic: false,
      managementDomain: "kalakriti",
      name: "Kalakriti 2185",
      startTime: new Date("2185-11-21T04:30:00.000Z"),
      teamId,
      updatedAt: now,
    },
  ]);
  await db.insert(kalakritiEdition).values([
    {
      ageCutoffDate: "2186-06-30",
      brandingKey: "kalakriti-role-fixture-2186",
      createdAt: now,
      createdBy: globalAdminId,
      eventDate: "2186-11-21",
      id: fixture.editionId,
      lifecycle: "registration_open",
      name: "Kalakriti 2186",
      plannedRegistrationCloseAt: new Date("2186-10-31T18:29:00.000Z"),
      teamEventId: fixture.eventId,
      updatedAt: now,
      year: 2186,
    },
    {
      ageCutoffDate: "2185-06-30",
      brandingKey: "kalakriti-role-fixture-2185",
      createdAt: now,
      createdBy: globalAdminId,
      eventDate: "2185-11-21",
      id: fixture.previousEditionId,
      lifecycle: "archived",
      name: "Kalakriti 2185",
      plannedRegistrationCloseAt: new Date("2185-10-31T18:29:00.000Z"),
      teamEventId: fixture.previousEventId,
      updatedAt: now,
      year: 2185,
    },
  ]);
  await db.insert(kalakritiCenter).values([
    {
      competitionEntryRegistrationEnabled: true,
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      id: fixture.centerAssignedId,
      name: "Assigned Center",
      normalizedName: "assigned center",
      studentRegistrationEnabled: true,
      updatedAt: now,
    },
    {
      competitionEntryRegistrationEnabled: true,
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      id: fixture.centerOutsideId,
      name: "Outside Center",
      normalizedName: "outside center",
      studentRegistrationEnabled: true,
      updatedAt: now,
    },
  ]);
  const ageCategoryId = `${prefix}1905`;
  const venueId = `${prefix}1906`;
  const competitionId = `${prefix}1908`;
  const sessionId = `${prefix}1910`;
  await db.insert(kalakritiAgeCategory).values({
    createdAt: now,
    createdBy: globalAdminId,
    editionId: fixture.editionId,
    id: ageCategoryId,
    maxCompetitionsPerCategory: 2,
    maximumAge: 12,
    maxTotalCompetitions: 3,
    minimumAge: 6,
    name: "Junior",
    normalizedName: "junior",
    sortOrder: 0,
    updatedAt: now,
  });
  await db.insert(kalakritiCenterAgeQuota).values([
    {
      ageCategoryId,
      centerId: fixture.centerAssignedId,
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      femaleStudentLimit: 10,
      id: `${prefix}1907`,
      maleStudentLimit: 10,
      updatedAt: now,
    },
    {
      ageCategoryId,
      centerId: fixture.centerOutsideId,
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      femaleStudentLimit: 10,
      id: `${prefix}190a`,
      maleStudentLimit: 10,
      updatedAt: now,
    },
  ]);
  await db.insert(kalakritiCompetitionCategory).values({
    createdAt: now,
    createdBy: globalAdminId,
    editionId: fixture.editionId,
    id: fixture.categoryId,
    name: "Performing Arts",
    normalizedName: "performing arts",
    sortOrder: 0,
    updatedAt: now,
  });
  await db.insert(kalakritiVenue).values({
    createdAt: now,
    createdBy: globalAdminId,
    editionId: fixture.editionId,
    id: venueId,
    name: "Main Stage",
    normalizedName: "main stage",
    updatedAt: now,
  });
  await db.insert(kalakritiCompetition).values({
    competitionCategoryId: fixture.categoryId,
    createdAt: now,
    createdBy: globalAdminId,
    editionId: fixture.editionId,
    genderEligibility: "both",
    id: competitionId,
    maximumGroupSize: 1,
    minimumGroupSize: 1,
    name: "Solo Dance",
    normalizedName: "solo dance",
    participationMode: "individual",
    updatedAt: now,
  });
  await db.insert(kalakritiCompetitionSession).values({
    ageCategoryId,
    capacity: 10,
    competitionId,
    createdAt: now,
    createdBy: globalAdminId,
    editionId: fixture.editionId,
    endAt: new Date("2186-11-21T05:30:00.000Z"),
    id: sessionId,
    startAt: new Date("2186-11-21T04:30:00.000Z"),
    updatedAt: now,
    venueId,
  });

  const assignedVolunteers = [
    "editionAdmin",
    "volunteerCoordinator",
    "overallEventsLead",
    "categoryLead",
    "liaison",
  ] as const;
  await db.insert(kalakritiEditionMembership).values([
    ...assignedVolunteers.map((name) => ({
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      id: membershipIds[name],
      kind: "volunteer" as const,
      snapshotEmail: KALAKRITI_ACTORS[name].email,
      snapshotName: name,
      updatedAt: now,
      userId: ids[name],
    })),
    {
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      id: membershipIds.guardian,
      kind: "guardian" as const,
      snapshotEmail: KALAKRITI_ACTORS.guardian.email,
      snapshotName: "Guardian",
      updatedAt: now,
      userId: ids.guardian,
    },
    {
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.previousEditionId,
      id: `${prefix}1927`,
      kind: "volunteer" as const,
      snapshotEmail: KALAKRITI_ACTORS.unrelatedVolunteer.email,
      snapshotName: "Cross-edition Volunteer",
      updatedAt: now,
      userId: ids.unrelatedVolunteer,
    },
    {
      archivedAt: now,
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.previousEditionId,
      id: `${prefix}1918`,
      kind: "guardian" as const,
      snapshotEmail: KALAKRITI_ACTORS.dormantExternalUser.email,
      snapshotName: "Dormant External User",
      state: "archived" as const,
      updatedAt: now,
      userId: ids.dormantExternalUser,
    },
  ]);
  await db.insert(kalakritiAssignment).values([
    {
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      id: assignmentIds.editionAdmin,
      isPrimary: true,
      membershipId: membershipIds.editionAdmin,
      responsibility: "edition_admin",
    },
    {
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      id: assignmentIds.volunteerCoordinator,
      isPrimary: true,
      membershipId: membershipIds.volunteerCoordinator,
      responsibility: "volunteer_coordinator",
    },
    {
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      id: assignmentIds.overallEventsLead,
      isPrimary: true,
      membershipId: membershipIds.overallEventsLead,
      responsibility: "overall_events_lead",
    },
    {
      competitionCategoryId: fixture.categoryId,
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      id: assignmentIds.categoryLead,
      isPrimary: true,
      membershipId: membershipIds.categoryLead,
      responsibility: "competition_category_lead",
    },
    {
      centerId: fixture.centerAssignedId,
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      id: assignmentIds.liaison,
      isPrimary: true,
      membershipId: membershipIds.liaison,
      responsibility: "liaison",
    },
    {
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.previousEditionId,
      id: `${prefix}1928`,
      isPrimary: true,
      membershipId: `${prefix}1927`,
      responsibility: "edition_admin",
    },
  ]);
  await db.insert(kalakritiGuardianCenter).values({
    centerId: fixture.centerAssignedId,
    createdAt: now,
    createdBy: globalAdminId,
    editionId: fixture.editionId,
    id: `${prefix}1926`,
    membershipId: membershipIds.guardian,
  });
  await db.insert(teamEventMember).values(
    assignedVolunteers.map((name, index) => ({
      addedAt: now,
      eventId: fixture.eventId,
      id: `${prefix}193${index + 1}`,
      userId: ids[name],
    }))
  );
  await db.insert(teamEventMember).values({
    addedAt: now,
    eventId: fixture.previousEventId,
    id: `${prefix}1937`,
    userId: ids.unrelatedVolunteer,
  });

  const studentIds: [string, string] = [`${prefix}1941`, `${prefix}1942`];
  await db.insert(kalakritiStudent).values([
    {
      ageCategoryId,
      centerId: fixture.centerAssignedId,
      createdAt: now,
      createdBy: globalAdminId,
      dateOfBirth: "2178-06-10",
      derivedAgeCategoryId: ageCategoryId,
      editionId: fixture.editionId,
      gender: "female",
      humanId: "KAL-2186-0001",
      id: studentIds[0],
      name: "Assigned Student",
      normalizedName: "assigned student",
      updatedAt: now,
      updatedBy: globalAdminId,
    },
    {
      ageCategoryId,
      centerId: fixture.centerOutsideId,
      createdAt: now,
      createdBy: globalAdminId,
      dateOfBirth: "2178-06-11",
      derivedAgeCategoryId: ageCategoryId,
      editionId: fixture.editionId,
      gender: "male",
      humanId: "KAL-2186-0002",
      id: studentIds[1],
      name: "Outside Student",
      normalizedName: "outside student",
      updatedAt: now,
      updatedBy: globalAdminId,
    },
  ]);
  const entryIds: [string, string] = [`${prefix}1951`, `${prefix}1952`];
  await db.insert(kalakritiCompetitionEntry).values([
    {
      centerId: fixture.centerAssignedId,
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      id: entryIds[0],
      participationMode: "individual",
      sessionId,
      updatedAt: now,
      updatedBy: globalAdminId,
    },
    {
      centerId: fixture.centerOutsideId,
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      id: entryIds[1],
      participationMode: "individual",
      sessionId,
      updatedAt: now,
      updatedBy: globalAdminId,
    },
  ]);
  await db.insert(kalakritiEntryMember).values([
    {
      centerId: fixture.centerAssignedId,
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      entryId: entryIds[0],
      id: `${prefix}1961`,
      sessionId,
      studentId: studentIds[0],
    },
    {
      centerId: fixture.centerOutsideId,
      createdAt: now,
      createdBy: globalAdminId,
      editionId: fixture.editionId,
      entryId: entryIds[1],
      id: `${prefix}1962`,
      sessionId,
      studentId: studentIds[1],
    },
  ]);
  return ids;
}
