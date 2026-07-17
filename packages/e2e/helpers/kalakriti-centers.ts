import {
  createKalakritiExternalUser,
  deleteKalakritiExternalUser,
} from "@pi-dash/auth/kalakriti-external-user";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiExternalIdentity,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

const EDITION_ID = "019f0000-0000-7000-8000-00000000c701";
const EVENT_ID = "019f0000-0000-7000-8000-00000000c702";
const GUARDIAN_MEMBERSHIP_ID = "019f0000-0000-7000-8000-00000000c703";
const GUARDIAN_EMAIL = "center-guardian@pi-dash.test";
const GUARDIAN_NAME = "Center Test Guardian";
const GUARDIAN_PASSWORD = "CenterGuardian!2197";
const YEAR = 2197;

async function cleanup(): Promise<void> {
  await db.delete(kalakritiEdition).where(eq(kalakritiEdition.id, EDITION_ID));
  await db.delete(teamEvent).where(eq(teamEvent.id, EVENT_ID));
  const external = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, GUARDIAN_EMAIL),
  });
  if (external) {
    await deleteKalakritiExternalUser(external.id);
  }
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
    throw new Error("Kalakriti Center fixture requires a user and team");
  }
  const now = new Date();
  await db.insert(teamEvent).values({
    city: "bangalore",
    createdAt: now,
    createdBy: actor.id,
    description: "Kalakriti Center E2E fixture",
    id: EVENT_ID,
    isPublic: false,
    managementDomain: "kalakriti",
    name: `Kalakriti ${YEAR}`,
    startTime: new Date("2197-11-21T04:30:00.000Z"),
    teamId: owningTeam.id,
    updatedAt: now,
  });
  await db.insert(kalakritiEdition).values({
    ageCutoffDate: "2197-06-01",
    brandingKey: "kalakriti-center-e2e",
    createdAt: now,
    createdBy: actor.id,
    eventDate: "2197-11-21",
    id: EDITION_ID,
    lifecycle: "draft",
    name: `Kalakriti ${YEAR}`,
    plannedRegistrationCloseAt: new Date("2197-10-31T18:29:00.000Z"),
    teamEventId: EVENT_ID,
    updatedAt: now,
    year: YEAR,
  });
  const external = await createKalakritiExternalUser({
    email: GUARDIAN_EMAIL,
    name: GUARDIAN_NAME,
    password: GUARDIAN_PASSWORD,
    phone: null,
  });
  await db.transaction(async (tx) => {
    await tx.insert(kalakritiExternalIdentity).values({
      createdAt: now,
      createdBy: actor.id,
      userId: external.id,
    });
    await tx.insert(kalakritiEditionMembership).values({
      createdAt: now,
      createdBy: actor.id,
      editionId: EDITION_ID,
      id: GUARDIAN_MEMBERSHIP_ID,
      kind: "guardian",
      snapshotEmail: GUARDIAN_EMAIL,
      snapshotName: GUARDIAN_NAME,
      snapshotPhone: null,
      state: "active",
      updatedAt: now,
      userId: external.id,
    });
  });
  return {
    guardianEmail: GUARDIAN_EMAIL,
    guardianName: GUARDIAN_NAME,
    guardianPassword: GUARDIAN_PASSWORD,
    year: YEAR,
  };
}

const [action, argument] = process.argv.slice(2);
try {
  let result:
    | { removed: boolean }
    | {
        guardianEmail: string;
        guardianName: string;
        guardianPassword: string;
        year: number;
      };
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
