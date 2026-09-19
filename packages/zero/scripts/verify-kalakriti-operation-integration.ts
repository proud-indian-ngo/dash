import { user } from "@pi-dash/db/schema/auth";
import * as dbSchema from "@pi-dash/db/schema/index";
import {
  kalakritiAgeCategory,
  kalakritiAssignment,
  kalakritiAuditEntry,
  kalakritiCenter,
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
import { role } from "@pi-dash/db/schema/permission";
import { team } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";
/**
 * Verifies Kalakriti operation transactions against a migrated, isolated local
 * PostgreSQL database named `kalakriti_permissions_test` on port 5434.
 *
 * From the repository root:
 *   bun packages/zero/scripts/verify-kalakriti-operation-integration.ts
 *
 * Bun loads DEV_DB_PASSWORD from the repository .env file.
 */
import { SQL } from "bun";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";

import type { Context } from "../src/context";
import { recordKalakritiOperation } from "../src/mutators/kalakriti-operation";
import { schema } from "../src/schema";

const DATABASE_NAME = "kalakriti_permissions_test";
const DATABASE_PORT = "5434";
const password = process.env.DEV_DB_PASSWORD;
if (!password) throw new Error("DEV_DB_PASSWORD is required");

const databaseUrl = new URL(
  `postgres://postgres@localhost:${DATABASE_PORT}/${DATABASE_NAME}`
);
databaseUrl.password = password;
if (
  databaseUrl.protocol !== "postgres:" ||
  databaseUrl.hostname !== "localhost" ||
  databaseUrl.port !== DATABASE_PORT ||
  databaseUrl.pathname !== `/${DATABASE_NAME}`
) {
  throw new Error("Verifier is restricted to the isolated local database");
}

const client = new SQL(databaseUrl.toString(), { max: 6 });
const db = drizzle({ client, schema: dbSchema });
const zeroDb = zeroDrizzle(schema, db);

const fixedUuid = (suffix: number) =>
  `019f0000-5a64-7000-8000-${suffix.toString(16).padStart(12, "0")}`;
const ids = {
  role: "kalakriti-operation-verifier",
  managementUser: "kalakriti-operation-verifier-management",
  categoryUser: "kalakriti-operation-verifier-category",
  team: fixedUuid(1),
  event: fixedUuid(2),
  edition: fixedUuid(3),
  center: fixedUuid(4),
  ageCategory: fixedUuid(5),
  category: fixedUuid(6),
  otherCategory: fixedUuid(7),
  competition: fixedUuid(8),
  division: fixedUuid(9),
  venue: fixedUuid(10),
  session: fixedUuid(11),
  entry: fixedUuid(12),
  managementMembership: fixedUuid(13),
  categoryMembership: fixedUuid(14),
  guardianMembership: fixedUuid(15),
  managementAssignment: fixedUuid(16),
  categoryAssignment: fixedUuid(17),
  students: [fixedUuid(18), fixedUuid(19), fixedUuid(20)],
  entryMembers: [fixedUuid(21), fixedUuid(22), fixedUuid(23)],
} as const;

const managementContext: Context = {
  permissions: ["kalakriti.view"],
  role: ids.role,
  userId: ids.managementUser,
};
const categoryContext: Context = {
  permissions: ["kalakriti.view"],
  role: ids.role,
  userId: ids.categoryUser,
};

async function cleanup() {
  await db
    .delete(kalakritiOperation)
    .where(eq(kalakritiOperation.editionId, ids.edition));
  await db
    .delete(kalakritiAuditEntry)
    .where(eq(kalakritiAuditEntry.editionId, ids.edition));
  await db
    .delete(kalakritiAssignment)
    .where(eq(kalakritiAssignment.editionId, ids.edition));
  await db
    .delete(kalakritiEntryMember)
    .where(eq(kalakritiEntryMember.editionId, ids.edition));
  await db
    .delete(kalakritiCompetitionEntry)
    .where(eq(kalakritiCompetitionEntry.editionId, ids.edition));
  await db
    .delete(kalakritiCompetitionSession)
    .where(eq(kalakritiCompetitionSession.editionId, ids.edition));
  await db
    .delete(kalakritiCompetitionDivision)
    .where(eq(kalakritiCompetitionDivision.editionId, ids.edition));
  await db
    .delete(kalakritiCompetition)
    .where(eq(kalakritiCompetition.editionId, ids.edition));
  await db
    .delete(kalakritiCompetitionCategory)
    .where(eq(kalakritiCompetitionCategory.editionId, ids.edition));
  await db
    .delete(kalakritiStudent)
    .where(eq(kalakritiStudent.editionId, ids.edition));
  await db
    .delete(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.editionId, ids.edition));
  await db
    .delete(kalakritiVenue)
    .where(eq(kalakritiVenue.editionId, ids.edition));
  await db
    .delete(kalakritiAgeCategory)
    .where(eq(kalakritiAgeCategory.editionId, ids.edition));
  await db
    .delete(kalakritiCenter)
    .where(eq(kalakritiCenter.editionId, ids.edition));
  await db.delete(kalakritiEdition).where(eq(kalakritiEdition.id, ids.edition));
  await db.delete(teamEvent).where(eq(teamEvent.id, ids.event));
  await db.delete(team).where(eq(team.id, ids.team));
  await db
    .delete(user)
    .where(inArray(user.id, [ids.managementUser, ids.categoryUser]));
  await db.delete(role).where(eq(role.id, ids.role));
}

async function setup() {
  await cleanup();
  const now = new Date();
  await db.insert(role).values({
    id: ids.role,
    name: "Kalakriti operation verifier",
    isSystem: false,
  });
  await db.insert(user).values([
    {
      id: ids.managementUser,
      email: "kalakriti-operation-management@verify.local",
      name: "Management verifier",
      role: ids.role,
    },
    {
      id: ids.categoryUser,
      email: "kalakriti-operation-category@verify.local",
      name: "Category verifier",
      role: ids.role,
    },
  ]);
  await db.insert(team).values({
    id: ids.team,
    name: "Kalakriti operation verifier team",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(teamEvent).values({
    id: ids.event,
    teamId: ids.team,
    name: "Kalakriti operation verifier event",
    startTime: now,
    managementDomain: "kalakriti",
    isPublic: false,
    createdAt: now,
    updatedAt: now,
    createdBy: ids.managementUser,
  });
  await db.insert(kalakritiEdition).values({
    id: ids.edition,
    teamEventId: ids.event,
    year: 2198,
    name: "Kalakriti operation verifier",
    lifecycle: "live",
    ageCutoffDate: "2198-06-30",
    eventDate: "2198-11-21",
    plannedRegistrationCloseAt: now,
    brandingKey: "kalakriti-operation-verifier",
    createdAt: now,
    updatedAt: now,
    createdBy: ids.managementUser,
  });
  const editionCommon = {
    editionId: ids.edition,
    createdAt: now,
    updatedAt: now,
    createdBy: ids.managementUser,
  };
  await db.insert(kalakritiCenter).values({
    ...editionCommon,
    id: ids.center,
    name: "Verifier Center",
    normalizedName: "verifier center",
    studentRegistrationEnabled: true,
    competitionEntryRegistrationEnabled: true,
  });
  await db.insert(kalakritiAgeCategory).values({
    ...editionCommon,
    id: ids.ageCategory,
    name: "Verifier Juniors",
    normalizedName: "verifier juniors",
    minimumAge: 6,
    maximumAge: 12,
    sortOrder: 0,
    femaleStudentLimit: 10,
    maleStudentLimit: 10,
    maxCompetitionsPerCategory: 2,
    maxTotalCompetitions: 4,
  });
  await db.insert(kalakritiCompetitionCategory).values([
    {
      ...editionCommon,
      id: ids.category,
      name: "Verifier Arts",
      normalizedName: "verifier arts",
      sortOrder: 0,
    },
    {
      ...editionCommon,
      id: ids.otherCategory,
      name: "Verifier Other",
      normalizedName: "verifier other",
      sortOrder: 1,
    },
  ]);
  await db.insert(kalakritiCompetition).values({
    ...editionCommon,
    id: ids.competition,
    competitionCategoryId: ids.category,
    name: "Verifier Group Art",
    normalizedName: "verifier group art",
    genderEligibility: "both",
    participationMode: "group",
    minimumGroupSize: 2,
    maximumGroupSize: 3,
  });
  await db.insert(kalakritiCompetitionDivision).values({
    ...editionCommon,
    id: ids.division,
    competitionId: ids.competition,
    ageCategoryId: ids.ageCategory,
  });
  await db.insert(kalakritiVenue).values({
    ...editionCommon,
    id: ids.venue,
    name: "Verifier Hall",
    normalizedName: "verifier hall",
  });
  await db.insert(kalakritiCompetitionSession).values({
    ...editionCommon,
    id: ids.session,
    divisionId: ids.division,
    venueId: ids.venue,
    startAt: now,
    endAt: new Date(now.getTime() + 60 * 60 * 1000),
  });
  await db.insert(kalakritiStudent).values(
    ids.students.map((studentId, index) => ({
      ...editionCommon,
      id: studentId,
      centerId: ids.center,
      ageCategoryId: ids.ageCategory,
      derivedAgeCategoryId: ids.ageCategory,
      humanId: `KAL-2198-${String(index + 1).padStart(4, "0")}`,
      name: `Verifier Student ${index + 1}`,
      normalizedName: `verifier student ${index + 1}`,
      gender: "female" as const,
      dateOfBirth: "2188-06-15",
      updatedBy: ids.managementUser,
    }))
  );
  await db.insert(kalakritiCompetitionEntry).values({
    ...editionCommon,
    id: ids.entry,
    centerId: ids.center,
    divisionId: ids.division,
    participationMode: "group",
    updatedBy: ids.managementUser,
  });
  await db.insert(kalakritiEntryMember).values(
    ids.students.map((studentId, index) => ({
      id: ids.entryMembers[index]!,
      editionId: ids.edition,
      centerId: ids.center,
      divisionId: ids.division,
      entryId: ids.entry,
      studentId,
      createdAt: now,
      createdBy: ids.managementUser,
    }))
  );
  await db.insert(kalakritiEditionMembership).values([
    {
      ...editionCommon,
      id: ids.managementMembership,
      userId: ids.managementUser,
      kind: "volunteer",
      state: "active",
      snapshotName: "Management verifier",
    },
    {
      ...editionCommon,
      id: ids.categoryMembership,
      userId: ids.categoryUser,
      kind: "volunteer",
      state: "active",
      snapshotName: "Category verifier",
    },
    {
      ...editionCommon,
      id: ids.guardianMembership,
      kind: "guardian",
      state: "active",
      snapshotName: "Guardian verifier",
    },
  ]);
  await db.insert(kalakritiAssignment).values([
    {
      id: ids.managementAssignment,
      editionId: ids.edition,
      membershipId: ids.managementMembership,
      responsibility: "volunteer_management_volunteer",
      createdAt: now,
      createdBy: ids.managementUser,
    },
    {
      id: ids.categoryAssignment,
      editionId: ids.edition,
      membershipId: ids.categoryMembership,
      responsibility: "competition_category_lead",
      competitionCategoryId: ids.otherCategory,
      createdAt: now,
      createdBy: ids.managementUser,
    },
  ]);

  const transportOperations = ids.students.flatMap((studentId, index) => {
    const operations: (typeof kalakritiOperation.$inferInsert)[] = [
      {
        id: uuidv7(),
        operationId: uuidv7(),
        editionId: ids.edition,
        studentId,
        membershipId: null,
        attendeeId: null,
        type: "pickup" as const,
        competitionSessionId: null,
        correctionReason: null,
        supersededByOperationId: null,
        occurredAt: now,
        createdAt: now,
        recordedBy: ids.managementUser,
      },
    ];
    if (index < 2) {
      operations.push({
        ...operations[0]!,
        id: uuidv7(),
        operationId: uuidv7(),
        type: "venue_arrival",
      });
    }
    return operations;
  });
  await db.insert(kalakritiOperation).values(transportOperations);
}

function attendanceArgs(humanId: string) {
  const now = Date.now();
  return {
    auditEntryId: uuidv7(),
    editionId: ids.edition,
    id: uuidv7(),
    now,
    occurredAt: now,
    operationId: uuidv7(),
    sessionId: ids.session,
    humanId,
    type: "competition_attendance" as const,
  };
}

async function attendanceRows() {
  return db
    .select({ studentId: kalakritiOperation.studentId })
    .from(kalakritiOperation)
    .where(
      and(
        eq(kalakritiOperation.editionId, ids.edition),
        eq(kalakritiOperation.type, "competition_attendance")
      )
    );
}

async function verify() {
  await setup();

  let mismatchDenied = false;
  try {
    await zeroDb.transaction((tx) =>
      recordKalakritiOperation(
        tx as never,
        categoryContext,
        attendanceArgs("KAL-2198-0001")
      )
    );
  } catch (error) {
    mismatchDenied = error instanceof Error && error.message === "Unauthorized";
  }
  if (!mismatchDenied || (await attendanceRows()).length !== 0) {
    throw new Error("Mismatched category scope recorded attendance");
  }

  await db
    .update(kalakritiAssignment)
    .set({ competitionCategoryId: ids.category })
    .where(eq(kalakritiAssignment.id, ids.categoryAssignment));

  let rollbackObserved = false;
  try {
    await zeroDb.transaction(async (tx) => {
      await recordKalakritiOperation(
        tx as never,
        categoryContext,
        attendanceArgs("KAL-2198-0001")
      );
      throw new Error("intentional_verifier_rollback");
    });
  } catch (error) {
    rollbackObserved =
      error instanceof Error &&
      error.message === "intentional_verifier_rollback";
  }
  if (!rollbackObserved || (await attendanceRows()).length !== 0) {
    throw new Error(
      "Group attendance transaction did not roll back atomically"
    );
  }

  await Promise.all([
    zeroDb.transaction((tx) =>
      recordKalakritiOperation(
        tx as never,
        categoryContext,
        attendanceArgs("KAL-2198-0001")
      )
    ),
    zeroDb.transaction((tx) =>
      recordKalakritiOperation(
        tx as never,
        categoryContext,
        attendanceArgs("KAL-2198-0002")
      )
    ),
  ]);
  const attendance = await attendanceRows();
  const attendanceCounts = new Map<string, number>();
  for (const operation of attendance) {
    if (!operation.studentId) continue;
    attendanceCounts.set(
      operation.studentId,
      (attendanceCounts.get(operation.studentId) ?? 0) + 1
    );
  }
  if (
    attendanceCounts.get(ids.students[0]) !== 1 ||
    attendanceCounts.get(ids.students[1]) !== 1 ||
    attendanceCounts.has(ids.students[2])
  ) {
    throw new Error(
      "Concurrent group scans did not record each present member exactly once"
    );
  }

  const guardianNow = Date.now();
  await zeroDb.transaction((tx) =>
    recordKalakritiOperation(tx as never, managementContext, {
      auditEntryId: uuidv7(),
      editionId: ids.edition,
      id: uuidv7(),
      now: guardianNow,
      occurredAt: guardianNow,
      operationId: uuidv7(),
      humanId: ids.guardianMembership,
      type: "volunteer_check_in",
    })
  );
  const guardianCheckIns = await db
    .select({ type: kalakritiOperation.type })
    .from(kalakritiOperation)
    .where(
      and(
        eq(kalakritiOperation.editionId, ids.edition),
        eq(kalakritiOperation.membershipId, ids.guardianMembership)
      )
    );
  if (
    guardianCheckIns.length !== 1 ||
    guardianCheckIns[0]?.type !== "guardian_check_in"
  ) {
    throw new Error(
      "Volunteer Management Volunteer did not record Guardian check-in"
    );
  }

  const attendanceAudits = await db
    .select({ id: kalakritiAuditEntry.id })
    .from(kalakritiAuditEntry)
    .where(
      and(
        eq(kalakritiAuditEntry.editionId, ids.edition),
        eq(kalakritiAuditEntry.domain, "event_day_operation")
      )
    );
  return {
    categoryMismatchDenied: mismatchDenied,
    categoryMatchRecorded: true,
    groupAttendance: {
      presentMembersRecordedExactlyOnce: 2,
      absentMembersRecorded: 0,
      attendanceAudits: attendanceAudits.length - 1,
    },
    rollbackVerified: rollbackObserved,
    guardianCheckInType: guardianCheckIns[0].type,
  };
}

try {
  const result = await verify();
  console.log(JSON.stringify(result));
} finally {
  await cleanup();
  await client.close();
}
