import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAgeCategory,
  kalakritiCenter,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiCompetitionEntry,
  kalakritiCompetitionSession,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiEntryMember,
  kalakritiStudent,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq, inArray } from "drizzle-orm";

const IDS = {
  ageCategory: "019f0000-0000-7000-8000-00000000d001",
  category: "019f0000-0000-7000-8000-00000000d002",
  center: "019f0000-0000-7000-8000-00000000d003",
  competition: "019f0000-0000-7000-8000-00000000d004",
  editionA: "019f0000-0000-7000-8000-00000000d005",
  editionB: "019f0000-0000-7000-8000-00000000d006",
  entryA: "019f0000-0000-7000-8000-00000000d007",
  entryB: "019f0000-0000-7000-8000-00000000d008",
  eventA: "019f0000-0000-7000-8000-00000000d009",
  eventB: "019f0000-0000-7000-8000-00000000d00a",
  memberA: "019f0000-0000-7000-8000-00000000d00b",
  memberB: "019f0000-0000-7000-8000-00000000d00c",
  membershipA: "019f0000-0000-7000-8000-00000000d00d",
  membershipB: "019f0000-0000-7000-8000-00000000d00e",
  session: "019f0000-0000-7000-8000-00000000d00f",
  student: "019f0000-0000-7000-8000-00000000d010",
  venue: "019f0000-0000-7000-8000-00000000d011",
} as const;
const YEARS = [2182, 2183] as const;

async function cleanup() {
  const editionIds = [IDS.editionA, IDS.editionB];
  await db
    .delete(kalakritiEntryMember)
    .where(inArray(kalakritiEntryMember.editionId, editionIds));
  await db
    .delete(kalakritiCompetitionEntry)
    .where(inArray(kalakritiCompetitionEntry.editionId, editionIds));
  await db
    .delete(kalakritiStudent)
    .where(inArray(kalakritiStudent.editionId, editionIds));
  await db
    .delete(kalakritiEditionMembership)
    .where(inArray(kalakritiEditionMembership.editionId, editionIds));
  await db
    .delete(kalakritiCompetitionSession)
    .where(inArray(kalakritiCompetitionSession.editionId, editionIds));
  await db
    .delete(kalakritiCompetition)
    .where(inArray(kalakritiCompetition.editionId, editionIds));
  await db
    .delete(kalakritiCompetitionCategory)
    .where(inArray(kalakritiCompetitionCategory.editionId, editionIds));
  await db
    .delete(kalakritiVenue)
    .where(inArray(kalakritiVenue.editionId, editionIds));
  await db
    .delete(kalakritiAgeCategory)
    .where(inArray(kalakritiAgeCategory.editionId, editionIds));
  await db
    .delete(kalakritiCenter)
    .where(inArray(kalakritiCenter.editionId, editionIds));
  await db
    .delete(kalakritiEdition)
    .where(inArray(kalakritiEdition.id, editionIds));
  await db
    .delete(teamEvent)
    .where(inArray(teamEvent.id, [IDS.eventA, IDS.eventB]));
}

async function setup(email: string) {
  await cleanup();
  const [actor, owningTeam] = await Promise.all([
    db.query.user.findFirst({
      columns: { id: true },
      where: eq(user.email, email),
    }),
    db.query.team.findFirst({ columns: { id: true } }),
  ]);
  if (!(actor && owningTeam)) {
    throw new Error(
      "Kalakriti release race fixture requires an actor and team"
    );
  }
  const now = new Date();
  await db.insert(teamEvent).values([
    {
      createdAt: now,
      createdBy: actor.id,
      id: IDS.eventA,
      managementDomain: "kalakriti",
      name: `Kalakriti ${YEARS[0]}`,
      startTime: new Date(`${YEARS[0]}-11-20T04:30:00.000Z`),
      teamId: owningTeam.id,
      updatedAt: now,
    },
    {
      createdAt: now,
      createdBy: actor.id,
      id: IDS.eventB,
      managementDomain: "kalakriti",
      name: `Kalakriti ${YEARS[1]}`,
      startTime: new Date(`${YEARS[1]}-11-20T04:30:00.000Z`),
      teamId: owningTeam.id,
      updatedAt: now,
    },
  ]);
  await db.insert(kalakritiEdition).values([
    {
      ageCutoffDate: `${YEARS[0]}-06-30`,
      brandingKey: "kalakriti-release-race-a",
      createdAt: now,
      createdBy: actor.id,
      eventDate: `${YEARS[0]}-11-20`,
      id: IDS.editionA,
      lifecycle: "registration_locked",
      name: `Kalakriti ${YEARS[0]}`,
      plannedRegistrationCloseAt: new Date(`${YEARS[0]}-10-31T18:29:00.000Z`),
      teamEventId: IDS.eventA,
      updatedAt: now,
      year: YEARS[0],
    },
    {
      ageCutoffDate: `${YEARS[1]}-06-30`,
      brandingKey: "kalakriti-release-race-b",
      createdAt: now,
      createdBy: actor.id,
      eventDate: `${YEARS[1]}-11-20`,
      id: IDS.editionB,
      lifecycle: "registration_locked",
      name: `Kalakriti ${YEARS[1]}`,
      plannedRegistrationCloseAt: new Date(`${YEARS[1]}-10-31T18:29:00.000Z`),
      teamEventId: IDS.eventB,
      updatedAt: now,
      year: YEARS[1],
    },
  ]);
  await db.insert(kalakritiCenter).values({
    competitionEntryRegistrationEnabled: true,
    createdAt: now,
    createdBy: actor.id,
    editionId: IDS.editionA,
    id: IDS.center,
    name: "Release Race Center",
    normalizedName: "release race center",
    studentRegistrationEnabled: true,
    updatedAt: now,
  });
  await db.insert(kalakritiAgeCategory).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: IDS.editionA,
    id: IDS.ageCategory,
    maxCompetitionsPerCategory: 2,
    maximumAge: 10,
    maxTotalCompetitions: 4,
    minimumAge: 6,
    name: "Junior",
    normalizedName: "junior",
    sortOrder: 0,
    updatedAt: now,
  });
  await db.insert(kalakritiCompetitionCategory).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: IDS.editionA,
    id: IDS.category,
    name: "Release Race Category",
    normalizedName: "release race category",
    sortOrder: 0,
    updatedAt: now,
  });
  await db.insert(kalakritiCompetition).values({
    competitionCategoryId: IDS.category,
    createdAt: now,
    createdBy: actor.id,
    editionId: IDS.editionA,
    genderEligibility: "both",
    id: IDS.competition,
    maximumGroupSize: 1,
    minimumGroupSize: 1,
    name: "Release Race Competition",
    normalizedName: "release race competition",
    participationMode: "individual",
    updatedAt: now,
  });
  await db.insert(kalakritiVenue).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: IDS.editionA,
    id: IDS.venue,
    name: "Release Race Venue",
    normalizedName: "release race venue",
    updatedAt: now,
  });
  await db.insert(kalakritiCompetitionSession).values({
    ageCategoryId: IDS.ageCategory,
    capacity: 2,
    competitionId: IDS.competition,
    createdAt: now,
    createdBy: actor.id,
    editionId: IDS.editionA,
    endAt: new Date(`${YEARS[0]}-11-20T05:30:00.000Z`),
    id: IDS.session,
    startAt: new Date(`${YEARS[0]}-11-20T04:30:00.000Z`),
    updatedAt: now,
    venueId: IDS.venue,
  });
  await db.insert(kalakritiStudent).values({
    ageCategoryId: IDS.ageCategory,
    centerId: IDS.center,
    createdAt: now,
    createdBy: actor.id,
    dateOfBirth: `${YEARS[0] - 8}-06-15`,
    derivedAgeCategoryId: IDS.ageCategory,
    editionId: IDS.editionA,
    gender: "female",
    humanId: `KAL-${YEARS[0]}-0001`,
    id: IDS.student,
    name: "Release Race Student",
    normalizedName: "release race student",
    updatedAt: now,
    updatedBy: actor.id,
  });
  return { actorId: actor.id };
}

function successful(results: PromiseSettledResult<unknown>[]) {
  return results.filter((settled) => settled.status === "fulfilled").length;
}

async function raceLiveEditions() {
  const results = await Promise.allSettled([
    db
      .update(kalakritiEdition)
      .set({ lifecycle: "live", updatedAt: new Date() })
      .where(eq(kalakritiEdition.id, IDS.editionA)),
    db
      .update(kalakritiEdition)
      .set({ lifecycle: "live", updatedAt: new Date() })
      .where(eq(kalakritiEdition.id, IDS.editionB)),
  ]);
  const live = await db
    .select({ id: kalakritiEdition.id })
    .from(kalakritiEdition)
    .where(eq(kalakritiEdition.lifecycle, "live"));
  return { liveCount: live.length, successfulWrites: successful(results) };
}

async function raceMemberships(actorId: string) {
  const now = new Date();
  const values = [IDS.membershipA, IDS.membershipB].map((id) => ({
    createdAt: now,
    createdBy: actorId,
    editionId: IDS.editionA,
    id,
    kind: "volunteer" as const,
    snapshotName: "Release Race Volunteer",
    updatedAt: now,
    userId: actorId,
  }));
  const results = await Promise.allSettled(
    values.map((value) => db.insert(kalakritiEditionMembership).values(value))
  );
  const rows = await db
    .select({ id: kalakritiEditionMembership.id })
    .from(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.editionId, IDS.editionA));
  return {
    membershipCount: rows.length,
    successfulWrites: successful(results),
  };
}

async function raceEntries(actorId: string) {
  const now = new Date();
  const attempts = [
    { entryId: IDS.entryA, memberId: IDS.memberA },
    { entryId: IDS.entryB, memberId: IDS.memberB },
  ];
  const results = await Promise.allSettled(
    attempts.map(({ entryId, memberId }) =>
      db.transaction(async (tx) => {
        await tx.insert(kalakritiCompetitionEntry).values({
          centerId: IDS.center,
          createdAt: now,
          createdBy: actorId,
          editionId: IDS.editionA,
          id: entryId,
          participationMode: "individual",
          sessionId: IDS.session,
          updatedAt: now,
          updatedBy: actorId,
        });
        await tx.insert(kalakritiEntryMember).values({
          centerId: IDS.center,
          createdAt: now,
          createdBy: actorId,
          editionId: IDS.editionA,
          entryId,
          id: memberId,
          sessionId: IDS.session,
          studentId: IDS.student,
        });
      })
    )
  );
  const [entries, members] = await Promise.all([
    db
      .select({ id: kalakritiCompetitionEntry.id })
      .from(kalakritiCompetitionEntry)
      .where(eq(kalakritiCompetitionEntry.editionId, IDS.editionA)),
    db
      .select({ id: kalakritiEntryMember.id })
      .from(kalakritiEntryMember)
      .where(eq(kalakritiEntryMember.editionId, IDS.editionA)),
  ]);
  return {
    entryCount: entries.length,
    memberCount: members.length,
    successfulWrites: successful(results),
  };
}

const [action, actorEmail] = process.argv.slice(2);
let output: unknown;
if (action === "cleanup") {
  await cleanup();
  output = { cleaned: true };
} else if (action === "run" && actorEmail) {
  const { actorId } = await setup(actorEmail);
  const membership = await raceMemberships(actorId);
  const entries = await raceEntries(actorId);
  const live = await raceLiveEditions();
  output = { entries, live, membership };
} else {
  throw new Error(`Unsupported release race action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(output)}\n`);
