import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiCenter,
  kalakritiCenterAgeQuota,
  kalakritiEdition,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

const EDITION_ID = "019f0000-0000-7000-8000-00000000e801";
const EVENT_ID = "019f0000-0000-7000-8000-00000000e802";
const CENTER_ID = "019f0000-0000-7000-8000-00000000e803";
const YEAR = 2196;

async function cleanup(): Promise<void> {
  await db
    .delete(kalakritiCenterAgeQuota)
    .where(eq(kalakritiCenterAgeQuota.editionId, EDITION_ID));
  await db.delete(kalakritiEdition).where(eq(kalakritiEdition.id, EDITION_ID));
  await db.delete(teamEvent).where(eq(teamEvent.id, EVENT_ID));
}

async function setup(superAdminEmail: string) {
  await cleanup();
  const [actor, owningTeam] = await Promise.all([
    db.query.user.findFirst({
      columns: { id: true },
      where: eq(user.email, superAdminEmail),
    }),
    db.query.team.findFirst({ columns: { id: true } }),
  ]);
  if (!(actor && owningTeam)) {
    throw new Error("Kalakriti eligibility fixture requires a user and team");
  }
  const now = new Date();
  await db.insert(teamEvent).values({
    city: "bangalore",
    createdAt: now,
    createdBy: actor.id,
    description: "Kalakriti eligibility E2E fixture",
    id: EVENT_ID,
    isPublic: false,
    managementDomain: "kalakriti",
    name: `Kalakriti ${YEAR}`,
    startTime: new Date("2196-11-21T04:30:00.000Z"),
    teamId: owningTeam.id,
    updatedAt: now,
  });
  await db.insert(kalakritiEdition).values({
    ageCutoffDate: "2196-06-01",
    brandingKey: "kalakriti-eligibility-e2e",
    createdAt: now,
    createdBy: actor.id,
    eventDate: "2196-11-21",
    id: EDITION_ID,
    lifecycle: "draft",
    name: `Kalakriti ${YEAR}`,
    plannedRegistrationCloseAt: new Date("2196-10-31T18:29:00.000Z"),
    teamEventId: EVENT_ID,
    updatedAt: now,
    year: YEAR,
  });
  await db.insert(kalakritiCenter).values({
    competitionEntryRegistrationEnabled: false,
    createdAt: now,
    createdBy: actor.id,
    editionId: EDITION_ID,
    id: CENTER_ID,
    name: "Jayanagar",
    normalizedName: "jayanagar",
    retiredAt: null,
    studentRegistrationEnabled: false,
    updatedAt: now,
  });
  return { year: YEAR };
}

const [action, argument] = process.argv.slice(2);
try {
  let result: { removed: boolean } | { year: number };
  if (action === "setup") {
    result = await setup(argument ?? "");
  } else if (action === "cleanup") {
    await cleanup();
    result = { removed: true };
  } else {
    throw new Error(`Unknown action: ${action}`);
  }
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
