import { writeSync } from "node:fs";

import { eq, sql } from "drizzle-orm";

import { KALAKRITI_ACTORS } from "../fixtures/kalakriti-actors";

const year = 2190;
const id = (number: number) =>
  `019f0000-2190-7000-8000-${number.toString(16).padStart(12, "0")}`;
const editionId = id(1);
const eventId = id(2);
const studentOperations = 6000;
const attendeeOperations = 600;
const counts = {
  centers: 10,
  students: 1500,
  memberships: 300,
  guardianCenters: 300,
  assignments: 600,
  competitions: 30,
  divisions: 30,
  sessions: 30,
  entries: 3000,
  entryMembers: 3000,
  attendees: 200,
  judgeAssignments: 200,
  operations: studentOperations + attendeeOperations,
  transport: 40,
} as const;

function assertTestDatabase() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is required");
  const url = new URL(rawUrl);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/pi-dash-test"
  ) {
    throw new Error(
      "Performance fixture requires a local pi-dash-test database"
    );
  }
}

export async function seedKalakritiPerformance() {
  assertTestDatabase();
  const adminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (!adminEmail) throw new Error("SUPER_ADMIN_EMAIL is required");
  const { db } = await import("@pi-dash/db");
  const categoryAssignmentIndexExperiment =
    process.env.CATEGORY_ASSIGNMENT_INDEX_EXPERIMENT === "true";
  if (categoryAssignmentIndexExperiment) {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS kalakriti_assignment_perf_category_responsibility_idx
      ON kalakriti_assignment (competition_category_id, responsibility, id)`);
  }
  const entryMemberIndexExperiment =
    process.env.ENTRY_MEMBER_INDEX_EXPERIMENT === "true";
  if (entryMemberIndexExperiment) {
    await db.execute(sql`CREATE INDEX IF NOT EXISTS kalakriti_entry_member_perf_student_edition_id_idx
      ON kalakriti_entry_member (student_id, edition_id, id)`);
  }
  const { user } = await import("@pi-dash/db/schema/auth");
  const { team } = await import("@pi-dash/db/schema/team");
  const { teamEvent } = await import("@pi-dash/db/schema/team-event");
  const {
    kalakritiAgeCategory,
    kalakritiAssignment,
    kalakritiAttendee,
    kalakritiCenter,
    kalakritiCompetition,
    kalakritiCompetitionCategory,
    kalakritiCompetitionDivision,
    kalakritiCompetitionEntry,
    kalakritiCompetitionSession,
    kalakritiEdition,
    kalakritiEditionMembership,
    kalakritiEntryMember,
    kalakritiGuardianCenter,
    kalakritiJudgeAssignment,
    kalakritiOperation,
    kalakritiStudent,
    kalakritiTransportAssignment,
    kalakritiVenue,
  } = await import("@pi-dash/db/schema/kalakriti");

  const [admin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, adminEmail))
    .limit(1);
  const [guardianActor] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, KALAKRITI_ACTORS.unrelatedVolunteer.email))
    .limit(1);
  const [liaisonActor] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, KALAKRITI_ACTORS.liaison.email))
    .limit(1);
  const [editionAdminActor] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, KALAKRITI_ACTORS.editionAdmin.email))
    .limit(1);
  const [coordinatorActor] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, KALAKRITI_ACTORS.volunteerCoordinator.email))
    .limit(1);
  const [owningTeam] = await db.select({ id: team.id }).from(team).limit(1);
  if (
    !(
      admin &&
      guardianActor &&
      liaisonActor &&
      editionAdminActor &&
      coordinatorActor &&
      owningTeam
    )
  ) {
    throw new Error(
      "Performance fixture requires the seeded admin, actors and team"
    );
  }

  const now = new Date();
  const common = { createdAt: now, createdBy: admin.id, updatedAt: now };
  const scoped = { ...common, editionId };
  const centerId = (index: number) => id(100 + index);
  const studentId = (index: number) => id(1000 + index);
  const membershipId = (index: number) => id(3000 + index);
  const competitionId = (index: number) => id(5000 + index);
  const divisionId = (index: number) => id(6000 + index);
  const sessionId = (index: number) => id(7000 + index);
  const entryId = (index: number) => id(10_000 + index);
  const attendeeId = (index: number) => id(60_001 + index);

  await db.transaction(async (tx) => {
    await tx
      .insert(teamEvent)
      .values({
        ...common,
        id: eventId,
        teamId: owningTeam.id,
        name: `Kalakriti performance ${year}`,
        managementDomain: "kalakriti",
        isPublic: false,
        startTime: new Date(`${year}-11-21T04:30:00.000Z`),
      })
      .onConflictDoNothing({ target: teamEvent.id });
    await tx
      .insert(kalakritiEdition)
      .values({
        ...common,
        id: editionId,
        teamEventId: eventId,
        year,
        name: `Kalakriti performance ${year}`,
        lifecycle: "registration_open",
        ageCutoffDate: `${year}-06-30`,
        eventDate: `${year}-11-21`,
        plannedRegistrationCloseAt: new Date(`${year}-10-31T18:29:00.000Z`),
        brandingKey: "kalakriti-performance-test",
      })
      .onConflictDoNothing({ target: kalakritiEdition.id });

    await tx
      .insert(kalakritiCenter)
      .values(
        Array.from({ length: counts.centers }, (_, index) => ({
          ...scoped,
          id: centerId(index),
          name: `Performance Center ${index + 1}`,
          normalizedName: `performance center ${index + 1}`,
        }))
      )
      .onConflictDoNothing({ target: kalakritiCenter.id });
    await tx
      .insert(kalakritiAgeCategory)
      .values({
        ...scoped,
        id: id(200),
        name: "Performance Junior",
        normalizedName: "performance junior",
        minimumAge: 6,
        maximumAge: 16,
        sortOrder: 0,
        femaleStudentLimit: 1000,
        maleStudentLimit: 1000,
        maxCompetitionsPerCategory: 30,
        maxTotalCompetitions: 30,
      })
      .onConflictDoNothing({ target: kalakritiAgeCategory.id });
    await tx
      .insert(kalakritiCompetitionCategory)
      .values({
        ...scoped,
        id: id(300),
        name: "Performance Events",
        normalizedName: "performance events",
        sortOrder: 0,
      })
      .onConflictDoNothing({ target: kalakritiCompetitionCategory.id });
    await tx
      .insert(kalakritiVenue)
      .values({
        ...scoped,
        id: id(400),
        name: "Performance Hall",
        normalizedName: "performance hall",
      })
      .onConflictDoNothing({ target: kalakritiVenue.id });

    for (let start = 0; start < counts.students; start += 500) {
      await tx
        .insert(kalakritiStudent)
        .values(
          Array.from(
            { length: Math.min(500, counts.students - start) },
            (_, offset) => {
              const index = start + offset;
              return {
                ...scoped,
                id: studentId(index),
                centerId: centerId(index % counts.centers),
                ageCategoryId: id(200),
                derivedAgeCategoryId: id(200),
                humanId: `KAL-${year}-${String(index + 1).padStart(4, "0")}`,
                name: `Performance Student ${index + 1}`,
                normalizedName: `performance student ${index + 1}`,
                gender: index % 2 ? ("male" as const) : ("female" as const),
                dateOfBirth: `${year - 10}-06-15`,
                updatedBy: admin.id,
              };
            }
          )
        )
        .onConflictDoNothing({ target: kalakritiStudent.id });
    }

    await tx
      .insert(kalakritiEditionMembership)
      .values(
        Array.from({ length: counts.memberships }, (_, index) => ({
          ...scoped,
          id: membershipId(index),
          kind: index < 150 ? ("guardian" as const) : ("volunteer" as const),
          state: "active" as const,
          snapshotName: `Performance ${index < 150 ? "Guardian" : "Volunteer"} ${index + 1}`,
          userId:
            index === 0
              ? guardianActor.id
              : index === 150
                ? liaisonActor.id
                : index === 151
                  ? editionAdminActor.id
                  : index === 152
                    ? coordinatorActor.id
                    : null,
        }))
      )
      .onConflictDoNothing({ target: kalakritiEditionMembership.id });
    await tx
      .insert(kalakritiGuardianCenter)
      .values(
        Array.from({ length: counts.guardianCenters }, (_, index) => ({
          ...scoped,
          id: id(3500 + index),
          membershipId: membershipId(Math.floor(index / 2)),
          centerId: centerId(
            (Math.floor(index / 2) + (index % 2)) % counts.centers
          ),
        }))
      )
      .onConflictDoNothing({ target: kalakritiGuardianCenter.id });

    await tx
      .insert(kalakritiCompetition)
      .values(
        Array.from({ length: counts.competitions }, (_, index) => ({
          ...scoped,
          id: competitionId(index),
          competitionCategoryId: id(300),
          name: `Performance Competition ${index + 1}`,
          normalizedName: `performance competition ${index + 1}`,
          genderEligibility: "both" as const,
          participationMode: "individual" as const,
          minimumGroupSize: 1,
          maximumGroupSize: 1,
        }))
      )
      .onConflictDoNothing({ target: kalakritiCompetition.id });
    await tx
      .insert(kalakritiCompetitionDivision)
      .values(
        Array.from({ length: counts.divisions }, (_, index) => ({
          ...scoped,
          id: divisionId(index),
          competitionId: competitionId(index),
          ageCategoryId: id(200),
        }))
      )
      .onConflictDoNothing({ target: kalakritiCompetitionDivision.id });
    await tx
      .insert(kalakritiCompetitionSession)
      .values(
        Array.from({ length: counts.sessions }, (_, index) => {
          const startAt = new Date(
            Date.UTC(year, 10, 21, 4 + Math.floor(index / 10), index % 10)
          );
          return {
            ...scoped,
            id: sessionId(index),
            divisionId: divisionId(index),
            venueId: id(400),
            startAt,
            endAt: new Date(startAt.getTime() + 30 * 60_000),
          };
        })
      )
      .onConflictDoNothing({ target: kalakritiCompetitionSession.id });

    await tx
      .insert(kalakritiAssignment)
      .values(
        Array.from({ length: counts.assignments }, (_, index) => {
          const volunteer = Math.floor(index / 4);
          if (index === 6 || index === 10) {
            return {
              ...scoped,
              id: id(4000 + index),
              membershipId: membershipId(150 + volunteer),
              responsibility:
                index === 6
                  ? ("edition_admin" as const)
                  : ("volunteer_coordinator" as const),
            };
          }
          return index % 4 < 2
            ? {
                ...scoped,
                id: id(4000 + index),
                membershipId: membershipId(150 + volunteer),
                responsibility: "liaison" as const,
                centerId: centerId((volunteer + (index % 4)) % counts.centers),
              }
            : {
                ...scoped,
                id: id(4000 + index),
                membershipId: membershipId(150 + volunteer),
                responsibility: "competition_volunteer" as const,
                competitionId: competitionId(
                  (volunteer + (index % 4)) % counts.competitions
                ),
              };
        })
      )
      .onConflictDoNothing({ target: kalakritiAssignment.id });

    await tx
      .insert(kalakritiAttendee)
      .values(
        Array.from({ length: counts.attendees }, (_, index) => {
          const kind: "guest" | "judge" =
            index < counts.attendees / 2 ? "guest" : "judge";
          return {
            ...scoped,
            id: attendeeId(index),
            kind,
            humanId: `${kind === "guest" ? "KALGT" : "KALJ"}-${year}-${String((index % 100) + 1).padStart(4, "0")}`,
            name: `Performance ${kind === "guest" ? "Guest" : "Judge"} ${(index % 100) + 1}`,
            phone: `+1555000${String(index).padStart(4, "0")}`,
          };
        })
      )
      .onConflictDoNothing({ target: kalakritiAttendee.id });
    await tx
      .insert(kalakritiJudgeAssignment)
      .values(
        Array.from({ length: counts.judgeAssignments }, (_, index) => {
          const judge = Math.floor(index / 2);
          return {
            id: id(70_001 + index),
            editionId,
            attendeeId: attendeeId(100 + judge),
            competitionId: competitionId(
              (judge + (index % 2)) % counts.competitions
            ),
            createdAt: now,
            createdBy: admin.id,
          };
        })
      )
      .onConflictDoNothing({ target: kalakritiJudgeAssignment.id });

    for (let start = 0; start < counts.entries; start += 500) {
      const length = Math.min(500, counts.entries - start);
      await tx
        .insert(kalakritiCompetitionEntry)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            const studentIndex = index % counts.students;
            return {
              ...scoped,
              id: entryId(index),
              centerId: centerId(studentIndex % counts.centers),
              divisionId: divisionId(Math.floor(index / 100)),
              participationMode: "individual" as const,
              updatedBy: admin.id,
            };
          })
        )
        .onConflictDoNothing({ target: kalakritiCompetitionEntry.id });
      await tx
        .insert(kalakritiEntryMember)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            const studentIndex = index % counts.students;
            return {
              id: id(20_000 + index),
              editionId,
              entryId: entryId(index),
              studentId: studentId(studentIndex),
              centerId: centerId(studentIndex % counts.centers),
              divisionId: divisionId(Math.floor(index / 100)),
              createdAt: now,
              createdBy: admin.id,
            };
          })
        )
        .onConflictDoNothing({ target: kalakritiEntryMember.id });
    }

    await tx
      .insert(kalakritiTransportAssignment)
      .values(
        Array.from({ length: counts.transport }, (_, index) => ({
          ...scoped,
          id: id(50_000 + index),
          centerId: centerId(index % counts.centers),
          capacity: 50,
          driverName: `Performance Driver ${index + 1}`,
          vehicleLabel: `Performance Bus ${index + 1}`,
        }))
      )
      .onConflictDoNothing({ target: kalakritiTransportAssignment.id });

    const operationTypes = [
      "pickup",
      "venue_arrival",
      "breakfast",
      "lunch",
    ] as const;
    for (let start = 0; start < studentOperations; start += 500) {
      await tx
        .insert(kalakritiOperation)
        .values(
          Array.from(
            { length: Math.min(500, studentOperations - start) },
            (_, offset) => {
              const index = start + offset;
              return {
                id: id(30_000 + index),
                editionId,
                operationId: id(40_000 + index),
                studentId: studentId(Math.floor(index / operationTypes.length)),
                type: operationTypes[index % operationTypes.length]!,
                occurredAt: now,
                createdAt: now,
                recordedBy: admin.id,
              };
            }
          )
        )
        .onConflictDoNothing({ target: kalakritiOperation.id });
    }
    const attendeeOperationTypes = [
      "attendee_check_in",
      "breakfast",
      "lunch",
    ] as const;
    for (let start = 0; start < attendeeOperations; start += 300) {
      await tx
        .insert(kalakritiOperation)
        .values(
          Array.from(
            { length: Math.min(300, attendeeOperations - start) },
            (_, offset) => {
              const index = start + offset;
              return {
                id: id(80_001 + index),
                editionId,
                operationId: id(90_001 + index),
                attendeeId: attendeeId(
                  Math.floor(index / attendeeOperationTypes.length)
                ),
                type: attendeeOperationTypes[
                  index % attendeeOperationTypes.length
                ]!,
                occurredAt: now,
                createdAt: now,
                recordedBy: admin.id,
              };
            }
          )
        )
        .onConflictDoNothing({ target: kalakritiOperation.id });
    }
  });

  const tables = {
    centers: kalakritiCenter,
    students: kalakritiStudent,
    memberships: kalakritiEditionMembership,
    guardianCenters: kalakritiGuardianCenter,
    assignments: kalakritiAssignment,
    competitions: kalakritiCompetition,
    divisions: kalakritiCompetitionDivision,
    sessions: kalakritiCompetitionSession,
    entries: kalakritiCompetitionEntry,
    entryMembers: kalakritiEntryMember,
    attendees: kalakritiAttendee,
    judgeAssignments: kalakritiJudgeAssignment,
    operations: kalakritiOperation,
    transport: kalakritiTransportAssignment,
  };
  const actualCounts = Object.fromEntries(
    await Promise.all(
      Object.entries(tables).map(async ([name, table]) => {
        const rows = await db.execute(sql`
          SELECT count(*)::integer AS total
          FROM ${table}
          WHERE ${table.editionId} = ${editionId}
        `);
        return [name, Number(rows[0]?.total)];
      })
    )
  );
  for (const [name, expected] of Object.entries(counts)) {
    if (actualCounts[name] !== expected) {
      throw new Error(`Performance fixture ${name} count mismatch`);
    }
  }

  const scopedCounts = {
    students: (counts.students / counts.centers) * 2,
    entries: (counts.entries / counts.centers) * 2,
  };
  for (const [name, table] of [
    ["students", kalakritiStudent],
    ["entries", kalakritiCompetitionEntry],
  ] as const) {
    const rows = await db.execute(sql`
      SELECT count(*)::integer AS total
      FROM ${table}
      WHERE ${table.editionId} = ${editionId}
        AND ${table.centerId} IN (${centerId(0)}, ${centerId(1)})
    `);
    if (Number(rows[0]?.total) !== scopedCounts[name]) {
      throw new Error(`Performance fixture scoped ${name} count mismatch`);
    }
  }

  return {
    categoryAssignmentIndexExperiment,
    entryMemberIndexExperiment,
    editionId,
    year,
    counts: actualCounts,
    scopedCounts,
    scopedCenterIds: [centerId(0), centerId(1)],
    firstDivisionId: divisionId(0),
    firstSessionId: sessionId(0),
  };
}

if (import.meta.main) {
  const result = await seedKalakritiPerformance();
  writeSync(1, `${JSON.stringify(result)}\n`);
  const { db } = await import("@pi-dash/db");
  await db.$client.end();
}
