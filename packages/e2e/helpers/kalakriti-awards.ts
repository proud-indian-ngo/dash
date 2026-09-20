import { writeSync } from "node:fs";

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
  kalakritiOperation,
  kalakritiStudent,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import {
  kalakritiAwardCommand,
  kalakritiAwardHandover,
} from "@pi-dash/db/schema/kalakriti-awards";
import {
  kalakritiResult,
  kalakritiResultRevision,
  kalakritiResultScorecard,
  kalakritiResultsState,
  kalakritiStandingsRevision,
} from "@pi-dash/db/schema/kalakriti-results";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq, sql } from "drizzle-orm";

import { KALAKRITI_ACTORS } from "../fixtures/kalakriti-actors";

const id = (number: number) =>
  `019f0000-0218-7000-8000-${number.toString(16).padStart(12, "0")}`;

const fixture = {
  year: 2175,
  editionId: id(1),
  eventId: id(2),
  categoryId: id(3),
  ageCategoryId: id(4),
  venueId: id(5),
  centerAId: id(6),
  centerBId: id(7),
  groupCompetitionId: id(8),
  groupDivisionId: id(9),
  groupSessionId: id(10),
  individualCompetitionId: id(11),
  individualDivisionId: id(12),
  individualSessionId: id(13),
  draftCompetitionId: id(14),
  draftDivisionId: id(15),
  draftSessionId: id(16),
  studentAId: id(21),
  studentBId: id(22),
  studentCId: id(23),
  studentDId: id(24),
  studentEId: id(25),
  studentFId: id(26),
  groupWinnerEntryId: id(31),
  groupRunnerEntryId: id(32),
  groupAlternateEntryId: id(33),
  individualWinnerEntryId: id(34),
  individualRunnerEntryId: id(35),
  draftWinnerEntryId: id(36),
  draftRunnerEntryId: id(37),
  groupResultId: id(41),
  individualResultId: id(42),
  draftResultId: id(43),
  groupScorecardId: id(44),
  replacementScorecardId: id(45),
  individualScorecardId: id(46),
  draftScorecardId: id(47),
  awardsLeadMembershipId: id(51),
  awardsMemberMembershipId: id(52),
  editionAdminMembershipId: id(53),
  unrelatedMembershipId: id(54),
  awardsLeadAssignmentId: id(55),
  awardsMemberAssignmentId: id(56),
  editionAdminAssignmentId: id(57),
} as const;

function assertIsolatedTarget() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const port = process.env.E2E_DB_PORT ?? "5433";
  if (
    url.hostname !== "localhost" ||
    url.port !== port ||
    url.pathname !== "/pi-dash-test"
  ) {
    throw new Error(`Awards fixture requires localhost:${port}/pi-dash-test`);
  }
}

async function cleanup() {
  const { editionId } = fixture;
  for (const table of [
    kalakritiAwardCommand,
    kalakritiAwardHandover,
    kalakritiStandingsRevision,
    kalakritiResultRevision,
    kalakritiResultsState,
    kalakritiResultScorecard,
    kalakritiResult,
    kalakritiOperation,
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
}

async function setup(adminEmail: string) {
  await cleanup();
  const actorEmails = [
    KALAKRITI_ACTORS.categoryLead.email,
    KALAKRITI_ACTORS.volunteerCoordinator.email,
    KALAKRITI_ACTORS.editionAdmin.email,
    KALAKRITI_ACTORS.unrelatedVolunteer.email,
  ];
  const [admin, team, ...actors] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.email, adminEmail) }),
    db.query.team.findFirst(),
    ...actorEmails.map((email) =>
      db.query.user.findFirst({ where: eq(user.email, email) })
    ),
  ]);
  if (!(admin && team && actors.every(Boolean))) {
    throw new Error(
      "Awards fixture requires seeded admin and Kalakriti actors"
    );
  }
  const [awardsLead, awardsMember, editionAdmin, unrelated] = actors;
  if (!(awardsLead && awardsMember && editionAdmin && unrelated)) {
    throw new Error("Awards fixture actors are incomplete");
  }

  const now = new Date();
  const common = { createdAt: now, updatedAt: now, createdBy: admin.id };
  const scoped = { ...common, editionId: fixture.editionId };
  await db.insert(teamEvent).values({
    ...common,
    id: fixture.eventId,
    teamId: team.id,
    name: "Awards E2E",
    managementDomain: "kalakriti",
    isPublic: false,
    startTime: new Date("2175-11-21T04:30:00.000Z"),
  });
  await db.insert(kalakritiEdition).values({
    ...common,
    id: fixture.editionId,
    teamEventId: fixture.eventId,
    year: fixture.year,
    name: "Awards E2E",
    lifecycle: "live",
    ageCutoffDate: "2175-06-30",
    eventDate: "2175-11-21",
    plannedRegistrationCloseAt: now,
    brandingKey: "awards-e2e",
  });
  await db.insert(kalakritiCenter).values([
    {
      ...scoped,
      id: fixture.centerAId,
      name: "Awards Center A",
      normalizedName: "awards center a",
    },
    {
      ...scoped,
      id: fixture.centerBId,
      name: "Awards Center B",
      normalizedName: "awards center b",
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
    femaleStudentLimit: 20,
    maleStudentLimit: 20,
    maxCompetitionsPerCategory: 6,
    maxTotalCompetitions: 6,
  });
  await db.insert(kalakritiCompetitionCategory).values({
    ...scoped,
    id: fixture.categoryId,
    name: "Awards Category",
    normalizedName: "awards category",
    sortOrder: 0,
  });
  await db.insert(kalakritiCompetition).values([
    {
      ...scoped,
      id: fixture.groupCompetitionId,
      competitionCategoryId: fixture.categoryId,
      name: "Awards Group Dance",
      normalizedName: "awards group dance",
      participationMode: "group" as const,
      genderEligibility: "both" as const,
      minimumGroupSize: 2,
      maximumGroupSize: 2,
    },
    {
      ...scoped,
      id: fixture.individualCompetitionId,
      competitionCategoryId: fixture.categoryId,
      name: "Awards Drawing",
      normalizedName: "awards drawing",
      participationMode: "individual" as const,
      genderEligibility: "both" as const,
      minimumGroupSize: 1,
      maximumGroupSize: 1,
    },
    {
      ...scoped,
      id: fixture.draftCompetitionId,
      competitionCategoryId: fixture.categoryId,
      name: "Awards Draft Singing",
      normalizedName: "awards draft singing",
      participationMode: "individual" as const,
      genderEligibility: "both" as const,
      minimumGroupSize: 1,
      maximumGroupSize: 1,
    },
  ]);
  await db.insert(kalakritiVenue).values({
    ...scoped,
    id: fixture.venueId,
    name: "Awards Hall",
    normalizedName: "awards hall",
  });
  await db.insert(kalakritiCompetitionDivision).values([
    {
      ...scoped,
      id: fixture.groupDivisionId,
      competitionId: fixture.groupCompetitionId,
      ageCategoryId: fixture.ageCategoryId,
    },
    {
      ...scoped,
      id: fixture.individualDivisionId,
      competitionId: fixture.individualCompetitionId,
      ageCategoryId: fixture.ageCategoryId,
    },
    {
      ...scoped,
      id: fixture.draftDivisionId,
      competitionId: fixture.draftCompetitionId,
      ageCategoryId: fixture.ageCategoryId,
    },
  ]);
  await db.insert(kalakritiCompetitionSession).values(
    [
      [fixture.groupSessionId, fixture.groupDivisionId, 5],
      [fixture.individualSessionId, fixture.individualDivisionId, 7],
      [fixture.draftSessionId, fixture.draftDivisionId, 9],
    ].map(([sessionId, divisionId, hour]) => ({
      ...scoped,
      id: sessionId as string,
      divisionId: divisionId as string,
      venueId: fixture.venueId,
      startAt: new Date(
        `2175-11-21T${String(hour).padStart(2, "0")}:30:00.000Z`
      ),
      endAt: new Date(
        `2175-11-21T${String(Number(hour) + 1).padStart(2, "0")}:30:00.000Z`
      ),
    }))
  );

  const students = [
    [fixture.studentAId, fixture.centerAId, "Award Student A", "female"],
    [fixture.studentBId, fixture.centerAId, "Award Student B", "male"],
    [fixture.studentCId, fixture.centerBId, "Award Student C", "female"],
    [fixture.studentDId, fixture.centerBId, "Award Student D", "male"],
    [fixture.studentEId, fixture.centerBId, "Award Student E", "female"],
    [fixture.studentFId, fixture.centerBId, "Award Student F", "male"],
  ] as const;
  await db.insert(kalakritiStudent).values(
    students.map(([studentId, centerId, name, gender], index) => ({
      ...scoped,
      id: studentId,
      centerId,
      name,
      humanId: `KAL-2175-${String(index + 1).padStart(4, "0")}`,
      normalizedName: name.toLowerCase(),
      gender,
      dateOfBirth: "2166-06-15",
      ageCategoryId: fixture.ageCategoryId,
      derivedAgeCategoryId: fixture.ageCategoryId,
      updatedBy: admin.id,
    }))
  );

  const entries = [
    [
      fixture.groupWinnerEntryId,
      fixture.centerAId,
      fixture.groupDivisionId,
      "group",
    ],
    [
      fixture.groupRunnerEntryId,
      fixture.centerBId,
      fixture.groupDivisionId,
      "group",
    ],
    [
      fixture.groupAlternateEntryId,
      fixture.centerBId,
      fixture.groupDivisionId,
      "group",
    ],
    [
      fixture.individualWinnerEntryId,
      fixture.centerAId,
      fixture.individualDivisionId,
      "individual",
    ],
    [
      fixture.individualRunnerEntryId,
      fixture.centerBId,
      fixture.individualDivisionId,
      "individual",
    ],
    [
      fixture.draftWinnerEntryId,
      fixture.centerAId,
      fixture.draftDivisionId,
      "individual",
    ],
    [
      fixture.draftRunnerEntryId,
      fixture.centerBId,
      fixture.draftDivisionId,
      "individual",
    ],
  ] as const;
  await db.insert(kalakritiCompetitionEntry).values(
    entries.map(([entryId, centerId, divisionId, participationMode]) => ({
      ...scoped,
      id: entryId,
      centerId,
      divisionId,
      participationMode,
      updatedBy: admin.id,
    }))
  );
  const members = [
    [
      fixture.groupWinnerEntryId,
      fixture.groupDivisionId,
      fixture.centerAId,
      fixture.studentAId,
    ],
    [
      fixture.groupWinnerEntryId,
      fixture.groupDivisionId,
      fixture.centerAId,
      fixture.studentBId,
    ],
    [
      fixture.groupRunnerEntryId,
      fixture.groupDivisionId,
      fixture.centerBId,
      fixture.studentCId,
    ],
    [
      fixture.groupRunnerEntryId,
      fixture.groupDivisionId,
      fixture.centerBId,
      fixture.studentDId,
    ],
    [
      fixture.groupAlternateEntryId,
      fixture.groupDivisionId,
      fixture.centerBId,
      fixture.studentEId,
    ],
    [
      fixture.groupAlternateEntryId,
      fixture.groupDivisionId,
      fixture.centerBId,
      fixture.studentFId,
    ],
    [
      fixture.individualWinnerEntryId,
      fixture.individualDivisionId,
      fixture.centerAId,
      fixture.studentAId,
    ],
    [
      fixture.individualRunnerEntryId,
      fixture.individualDivisionId,
      fixture.centerBId,
      fixture.studentCId,
    ],
    [
      fixture.draftWinnerEntryId,
      fixture.draftDivisionId,
      fixture.centerAId,
      fixture.studentBId,
    ],
    [
      fixture.draftRunnerEntryId,
      fixture.draftDivisionId,
      fixture.centerBId,
      fixture.studentDId,
    ],
  ] as const;
  await db.insert(kalakritiEntryMember).values(
    members.map(([entryId, divisionId, centerId, studentId], index) => ({
      id: id(100 + index),
      editionId: fixture.editionId,
      entryId,
      divisionId,
      centerId,
      studentId,
      createdAt: now,
      createdBy: admin.id,
    }))
  );

  const attendance = [
    ...[
      fixture.studentAId,
      fixture.studentBId,
      fixture.studentCId,
      fixture.studentDId,
      fixture.studentEId,
      fixture.studentFId,
    ].map((studentId) => [studentId, fixture.groupSessionId] as const),
    [fixture.studentAId, fixture.individualSessionId] as const,
    [fixture.studentCId, fixture.individualSessionId] as const,
    [fixture.studentBId, fixture.draftSessionId] as const,
    [fixture.studentDId, fixture.draftSessionId] as const,
  ];
  await db.insert(kalakritiOperation).values(
    attendance.map(([studentId, competitionSessionId], index) => ({
      id: id(130 + index),
      editionId: fixture.editionId,
      studentId,
      competitionSessionId,
      type: "competition_attendance" as const,
      operationId: id(150 + index),
      createdAt: now,
      occurredAt: now,
      recordedBy: admin.id,
    }))
  );

  await db.insert(kalakritiEditionMembership).values(
    [
      [fixture.awardsLeadMembershipId, awardsLead, "Awards Lead"],
      [fixture.awardsMemberMembershipId, awardsMember, "Awards Member"],
      [fixture.editionAdminMembershipId, editionAdmin, "Edition Admin"],
      [fixture.unrelatedMembershipId, unrelated, "Unrelated Volunteer"],
    ].map(([membershipId, actor, snapshotName]) => ({
      ...scoped,
      id: membershipId as string,
      userId: (actor as typeof awardsLead).id,
      kind: "volunteer" as const,
      state: "active" as const,
      snapshotName: snapshotName as string,
      snapshotEmail: (actor as typeof awardsLead).email,
    }))
  );
  await db.insert(kalakritiAssignment).values([
    {
      ...scoped,
      id: fixture.awardsLeadAssignmentId,
      membershipId: fixture.awardsLeadMembershipId,
      responsibility: "awards_lead" as const,
      isPrimary: true,
    },
    {
      ...scoped,
      id: fixture.awardsMemberAssignmentId,
      membershipId: fixture.awardsMemberMembershipId,
      responsibility: "awards_member" as const,
      isPrimary: true,
    },
    {
      ...scoped,
      id: fixture.editionAdminAssignmentId,
      membershipId: fixture.editionAdminMembershipId,
      responsibility: "edition_admin" as const,
      isPrimary: true,
    },
  ]);

  const scorecards = [
    [fixture.groupScorecardId, fixture.groupDivisionId, "group.pdf"],
    [
      fixture.replacementScorecardId,
      fixture.groupDivisionId,
      "group-replacement.pdf",
    ],
    [
      fixture.individualScorecardId,
      fixture.individualDivisionId,
      "individual.pdf",
    ],
    [fixture.draftScorecardId, fixture.draftDivisionId, "draft.pdf"],
  ] as const;
  await db.insert(kalakritiResultScorecard).values(
    scorecards.map(([scorecardId, divisionId, fileName]) => ({
      id: scorecardId,
      editionId: fixture.editionId,
      divisionId,
      objectKey: `e2e/kalakriti-scorecards/${fixture.editionId}/${divisionId}/${scorecardId}-${fileName}`,
      fileName,
      mimeType: "application/pdf",
      byteSize: 32,
      uploadedAt: now,
      uploadedBy: admin.id,
    }))
  );
  await db.insert(kalakritiResult).values([
    {
      id: fixture.groupResultId,
      editionId: fixture.editionId,
      divisionId: fixture.groupDivisionId,
      version: 1,
      status: "draft" as const,
      winnerEntryId: fixture.groupWinnerEntryId,
      runnerUpEntryId: fixture.groupRunnerEntryId,
      scorecardIds: sql`jsonb_build_array(${fixture.groupScorecardId}::text)`,
      updatedAt: now,
      updatedBy: admin.id,
    },
    {
      id: fixture.individualResultId,
      editionId: fixture.editionId,
      divisionId: fixture.individualDivisionId,
      version: 1,
      status: "published" as const,
      winnerEntryId: fixture.individualWinnerEntryId,
      runnerUpEntryId: fixture.individualRunnerEntryId,
      scorecardIds: sql`jsonb_build_array(${fixture.individualScorecardId}::text)`,
      updatedAt: now,
      updatedBy: admin.id,
    },
    {
      id: fixture.draftResultId,
      editionId: fixture.editionId,
      divisionId: fixture.draftDivisionId,
      version: 1,
      status: "draft" as const,
      winnerEntryId: fixture.draftWinnerEntryId,
      runnerUpEntryId: fixture.draftRunnerEntryId,
      scorecardIds: sql`jsonb_build_array(${fixture.draftScorecardId}::text)`,
      updatedAt: now,
      updatedBy: admin.id,
    },
  ]);
  return fixture;
}

async function finalize() {
  const current = await db.query.kalakritiResultsState.findFirst({
    where: eq(kalakritiResultsState.editionId, fixture.editionId),
  });
  const finalized = {
    winnerPoints: 10,
    runnerUpPoints: 5,
    finalizedAt: new Date(),
    winnerCenterId: fixture.centerAId,
    runnerUpCenterId: fixture.centerBId,
    tieReason: null,
  };
  if (current) {
    await db
      .update(kalakritiResultsState)
      .set({ ...finalized, version: current.version + 1 })
      .where(eq(kalakritiResultsState.editionId, fixture.editionId));
  } else {
    await db.insert(kalakritiResultsState).values({
      ...finalized,
      id: id(180),
      editionId: fixture.editionId,
      version: 1,
    });
  }
  return { finalized: true };
}

async function revokeLead() {
  await db
    .delete(kalakritiAssignment)
    .where(eq(kalakritiAssignment.id, fixture.awardsLeadAssignmentId));
  return { revoked: true };
}

async function state() {
  const [handovers, commands, groupResult] = await Promise.all([
    db
      .select()
      .from(kalakritiAwardHandover)
      .where(eq(kalakritiAwardHandover.editionId, fixture.editionId)),
    db
      .select()
      .from(kalakritiAwardCommand)
      .where(eq(kalakritiAwardCommand.editionId, fixture.editionId)),
    db.query.kalakritiResult.findFirst({
      where: eq(kalakritiResult.id, fixture.groupResultId),
    }),
  ]);
  return { handovers, commandCount: commands.length, groupResult };
}

assertIsolatedTarget();
const [action, adminEmail] = process.argv.slice(2);
try {
  let output: unknown;
  if (action === "setup" && adminEmail) output = await setup(adminEmail);
  else if (action === "finalize") output = await finalize();
  else if (action === "revoke-lead") output = await revokeLead();
  else if (action === "state") output = await state();
  else if (action === "cleanup") {
    await cleanup();
    output = { cleaned: true };
  } else {
    throw new Error(
      "Usage: kalakriti-awards.ts setup <admin>|finalize|revoke-lead|state|cleanup"
    );
  }
  writeSync(1, `${JSON.stringify(output)}\n`);
} finally {
  await db.$client.end();
}
