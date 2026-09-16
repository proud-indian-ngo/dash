import { writeSync } from "node:fs";

import {
  createKalakritiExternalUser,
  deleteKalakritiExternalUser,
} from "@pi-dash/auth/kalakriti-external-user";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
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
  kalakritiExternalIdentity,
  kalakritiGuardianCenter,
  kalakritiOperation,
  kalakritiStudent,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import {
  kalakritiResult,
  kalakritiResultRevision,
  kalakritiResultScorecard,
  kalakritiResultsState,
  kalakritiStandingsRevision,
} from "@pi-dash/db/schema/kalakriti-results";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { S3Client } from "bun";
import { eq } from "drizzle-orm";

const id = (number: number) =>
  `019f0000-0217-7000-8000-${number.toString(16).padStart(12, "0")}`;
const guardianEmail = "results-guardian@pi-dash.test";
const guardianPassword = "ResultsGuardian!2174";
const fixture = {
  guardianEmail,
  guardianPassword,
  year: 2174,
  editionId: id(1),
  eventId: id(2),
  categoryId: id(3),
  ageCategoryId: id(4),
  competitionId: id(5),
  divisionId: id(6),
  sessionId: id(7),
  venueId: id(8),
  centerAId: id(9),
  centerBId: id(10),
  studentAId: id(11),
  studentBId: id(12),
  studentCId: id(13),
  studentDId: id(22),
  groupEntryId: id(14),
  secondGroupEntryId: id(15),
  coordinatorMembershipId: id(16),
  coordinatorAssignmentId: id(17),
  guardianMembershipId: id(18),
  guardianCenterId: id(19),
  resultId: id(20),
  scorecardId: id(21),
  scorecardKey: `e2e/kalakriti-scorecards/${id(1)}/${id(6)}/${id(21)}-judge.pdf`,
} as const;

function assertIsolatedTarget() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const port = process.env.E2E_DB_PORT ?? "5433";
  if (
    url.hostname !== "localhost" ||
    url.port !== port ||
    url.pathname !== "/pi-dash-test"
  ) {
    throw new Error(`Results fixture requires localhost:${port}/pi-dash-test`);
  }
}

async function cleanup() {
  const editionId = fixture.editionId;
  for (const table of [
    kalakritiStandingsRevision,
    kalakritiResultRevision,
    kalakritiResultsState,
    kalakritiResultScorecard,
    kalakritiResult,
    kalakritiOperation,
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
    kalakritiAuditEntry,
  ]) {
    await db.delete(table).where(eq(table.editionId, editionId));
  }
  await db.delete(kalakritiEdition).where(eq(kalakritiEdition.id, editionId));
  await db.delete(teamEvent).where(eq(teamEvent.id, fixture.eventId));
  const guardian = await db.query.user.findFirst({
    where: eq(user.email, guardianEmail),
  });
  if (guardian) await deleteKalakritiExternalUser(guardian.id);
}

async function setup(adminEmail: string, coordinatorEmail: string) {
  await cleanup();
  const [admin, coordinator, team] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.email, adminEmail) }),
    db.query.user.findFirst({ where: eq(user.email, coordinatorEmail) }),
    db.query.team.findFirst(),
  ]);
  if (!(admin && coordinator && team)) {
    throw new Error(
      "Results fixture requires seeded admin, volunteer, and team"
    );
  }
  const guardian = await createKalakritiExternalUser({
    email: guardianEmail,
    password: guardianPassword,
    name: "Results Guardian",
    phone: null,
  });
  const now = new Date();
  const common = { createdAt: now, updatedAt: now, createdBy: admin.id };
  const scoped = { ...common, editionId: fixture.editionId };
  await db.insert(kalakritiExternalIdentity).values({
    userId: guardian.id,
    createdAt: now,
    createdBy: admin.id,
  });
  await db.insert(teamEvent).values({
    ...common,
    id: fixture.eventId,
    teamId: team.id,
    name: "Results E2E",
    managementDomain: "kalakriti",
    isPublic: false,
    startTime: new Date("2174-11-21T04:30:00.000Z"),
  });
  await db.insert(kalakritiEdition).values({
    ...common,
    id: fixture.editionId,
    teamEventId: fixture.eventId,
    year: fixture.year,
    name: "Results E2E",
    lifecycle: "live",
    ageCutoffDate: "2174-06-30",
    eventDate: "2174-11-21",
    plannedRegistrationCloseAt: now,
    brandingKey: "results-e2e",
  });
  await db.insert(kalakritiCenter).values([
    {
      ...scoped,
      id: fixture.centerAId,
      name: "Results Center A",
      normalizedName: "results center a",
    },
    {
      ...scoped,
      id: fixture.centerBId,
      name: "Results Center B",
      normalizedName: "results center b",
    },
  ]);
  await db.insert(kalakritiAgeCategory).values({
    ...scoped,
    id: fixture.ageCategoryId,
    name: "Junior",
    normalizedName: "junior",
    minimumAge: 6,
    maximumAge: 12,
    sortOrder: 0,
    femaleStudentLimit: 10,
    maleStudentLimit: 10,
    maxCompetitionsPerCategory: 2,
    maxTotalCompetitions: 4,
  });
  await db.insert(kalakritiCompetitionCategory).values({
    ...scoped,
    id: fixture.categoryId,
    name: "Performing Arts",
    normalizedName: "performing arts",
    sortOrder: 0,
  });
  await db.insert(kalakritiCompetition).values({
    ...scoped,
    id: fixture.competitionId,
    competitionCategoryId: fixture.categoryId,
    name: "Group Dance Results",
    normalizedName: "group dance results",
    participationMode: "group",
    genderEligibility: "both",
    minimumGroupSize: 2,
    maximumGroupSize: 3,
  });
  await db.insert(kalakritiVenue).values({
    ...scoped,
    id: fixture.venueId,
    name: "Results Hall",
    normalizedName: "results hall",
  });
  await db.insert(kalakritiCompetitionDivision).values({
    ...scoped,
    id: fixture.divisionId,
    competitionId: fixture.competitionId,
    ageCategoryId: fixture.ageCategoryId,
  });
  await db.insert(kalakritiCompetitionSession).values({
    ...scoped,
    id: fixture.sessionId,
    divisionId: fixture.divisionId,
    venueId: fixture.venueId,
    startAt: new Date("2174-11-21T05:30:00.000Z"),
    endAt: new Date("2174-11-21T06:30:00.000Z"),
  });
  await db.insert(kalakritiStudent).values(
    (
      [
        [
          fixture.studentAId,
          fixture.centerAId,
          "Results Student A",
          "KAL-2174-0001",
        ],
        [
          fixture.studentBId,
          fixture.centerAId,
          "Results Student B",
          "KAL-2174-0002",
        ],
        [
          fixture.studentCId,
          fixture.centerBId,
          "Results Student C",
          "KAL-2174-0003",
        ],
        [
          fixture.studentDId,
          fixture.centerBId,
          "Results Student D",
          "KAL-2174-0004",
        ],
      ] as const
    ).map(([studentId, centerId, name, humanId]) => ({
      ...scoped,
      id: studentId,
      centerId,
      name,
      humanId,
      normalizedName: name.toLowerCase(),
      gender: "female" as const,
      dateOfBirth: "2165-06-15",
      ageCategoryId: fixture.ageCategoryId,
      derivedAgeCategoryId: fixture.ageCategoryId,
      updatedBy: admin.id,
    }))
  );
  await db.insert(kalakritiCompetitionEntry).values([
    {
      ...scoped,
      id: fixture.groupEntryId,
      centerId: fixture.centerAId,
      divisionId: fixture.divisionId,
      participationMode: "group" as const,
      updatedBy: admin.id,
    },
    {
      ...scoped,
      id: fixture.secondGroupEntryId,
      centerId: fixture.centerBId,
      divisionId: fixture.divisionId,
      participationMode: "group" as const,
      updatedBy: admin.id,
    },
  ]);
  await db.insert(kalakritiEntryMember).values(
    [
      {
        studentId: fixture.studentAId,
        centerId: fixture.centerAId,
        entryId: fixture.groupEntryId,
      },
      {
        studentId: fixture.studentBId,
        centerId: fixture.centerAId,
        entryId: fixture.groupEntryId,
      },
      {
        studentId: fixture.studentCId,
        centerId: fixture.centerBId,
        entryId: fixture.secondGroupEntryId,
      },
      {
        studentId: fixture.studentDId,
        centerId: fixture.centerBId,
        entryId: fixture.secondGroupEntryId,
      },
    ].map((row, index) => ({
      ...row,
      id: id(30 + index),
      editionId: fixture.editionId,
      divisionId: fixture.divisionId,
      createdAt: now,
      createdBy: admin.id,
    }))
  );
  await db.insert(kalakritiOperation).values(
    [fixture.studentAId, fixture.studentCId, fixture.studentDId].map(
      (studentId, index) => ({
        id: id(40 + index),
        editionId: fixture.editionId,
        studentId,
        competitionSessionId: fixture.sessionId,
        type: "competition_attendance" as const,
        operationId: id(50 + index),
        createdAt: now,
        occurredAt: now,
        recordedBy: admin.id,
      })
    )
  );
  await db.insert(kalakritiEditionMembership).values([
    {
      ...scoped,
      id: fixture.coordinatorMembershipId,
      userId: coordinator.id,
      kind: "volunteer" as const,
      state: "active" as const,
      snapshotName: coordinator.name,
    },
    {
      ...scoped,
      id: fixture.guardianMembershipId,
      userId: guardian.id,
      kind: "guardian" as const,
      state: "active" as const,
      snapshotName: "Results Guardian",
      snapshotEmail: guardianEmail,
    },
  ]);
  await db.insert(kalakritiAssignment).values({
    ...scoped,
    id: fixture.coordinatorAssignmentId,
    membershipId: fixture.coordinatorMembershipId,
    responsibility: "competition_coordinator",
    competitionId: fixture.competitionId,
    isPrimary: true,
  });
  await db.insert(kalakritiGuardianCenter).values({
    ...scoped,
    id: fixture.guardianCenterId,
    membershipId: fixture.guardianMembershipId,
    centerId: fixture.centerAId,
  });
  await db.insert(kalakritiResultScorecard).values({
    id: fixture.scorecardId,
    editionId: fixture.editionId,
    divisionId: fixture.divisionId,
    objectKey: fixture.scorecardKey,
    fileName: "judge.pdf",
    mimeType: "application/pdf",
    byteSize: 32,
    uploadedAt: now,
    uploadedBy: admin.id,
  });
  await db.insert(kalakritiResult).values({
    id: fixture.resultId,
    editionId: fixture.editionId,
    divisionId: fixture.divisionId,
    version: 1,
    status: "draft",
    scorecardIds: [fixture.scorecardId],
    updatedAt: now,
    updatedBy: admin.id,
  });
  return fixture;
}

async function completeAttendance(adminEmail: string) {
  const admin = await db.query.user.findFirst({
    where: eq(user.email, adminEmail),
  });
  if (!admin) throw new Error("Admin not found");
  const now = new Date();
  await db
    .insert(kalakritiOperation)
    .values({
      id: id(43),
      editionId: fixture.editionId,
      studentId: fixture.studentBId,
      competitionSessionId: fixture.sessionId,
      type: "competition_attendance",
      operationId: id(53),
      createdAt: now,
      occurredAt: now,
      recordedBy: admin.id,
    })
    .onConflictDoNothing();
}

async function state() {
  const [result, resultsState, revisions, scorecardFiles] = await Promise.all([
    db.query.kalakritiResult.findFirst({
      where: eq(kalakritiResult.divisionId, fixture.divisionId),
    }),
    db.query.kalakritiResultsState.findFirst({
      where: eq(kalakritiResultsState.editionId, fixture.editionId),
    }),
    db
      .select()
      .from(kalakritiResultRevision)
      .where(eq(kalakritiResultRevision.editionId, fixture.editionId)),
    db
      .select({
        id: kalakritiResultScorecard.id,
        objectKey: kalakritiResultScorecard.objectKey,
      })
      .from(kalakritiResultScorecard)
      .where(eq(kalakritiResultScorecard.editionId, fixture.editionId)),
  ]);
  return {
    result,
    resultsState,
    revisionCount: revisions.length,
    scorecardFiles,
  };
}

async function cleanupR2(keysJson: string, actorEmail: string) {
  const actor = await db.query.user.findFirst({
    where: eq(user.email, actorEmail),
  });
  if (!actor) throw new Error("Results upload actor not found");
  const keys: unknown = JSON.parse(keysJson);
  const prefix = process.env.R2_KEY_PREFIX ?? "attachments";
  if (
    !Array.isArray(keys) ||
    keys.length > 20 ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !(
          key.startsWith(
            `${prefix}/kalakriti-scorecards/${fixture.editionId}/${fixture.divisionId}/`
          ) ||
          (key.startsWith(`${prefix}/kalakriti-scorecards/tmp/${actor.id}/`) &&
            /-results-(good|retry)\.pdf$/.test(key))
        )
    )
  )
    throw new Error("Refusing non-fixture scorecard object cleanup");
  const client = new S3Client({
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucket: process.env.R2_BUCKET_NAME!,
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  });
  for (const key of keys as string[]) await client.delete(key);
  return { removed: keys.length };
}

assertIsolatedTarget();
const [action, adminEmail, coordinatorEmail] = process.argv.slice(2);
try {
  let output: unknown;
  if (action === "setup" && adminEmail && coordinatorEmail) {
    output = await setup(adminEmail, coordinatorEmail);
  } else if (action === "complete-attendance" && adminEmail) {
    await completeAttendance(adminEmail);
    output = { completed: true };
  } else if (action === "state") output = await state();
  else if (action === "cleanup-r2" && adminEmail && coordinatorEmail) {
    output = await cleanupR2(adminEmail, coordinatorEmail);
  } else if (action === "cleanup") {
    await cleanup();
    output = { cleaned: true };
  } else
    throw new Error(
      "Usage: kalakriti-results.ts setup <admin> <coordinator>|complete-attendance <admin>|state|cleanup"
    );
  writeSync(1, `${JSON.stringify(output)}\n`);
} finally {
  await db.$client.end();
}
