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
  kalakritiCompetitionSession,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiStudent,
  kalakritiTransportAssignment,
  kalakritiVenue,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq, inArray } from "drizzle-orm";

import { KALAKRITI_ACTORS } from "../fixtures/kalakriti-actors";

const id = (n: number) =>
  `019f0000-0113-7000-8000-${n.toString(16).padStart(12, "0")}`;
const editionFixture = (base: number, year: number) => ({
  year,
  editionId: id(base),
  eventId: id(base + 1),
  ageCategoryId: id(base + 2),
  categoryId: id(base + 3),
  venueId: id(base + 4),
  centerId: id(base + 5),
  centerB: id(base + 6),
  competitionId: id(base + 9),
  divisionId: id(base + 11),
  sessionId: id(base + 13),
});
const fixtures = {
  first: editionFixture(1000, 2190),
  second: editionFixture(2000, 2191),
};
export type GoliveFixtures = typeof fixtures;
const editions = Object.values(fixtures).map((f) => f.editionId);

function assertIsolatedTarget() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    url.hostname !== "localhost" ||
    url.port !== "5433" ||
    url.pathname !== "/pi-dash-test"
  ) {
    throw new Error("Go-live fixture requires localhost:5433/pi-dash-test");
  }
}

async function cleanup() {
  for (const table of [
    kalakritiTransportAssignment,
    kalakritiAssignment,
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
  ])
    await db.delete(table).where(inArray(table.editionId, editions));
  await db
    .delete(kalakritiEdition)
    .where(inArray(kalakritiEdition.id, editions));
  await db.delete(teamEvent).where(
    inArray(
      teamEvent.id,
      Object.values(fixtures).map((f) => f.eventId)
    )
  );
}

async function setup(adminEmail: string) {
  await cleanup();
  const admin = await db.query.user.findFirst({
    where: eq(user.email, adminEmail),
  });
  const team = await db.query.team.findFirst();
  if (!admin || !team)
    throw new Error("Go-live fixture needs seeded admin and team");
  const now = new Date();
  const common = { createdAt: now, updatedAt: now, createdBy: admin.id };
  for (const [index, f] of Object.values(fixtures).entries()) {
    const base = (index + 1) * 1000;
    const eventStart = new Date(`${f.year}-11-21T04:30:00.000Z`);
    await db.insert(teamEvent).values({
      ...common,
      id: f.eventId,
      teamId: team.id,
      name: `Go-live ${f.year}`,
      managementDomain: "kalakriti",
      isPublic: false,
      startTime: eventStart,
    });
    await db.insert(kalakritiEdition).values({
      ...common,
      id: f.editionId,
      teamEventId: f.eventId,
      year: f.year,
      name: `Go-live ${f.year}`,
      lifecycle: "registration_locked",
      ageCutoffDate: `${f.year}-06-30`,
      eventDate: `${f.year}-11-21`,
      plannedRegistrationCloseAt: now,
      brandingKey: "golive-e2e",
      nextStudentSequence: 3,
      nextVolunteerSequence: 5,
    });
    const scoped = { ...common, editionId: f.editionId };
    await db.insert(kalakritiAgeCategory).values({
      ...scoped,
      id: f.ageCategoryId,
      name: "Junior",
      normalizedName: "junior",
      minimumAge: 6,
      maximumAge: 10,
      sortOrder: 0,
      femaleStudentLimit: 10,
      maleStudentLimit: 10,
      maxCompetitionsPerCategory: 2,
      maxTotalCompetitions: 4,
    });
    await db.insert(kalakritiCompetitionCategory).values({
      ...scoped,
      id: f.categoryId,
      name: "Performing Arts",
      normalizedName: "performing arts",
      sortOrder: 0,
    });
    await db.insert(kalakritiVenue).values({
      ...scoped,
      id: f.venueId,
      name: "Go-live Hall",
      normalizedName: "go-live hall",
    });
    await db.insert(kalakritiCompetition).values({
      ...scoped,
      id: f.competitionId,
      competitionCategoryId: f.categoryId,
      name: "Go-live Competition",
      normalizedName: "go-live competition",
      participationMode: "individual",
      genderEligibility: "both",
      minimumGroupSize: 1,
      maximumGroupSize: 1,
      musicUploadEnabled: false,
    });
    await db.insert(kalakritiCompetitionDivision).values({
      ...scoped,
      id: f.divisionId,
      competitionId: f.competitionId,
      ageCategoryId: f.ageCategoryId,
    });
    await db.insert(kalakritiCompetitionSession).values({
      ...scoped,
      id: f.sessionId,
      divisionId: f.divisionId,
      venueId: f.venueId,
      startAt: eventStart,
      endAt: new Date(eventStart.getTime() + 3_600_000),
    });
    for (const [offset, centerId] of [f.centerId, f.centerB].entries()) {
      const suffix = offset === 0 ? "A" : "B";
      await db.insert(kalakritiCenter).values({
        ...scoped,
        id: centerId,
        name: `Go-live Center ${suffix}`,
        normalizedName: `go-live center ${suffix.toLowerCase()}`,
        studentRegistrationEnabled: false,
        competitionEntryRegistrationEnabled: false,
      });
      await db.insert(kalakritiTransportAssignment).values({
        ...scoped,
        id: id(base + 20 + offset),
        centerId,
        vehicleLabel: `Go-live Bus ${suffix}`,
        driverName: "Fixture Driver",
        capacity: 20,
        status: "planned",
      });
      await db.insert(kalakritiStudent).values({
        ...scoped,
        id: id(base + 7 + offset),
        updatedBy: admin.id,
        centerId,
        humanId: `KAL-${f.year}-${String(offset + 1).padStart(4, "0")}`,
        name: `Go-live Student ${suffix}`,
        normalizedName: `go-live student ${suffix.toLowerCase()}`,
        gender: "female",
        dateOfBirth: `${f.year - 9}-06-15`,
        ageCategoryId: f.ageCategoryId,
        derivedAgeCategoryId: f.ageCategoryId,
      });
    }
    const actors = [
      { name: "overallEventsLead", responsibility: "overall_events_lead" },
      { name: "liaison", responsibility: "transport_lead" },
      { name: "categoryLead", responsibility: "food_lead" },
      { name: "unrelatedVolunteer", responsibility: "food_member" },
    ] as const;
    for (const [actorIndex, actor] of actors.entries()) {
      const account = await db.query.user.findFirst({
        where: eq(user.email, KALAKRITI_ACTORS[actor.name].email),
      });
      if (!account) throw new Error(`Missing fixture actor ${actor.name}`);
      const membershipId = id(base + 100 + actorIndex);
      await db.insert(kalakritiEditionMembership).values({
        ...scoped,
        id: membershipId,
        userId: account.id,
        kind: "volunteer",
        state: "active",
        humanId: `KALV-${f.year}-${String(actorIndex + 1).padStart(4, "0")}`,
        snapshotName: account.name,
      });
      await db.insert(kalakritiAssignment).values({
        ...scoped,
        id: id(base + 200 + actorIndex),
        membershipId,
        responsibility: actor.responsibility,
      });
    }
  }
  return fixtures;
}

const [action, value] = process.argv.slice(2);
try {
  assertIsolatedTarget();
  let result: unknown;
  if (action === "setup" && value) result = await setup(value);
  else if (action === "cleanup") {
    await cleanup();
    result = { cleaned: true };
  } else if (action === "block-center" || action === "ready-centers") {
    await db
      .update(kalakritiCenter)
      .set({ studentRegistrationEnabled: action === "block-center" })
      .where(eq(kalakritiCenter.id, fixtures.first.centerId));
    result = { updated: true };
  } else if (action === "state") {
    result = {
      editions: await db
        .select({
          id: kalakritiEdition.id,
          lifecycle: kalakritiEdition.lifecycle,
        })
        .from(kalakritiEdition)
        .where(inArray(kalakritiEdition.id, editions)),
    };
  } else throw new Error("Unknown go-live fixture action");
  writeSync(1, JSON.stringify(result));
  process.exit(0);
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
