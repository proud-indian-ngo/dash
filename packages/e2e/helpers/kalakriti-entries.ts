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
  kalakritiEntryMusic,
  kalakritiStudent,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { S3Client } from "bun";
import { eq } from "drizzle-orm";

import { backfillKalakritiEntryMusic } from "../../../scripts/backfill-kalakriti-entry-music";

const FIXTURES = {
  admin: {
    ageCategoryId: "019f0000-0000-7000-8000-00000000e103",
    assignmentId: "019f0000-0000-7000-8000-00000000e10d",
    categoryId: "019f0000-0000-7000-8000-00000000e107",
    centerId: "019f0000-0000-7000-8000-00000000e104",
    competitionId: "019f0000-0000-7000-8000-00000000e108",
    editionId: "019f0000-0000-7000-8000-00000000e101",
    eventId: "019f0000-0000-7000-8000-00000000e102",
    groupCompetitionId: "019f0000-0000-7000-8000-00000000e110",
    groupSessionId: "019f0000-0000-7000-8000-00000000e111",
    membershipId: "019f0000-0000-7000-8000-00000000e10e",
    sessionId: "019f0000-0000-7000-8000-00000000e10a",
    studentIds: [
      "019f0000-0000-7000-8000-00000000e106",
      "019f0000-0000-7000-8000-00000000e10f",
      "019f0000-0000-7000-8000-00000000e112",
      "019f0000-0000-7000-8000-00000000e113",
    ],
    unflaggedCompetitionId: "019f0000-0000-7000-8000-00000000e114",
    unflaggedSessionId: "019f0000-0000-7000-8000-00000000e115",
    venueId: "019f0000-0000-7000-8000-00000000e109",
    year: 2193,
  },
  liaison: {
    ageCategoryId: "019f0000-0000-7000-8000-00000000e203",
    assignmentId: "019f0000-0000-7000-8000-00000000e20d",
    categoryId: "019f0000-0000-7000-8000-00000000e207",
    centerId: "019f0000-0000-7000-8000-00000000e204",
    competitionId: "019f0000-0000-7000-8000-00000000e208",
    editionId: "019f0000-0000-7000-8000-00000000e201",
    eventId: "019f0000-0000-7000-8000-00000000e202",
    groupCompetitionId: "019f0000-0000-7000-8000-00000000e210",
    groupSessionId: "019f0000-0000-7000-8000-00000000e211",
    membershipId: "019f0000-0000-7000-8000-00000000e20e",
    sessionId: "019f0000-0000-7000-8000-00000000e20a",
    studentIds: [
      "019f0000-0000-7000-8000-00000000e206",
      "019f0000-0000-7000-8000-00000000e20f",
      "019f0000-0000-7000-8000-00000000e212",
      "019f0000-0000-7000-8000-00000000e213",
    ],
    unflaggedCompetitionId: "019f0000-0000-7000-8000-00000000e214",
    unflaggedSessionId: "019f0000-0000-7000-8000-00000000e215",
    venueId: "019f0000-0000-7000-8000-00000000e209",
    year: 2192,
  },
  music: {
    ageCategoryId: "019f0000-0000-7000-8000-00000000e303",
    assignmentId: "019f0000-0000-7000-8000-00000000e30d",
    categoryId: "019f0000-0000-7000-8000-00000000e307",
    centerId: "019f0000-0000-7000-8000-00000000e304",
    competitionId: "019f0000-0000-7000-8000-00000000e308",
    editionId: "019f0000-0000-7000-8000-00000000e301",
    eventId: "019f0000-0000-7000-8000-00000000e302",
    groupCompetitionId: "019f0000-0000-7000-8000-00000000e310",
    groupSessionId: "019f0000-0000-7000-8000-00000000e311",
    membershipId: "019f0000-0000-7000-8000-00000000e30e",
    sessionId: "019f0000-0000-7000-8000-00000000e30a",
    studentIds: [
      "019f0000-0000-7000-8000-00000000e306",
      "019f0000-0000-7000-8000-00000000e30f",
      "019f0000-0000-7000-8000-00000000e312",
      "019f0000-0000-7000-8000-00000000e313",
    ],
    unflaggedCompetitionId: "019f0000-0000-7000-8000-00000000e314",
    unflaggedSessionId: "019f0000-0000-7000-8000-00000000e315",
    venueId: "019f0000-0000-7000-8000-00000000e309",
    year: 2157,
  },
} as const;

type FixtureKind = keyof typeof FIXTURES;

async function cleanup(kind: FixtureKind): Promise<void> {
  const fixture = FIXTURES[kind];
  await db
    .delete(kalakritiEntryMusic)
    .where(eq(kalakritiEntryMusic.editionId, fixture.editionId));
  await db
    .delete(kalakritiEntryMember)
    .where(eq(kalakritiEntryMember.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetitionEntry)
    .where(eq(kalakritiCompetitionEntry.editionId, fixture.editionId));
  await db
    .delete(kalakritiStudent)
    .where(eq(kalakritiStudent.editionId, fixture.editionId));
  await db
    .delete(kalakritiAssignment)
    .where(eq(kalakritiAssignment.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetitionSession)
    .where(eq(kalakritiCompetitionSession.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetitionDivision)
    .where(eq(kalakritiCompetitionDivision.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetition)
    .where(eq(kalakritiCompetition.editionId, fixture.editionId));
  await db
    .delete(kalakritiCompetitionCategory)
    .where(eq(kalakritiCompetitionCategory.editionId, fixture.editionId));
  await db
    .delete(kalakritiVenue)
    .where(eq(kalakritiVenue.editionId, fixture.editionId));
  await db
    .delete(kalakritiAgeCategory)
    .where(eq(kalakritiAgeCategory.editionId, fixture.editionId));
  await db
    .delete(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.editionId, fixture.editionId));
  await db
    .delete(kalakritiAuditEntry)
    .where(eq(kalakritiAuditEntry.editionId, fixture.editionId));
  await db
    .delete(kalakritiCenter)
    .where(eq(kalakritiCenter.editionId, fixture.editionId));
  await db
    .delete(kalakritiEdition)
    .where(eq(kalakritiEdition.id, fixture.editionId));
  await db.delete(teamEvent).where(eq(teamEvent.id, fixture.eventId));
}

async function setup(kind: FixtureKind, actorEmail: string) {
  const fixture = FIXTURES[kind];
  await cleanup(kind);
  const [actor, owningTeam] = await Promise.all([
    db.query.user.findFirst({
      columns: { email: true, id: true, name: true },
      where: eq(user.email, actorEmail),
    }),
    db.query.team.findFirst({ columns: { id: true } }),
  ]);
  if (!(actor && owningTeam)) {
    throw new Error("Kalakriti Entry fixture requires a user and team");
  }
  const now = new Date();
  await db.insert(teamEvent).values({
    city: "bangalore",
    createdAt: now,
    createdBy: actor.id,
    description: "Kalakriti Competition Entry E2E fixture",
    id: fixture.eventId,
    isPublic: false,
    managementDomain: "kalakriti",
    name: `Kalakriti ${fixture.year}`,
    startTime: new Date(`${fixture.year}-11-21T04:30:00.000Z`),
    teamId: owningTeam.id,
    updatedAt: now,
  });
  await db.insert(kalakritiEdition).values({
    ageCutoffDate: `${fixture.year}-06-30`,
    brandingKey: `kalakriti-entries-${kind}-e2e`,
    createdAt: now,
    createdBy: actor.id,
    eventDate: `${fixture.year}-11-21`,
    id: fixture.editionId,
    lifecycle: "registration_open",
    name: `Kalakriti ${fixture.year}`,
    plannedRegistrationCloseAt: new Date(`${fixture.year}-10-31T18:29:00.000Z`),
    teamEventId: fixture.eventId,
    updatedAt: now,
    year: fixture.year,
  });
  await db.insert(kalakritiCenter).values({
    competitionEntryRegistrationEnabled: true,
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    id: fixture.centerId,
    name: "Jayanagar",
    normalizedName: "jayanagar",
    studentRegistrationEnabled: true,
    updatedAt: now,
  });
  await db.insert(kalakritiAgeCategory).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    femaleStudentLimit: 5,
    id: fixture.ageCategoryId,
    maleStudentLimit: 5,
    maxCompetitionsPerCategory: 2,
    maximumAge: 10,
    maxTotalCompetitions: 4,
    minimumAge: 6,
    name: "Junior",
    normalizedName: "junior",
    sortOrder: 0,
    updatedAt: now,
  });
  await db.insert(kalakritiStudent).values(
    fixture.studentIds.map((id, index) => ({
      ageCategoryId: fixture.ageCategoryId,
      centerId: fixture.centerId,
      createdAt: now,
      createdBy: actor.id,
      dateOfBirth: `${fixture.year - 8}-06-${String(index + 10).padStart(2, "0")}`,
      derivedAgeCategoryId: fixture.ageCategoryId,
      editionId: fixture.editionId,
      gender:
        kind === "liaison" && index === fixture.studentIds.length - 1
          ? ("male" as const)
          : ("female" as const),
      humanId: `KAL-${fixture.year}-000${index + 1}`,
      id,
      name: `Entry Student ${String.fromCharCode(65 + index)}`,
      normalizedName: `entry student ${String.fromCharCode(97 + index)}`,
      updatedAt: now,
      updatedBy: actor.id,
    }))
  );
  await db.insert(kalakritiCompetitionCategory).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    id: fixture.categoryId,
    name: "Performing Arts",
    normalizedName: "performing arts",
    sortOrder: 0,
    updatedAt: now,
  });
  await db.insert(kalakritiCompetition).values({
    competitionCategoryId: fixture.categoryId,
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    genderEligibility: "both",
    id: fixture.competitionId,
    maximumGroupSize: 1,
    minimumGroupSize: 1,
    musicUploadEnabled: kind !== "admin",
    name: "Solo Dance",
    normalizedName: "solo dance",
    participationMode: "individual",
    updatedAt: now,
  });
  await db.insert(kalakritiCompetition).values({
    competitionCategoryId: fixture.categoryId,
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    genderEligibility: kind === "liaison" ? "female" : "both",
    id: fixture.groupCompetitionId,
    maximumGroupSize: 3,
    minimumGroupSize: 2,
    musicUploadEnabled: true,
    name: "Group Dance",
    normalizedName: "group dance",
    participationMode: "group",
    updatedAt: now,
  });
  await db.insert(kalakritiCompetition).values({
    competitionCategoryId: fixture.categoryId,
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    genderEligibility: "both",
    id: fixture.unflaggedCompetitionId,
    maximumGroupSize: 1,
    minimumGroupSize: 1,
    name: "Spoken Word",
    normalizedName: "spoken word",
    participationMode: "individual",
    updatedAt: now,
  });
  await db.insert(kalakritiVenue).values({
    createdAt: now,
    createdBy: actor.id,
    editionId: fixture.editionId,
    id: fixture.venueId,
    name: "Main Stage",
    normalizedName: "main stage",
    updatedAt: now,
  });
  await db.insert(kalakritiCompetitionDivision).values([
    {
      ageCategoryId: fixture.ageCategoryId,
      competitionId: fixture.competitionId,
      createdAt: now,
      createdBy: actor.id,
      editionId: fixture.editionId,
      id: fixture.sessionId,
      updatedAt: now,
    },
    {
      ageCategoryId: fixture.ageCategoryId,
      competitionId: fixture.groupCompetitionId,
      createdAt: now,
      createdBy: actor.id,
      editionId: fixture.editionId,
      id: fixture.groupSessionId,
      updatedAt: now,
    },
    {
      ageCategoryId: fixture.ageCategoryId,
      competitionId: fixture.unflaggedCompetitionId,
      createdAt: now,
      createdBy: actor.id,
      editionId: fixture.editionId,
      id: fixture.unflaggedSessionId,
      updatedAt: now,
    },
  ]);
  await db.insert(kalakritiCompetitionSession).values({
    createdAt: now,
    createdBy: actor.id,
    divisionId: fixture.sessionId,
    editionId: fixture.editionId,
    endAt: new Date(`${fixture.year}-11-21T04:30:00.000Z`),
    id: fixture.sessionId,
    startAt: new Date(`${fixture.year}-11-21T03:30:00.000Z`),
    updatedAt: now,
    venueId: fixture.venueId,
  });
  await db.insert(kalakritiCompetitionSession).values({
    createdAt: now,
    createdBy: actor.id,
    divisionId: fixture.groupSessionId,
    editionId: fixture.editionId,
    endAt: new Date(`${fixture.year}-11-21T06:30:00.000Z`),
    id: fixture.groupSessionId,
    startAt: new Date(`${fixture.year}-11-21T05:30:00.000Z`),
    updatedAt: now,
    venueId: fixture.venueId,
  });
  await db.insert(kalakritiCompetitionSession).values({
    createdAt: now,
    createdBy: actor.id,
    divisionId: fixture.unflaggedSessionId,
    editionId: fixture.editionId,
    endAt: new Date(`${fixture.year}-11-21T08:30:00.000Z`),
    id: fixture.unflaggedSessionId,
    startAt: new Date(`${fixture.year}-11-21T07:30:00.000Z`),
    updatedAt: now,
    venueId: fixture.venueId,
  });
  if (kind !== "admin") {
    await db.insert(kalakritiEditionMembership).values({
      createdAt: now,
      createdBy: actor.id,
      editionId: fixture.editionId,
      id: fixture.membershipId,
      kind: "volunteer",
      snapshotEmail: actor.email,
      snapshotName: actor.name,
      updatedAt: now,
      userId: actor.id,
    });
    await db.insert(kalakritiAssignment).values({
      centerId: fixture.centerId,
      createdAt: now,
      createdBy: actor.id,
      editionId: fixture.editionId,
      id: fixture.assignmentId,
      isPrimary: true,
      membershipId: fixture.membershipId,
      responsibility: "liaison",
    });
  }
  if (kind === "music") {
    await db.insert(kalakritiCompetitionEntry).values({
      id: fixture.membershipId,
      editionId: fixture.editionId,
      centerId: fixture.centerId,
      divisionId: fixture.groupSessionId,
      participationMode: "group",
      createdAt: now,
      createdBy: actor.id,
      updatedAt: now,
      updatedBy: actor.id,
    });
    await db.insert(kalakritiEntryMember).values(
      fixture.studentIds.slice(0, 2).map((studentId) => ({
        id: studentId,
        entryId: fixture.membershipId,
        studentId,
        centerId: fixture.centerId,
        divisionId: fixture.groupSessionId,
        editionId: fixture.editionId,
        createdAt: now,
        createdBy: actor.id,
      }))
    );
  }
  return {
    year: fixture.year,
    centerName: "Jayanagar",
    editionId: fixture.editionId,
    entryId: fixture.membershipId,
    centerId: fixture.centerId,
    divisionId: fixture.groupSessionId,
    individualDivisionId: fixture.sessionId,
    studentIds: fixture.studentIds,
  };
}

async function readState(kind: FixtureKind) {
  const fixture = FIXTURES[kind];
  const [entries, audits, members, musicFiles] = await Promise.all([
    db
      .select({
        id: kalakritiCompetitionEntry.id,
      })
      .from(kalakritiCompetitionEntry)
      .where(eq(kalakritiCompetitionEntry.editionId, fixture.editionId)),
    db
      .select({ action: kalakritiAuditEntry.action })
      .from(kalakritiAuditEntry)
      .where(eq(kalakritiAuditEntry.editionId, fixture.editionId)),
    db
      .select({
        entryId: kalakritiEntryMember.entryId,
        studentId: kalakritiEntryMember.studentId,
      })
      .from(kalakritiEntryMember)
      .where(eq(kalakritiEntryMember.editionId, fixture.editionId)),
    db
      .select()
      .from(kalakritiEntryMusic)
      .where(eq(kalakritiEntryMusic.editionId, fixture.editionId)),
  ]);
  return { audits, entries, members, musicFiles };
}

const [action, kindArgument, email] = process.argv.slice(2);
const fixtureKind = kindArgument as FixtureKind;
if (!(fixtureKind in FIXTURES)) {
  throw new Error(`Unsupported Entry fixture kind: ${kindArgument ?? ""}`);
}

let result: unknown;
if (action === "setup" && email) {
  result = await setup(fixtureKind, email);
} else if (
  (action === "music-cleanup-r2" || action === "music-r2-state") &&
  fixtureKind !== "admin" &&
  email
) {
  const database = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(database.hostname))
    throw new Error("Music cleanup requires local E2E database");
  const fixture = FIXTURES[fixtureKind];
  const membership = await db.query.kalakritiEditionMembership.findFirst({
    where: eq(kalakritiEditionMembership.id, fixture.membershipId),
    columns: { userId: true },
  });
  if (!membership?.userId) throw new Error("Missing music test actor");
  const keys: unknown = JSON.parse(email);
  const prefix = process.env.R2_KEY_PREFIX ?? "attachments";
  if (
    !Array.isArray(keys) ||
    keys.length > 30 ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        !(
          key.startsWith(`${prefix}/kalakriti-music/${fixture.editionId}/`) ||
          (key.startsWith(
            `${prefix}/kalakriti-music/tmp/${membership.userId}/`
          ) &&
            /-(music-[a-z-]+|track|remix)\.mp3$/.test(key))
        )
    )
  )
    throw new Error("Refusing non-fixture music object cleanup");
  const client = new S3Client({
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucket: process.env.R2_BUCKET_NAME!,
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  });
  if (action === "music-r2-state") {
    result = await Promise.all(
      (keys as string[]).map(async (key) => ({
        key,
        exists: await client.exists(key),
      }))
    );
  } else {
    for (const key of keys as string[]) {
      await client.delete(key);
      if (await client.exists(key))
        throw new Error("Test music cleanup did not finish");
    }
    result = { removed: keys.length };
  }
} else if (action === "music-backfill" && fixtureKind === "music") {
  const database = new URL(process.env.DATABASE_URL!);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
    database.pathname !== "/pi-dash-test"
  )
    throw new Error("Backfill probe requires the isolated local E2E database");
  const fixture = FIXTURES.music;
  const entryId = fixture.membershipId;
  const [entry] = await db
    .select()
    .from(kalakritiCompetitionEntry)
    .where(eq(kalakritiCompetitionEntry.id, entryId));
  if (!entry) throw new Error("Missing backfill fixture Entry");
  const legacy = {
    musicObjectKey: `attachments/kalakriti-music/${fixture.editionId}/${entryId}/legacy.mp3`,
    musicFileName: "legacy.mp3",
    musicMimeType: "audio/mpeg",
    musicByteSize: 1234,
    musicUploadedAt: new Date("2026-01-02T03:04:05.000Z"),
    musicUploadedBy: entry.createdBy,
  };
  await db
    .update(kalakritiCompetitionEntry)
    .set({ ...legacy, musicMimeType: "image/png" })
    .where(eq(kalakritiCompetitionEntry.id, entryId));
  const malformed = await backfillKalakritiEntryMusic(db, { apply: true });
  const malformedState = await readState(fixtureKind);
  await db
    .update(kalakritiCompetitionEntry)
    .set(legacy)
    .where(eq(kalakritiCompetitionEntry.id, entryId));
  const dryRun = await backfillKalakritiEntryMusic(db, { apply: false });
  const dryRunState = await readState(fixtureKind);
  const applied = await backfillKalakritiEntryMusic(db, { apply: true });
  const appliedState = await readState(fixtureKind);
  const repeated = await backfillKalakritiEntryMusic(db, { apply: true });
  const repeatedState = await readState(fixtureKind);
  const [cleared] = await db
    .select()
    .from(kalakritiCompetitionEntry)
    .where(eq(kalakritiCompetitionEntry.id, entryId));
  result = {
    legacy,
    malformed,
    malformedState,
    dryRun,
    dryRunState,
    applied,
    appliedState,
    repeated,
    repeatedState,
    cleared,
  };
} else if (action === "music-refresh" && fixtureKind === "music") {
  await db
    .update(kalakritiStudent)
    .set({
      name: "Entry Student A (refreshed)",
      normalizedName: "entry student a (refreshed)",
      updatedAt: new Date(),
    })
    .where(eq(kalakritiStudent.id, FIXTURES.music.studentIds[0]));
  result = { refreshed: true };
} else if (action === "playback-refresh" && fixtureKind === "music") {
  await db
    .update(kalakritiStudent)
    .set({
      name: "Entry Student A (playback refresh)",
      normalizedName: "entry student a (playback refresh)",
      updatedAt: new Date(),
    })
    .where(eq(kalakritiStudent.id, FIXTURES.music.studentIds[0]));
  result = { refreshed: true };
} else if (action === "music-mode" && fixtureKind === "music") {
  const fixture = FIXTURES.music;
  await db
    .update(kalakritiEdition)
    .set({
      lifecycle:
        email === "archived"
          ? "archived"
          : email === "center-closed"
            ? "registration_open"
            : "registration_locked",
    })
    .where(eq(kalakritiEdition.id, fixture.editionId));
  await db
    .update(kalakritiCenter)
    .set({
      competitionEntryRegistrationEnabled: false,
      studentRegistrationEnabled: false,
    })
    .where(eq(kalakritiCenter.id, fixture.centerId));
  await db
    .update(kalakritiCompetition)
    .set({ musicUploadEnabled: email !== "disabled" })
    .where(eq(kalakritiCompetition.id, fixture.groupCompetitionId));
  if (email === "writer") {
    await db
      .update(kalakritiAssignment)
      .set({
        responsibility: "liaison",
        centerId: fixture.centerId,
        competitionId: null,
      })
      .where(eq(kalakritiAssignment.id, fixture.assignmentId));
  }
  if (email === "reader") {
    await db
      .update(kalakritiAssignment)
      .set({
        responsibility: "competition_coordinator",
        centerId: null,
        competitionId: fixture.groupCompetitionId,
      })
      .where(eq(kalakritiAssignment.id, fixture.assignmentId));
  }
  if (email === "unauthorized")
    await db
      .update(kalakritiAssignment)
      .set({ responsibility: "volunteer_coordinator", centerId: null })
      .where(eq(kalakritiAssignment.id, fixture.assignmentId));
  result = { configured: email };
} else if (action === "state") {
  result = await readState(fixtureKind);
} else if (action === "cleanup") {
  await cleanup(fixtureKind);
  result = { cleaned: true };
} else {
  throw new Error(`Unsupported Entry helper action: ${action ?? ""}`);
}

// Exit inside the write callback: process.exit can truncate buffered pipe
// output, returning empty stdout to the execFile caller (flaky fixtures).
process.stdout.write(`${JSON.stringify(result)}\n`);
// End the client so the process exits naturally AFTER stdout flushes
// (process.exit inside the write callback can truncate pipe output).
await db.$client.end();
process.exit(0);
