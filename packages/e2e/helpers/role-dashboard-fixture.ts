import { writeSync } from "node:fs";

import {
  createKalakritiExternalUser,
  deleteKalakritiExternalUser,
} from "@pi-dash/auth/kalakriti-external-user";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAssignment,
  kalakritiAgeCategory,
  kalakritiCenter,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiExternalIdentity,
  kalakritiGuardianCenter,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

import { KALAKRITI_ACTORS } from "../fixtures/kalakriti-actors";

const id = (suffix: number) =>
  `019f0000-0196-7000-8000-${suffix.toString(16).padStart(12, "0")}`;
const fixture = {
  year: 2196,
  editionId: id(1),
  eventId: id(2),
  centerId: id(3),
  guardianEmail: "role-dashboard-guardian@pi-dash.test",
  guardianPassword: "RoleDashboardGuardian!2196",
} as const;

function assertIsolatedDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.hostname !== "localhost" ||
    url.port !== (process.env.E2E_DB_PORT ?? "5433") ||
    url.pathname !== "/pi-dash-test"
  ) {
    throw new Error(
      "Role dashboard fixture requires the isolated E2E database"
    );
  }
}

async function cleanup() {
  for (const table of [
    kalakritiGuardianCenter,
    kalakritiAssignment,
    kalakritiStudent,
    kalakritiAgeCategory,
    kalakritiEditionMembership,
    kalakritiCenter,
  ]) {
    await db.delete(table).where(eq(table.editionId, fixture.editionId));
  }
  await db
    .delete(kalakritiEdition)
    .where(eq(kalakritiEdition.id, fixture.editionId));
  await db.delete(teamEvent).where(eq(teamEvent.id, fixture.eventId));
  const guardian = await db.query.user.findFirst({
    where: eq(user.email, fixture.guardianEmail),
  });
  if (guardian) await deleteKalakritiExternalUser(guardian.id);
}

async function setup(adminEmail: string) {
  await cleanup();
  const accounts = await Promise.all(
    [
      adminEmail,
      KALAKRITI_ACTORS.categoryLead.email,
      KALAKRITI_ACTORS.unrelatedVolunteer.email,
    ].map((email) => db.query.user.findFirst({ where: eq(user.email, email) }))
  );
  const [admin, operator, future] = accounts;
  const team = await db.query.team.findFirst();
  if (!admin || !operator || !future || !team) {
    throw new Error("Role dashboard fixture requires seeded users and a team");
  }
  const guardian = await createKalakritiExternalUser({
    email: fixture.guardianEmail,
    password: fixture.guardianPassword,
    name: "Dashboard Guardian",
    phone: null,
  });
  const now = new Date();
  const common = { createdAt: now, updatedAt: now, createdBy: admin.id };
  await db
    .insert(kalakritiExternalIdentity)
    .values({ userId: guardian.id, createdAt: now, createdBy: admin.id });
  await db.insert(teamEvent).values({
    ...common,
    id: fixture.eventId,
    teamId: team.id,
    name: "Role dashboard 2196",
    managementDomain: "kalakriti",
    isPublic: false,
    startTime: now,
  });
  await db.insert(kalakritiEdition).values({
    ...common,
    id: fixture.editionId,
    teamEventId: fixture.eventId,
    year: fixture.year,
    name: "Role dashboard 2196",
    lifecycle: "live",
    ageCutoffDate: "2196-06-30",
    eventDate: "2196-11-21",
    plannedRegistrationCloseAt: now,
    brandingKey: "role-dashboard-e2e",
  });
  const scoped = { ...common, editionId: fixture.editionId };
  await db.insert(kalakritiCenter).values({
    ...scoped,
    id: fixture.centerId,
    name: "Dashboard Center",
    normalizedName: "dashboard center",
  });
  await db.insert(kalakritiAgeCategory).values({
    ...scoped,
    id: id(4),
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
  await db.insert(kalakritiEditionMembership).values([
    {
      ...scoped,
      id: id(10),
      userId: guardian.id,
      kind: "guardian",
      state: "active",
      snapshotName: "Dashboard Guardian",
    },
    {
      ...scoped,
      id: id(11),
      userId: operator.id,
      kind: "volunteer",
      state: "active",
      snapshotName: operator.name,
    },
    {
      ...scoped,
      id: id(12),
      userId: future.id,
      kind: "volunteer",
      state: "active",
      snapshotName: future.name,
    },
  ]);
  await db.insert(kalakritiGuardianCenter).values({
    ...scoped,
    id: id(20),
    membershipId: id(10),
    centerId: fixture.centerId,
  });
  await db.insert(kalakritiAssignment).values([
    {
      ...scoped,
      id: id(21),
      membershipId: id(11),
      responsibility: "food_lead",
      isPrimary: true,
    },
    {
      ...scoped,
      id: id(22),
      membershipId: id(11),
      responsibility: "transport_lead",
    },
    {
      ...scoped,
      id: id(23),
      membershipId: id(12),
      responsibility: "awards_member",
      isPrimary: true,
    },
  ]);
  await db.insert(kalakritiStudent).values({
    ...scoped,
    id: id(30),
    centerId: fixture.centerId,
    updatedBy: admin.id,
    humanId: "KAL-2196-0001",
    name: "Dashboard Student",
    normalizedName: "dashboard student",
    gender: "female",
    dateOfBirth: "2188-06-15",
    ageCategoryId: id(4),
    derivedAgeCategoryId: id(4),
  });
  return fixture;
}

const [action, value] = process.argv.slice(2);
try {
  assertIsolatedDatabase();
  const result =
    action === "setup" && value
      ? await setup(value)
      : action === "cleanup"
        ? await cleanup().then(() => ({ cleaned: true }))
        : null;
  if (!result) throw new Error("Unknown role dashboard fixture action");
  writeSync(1, JSON.stringify(result));
  process.exit(0);
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
