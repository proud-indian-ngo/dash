import { createKalakritiExternalUser } from "@pi-dash/auth/kalakriti-external-user";
import { db } from "@pi-dash/db";
import { session, user } from "@pi-dash/db/schema/auth";
import {
  kalakritiCenter,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiExternalIdentity,
  kalakritiGuardianCenter,
} from "@pi-dash/db/schema/kalakriti";
import { team } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq, inArray } from "drizzle-orm";

const GUARDIAN_EMAIL = "guardian-race@pi-dash.test";
const GUARDIAN_NAME = "Guardian Race Test";
const GUARDIAN_PASSWORD = "GuardianRace123!";
const ORPHAN_EMAIL = "orphaned-central-guardian@pi-dash.test";
const ORPHAN_MEMBERSHIP_ID = "019f0000-0000-7000-8000-00000000e531";
const ORPHAN_NAME = "Orphaned Central Guardian";
const ORPHAN_USER_ID = "kalakriti-orphaned-central-guardian";
const TEAM_ID = "019f0000-0000-7000-8000-00000000e501";
const EVENT_IDS = [
  "019f0000-0000-7000-8000-00000000e511",
  "019f0000-0000-7000-8000-00000000e512",
] as const;
const EDITION_IDS = [
  "019f0000-0000-7000-8000-00000000e521",
  "019f0000-0000-7000-8000-00000000e522",
] as const;
const CENTER_IDS = [
  "019f0000-0000-7000-8000-00000000e541",
  "019f0000-0000-7000-8000-00000000e542",
] as const;
const GUARDIAN_CENTER_ID = "019f0000-0000-7000-8000-00000000e551";
const YEARS = [2198, 2199] as const;
const SESSION_ID = "kalakriti-guardian-race-session";

async function cleanup() {
  await db
    .delete(kalakritiEdition)
    .where(inArray(kalakritiEdition.id, EDITION_IDS));
  await db.delete(team).where(eq(team.id, TEAM_ID));
  await db
    .delete(user)
    .where(inArray(user.email, [GUARDIAN_EMAIL, ORPHAN_EMAIL]));
}

async function setup(superAdminEmail: string) {
  await cleanup();
  const actor = await db.query.user.findFirst({
    columns: { id: true },
    where: (table, operators) => operators.eq(table.email, superAdminEmail),
  });
  if (!actor) {
    throw new Error("E2E super administrator is missing");
  }

  const now = new Date();
  await db.insert(team).values({
    createdAt: now,
    id: TEAM_ID,
    name: "Kalakriti Guardian Race Test",
    updatedAt: now,
  });
  await db.insert(teamEvent).values(
    EVENT_IDS.map((id, index) => ({
      createdAt: now,
      createdBy: actor.id,
      id,
      managementDomain: "kalakriti" as const,
      name: `Kalakriti ${YEARS[index]} Race Test`,
      startTime: new Date(`${YEARS[index]}-11-19T04:30:00.000Z`),
      teamId: TEAM_ID,
      updatedAt: now,
    }))
  );
  await db.insert(kalakritiEdition).values(
    EDITION_IDS.map((id, index) => ({
      ageCutoffDate: `${YEARS[index]}-06-01`,
      brandingKey: `e2e-race-${YEARS[index]}`,
      createdAt: now,
      createdBy: actor.id,
      eventDate: `${YEARS[index]}-11-19`,
      id,
      name: `Kalakriti ${YEARS[index]}`,
      plannedRegistrationCloseAt: new Date(
        `${YEARS[index]}-10-31T18:15:00.000Z`
      ),
      teamEventId: EVENT_IDS[index],
      updatedAt: now,
      year: YEARS[index],
    }))
  );
  await db.insert(kalakritiCenter).values(
    CENTER_IDS.map((id, index) => ({
      competitionEntryRegistrationEnabled: false,
      createdAt: now,
      createdBy: actor.id,
      editionId: EDITION_IDS[index],
      id,
      name: `Race Center ${index + 1}`,
      normalizedName: `race center ${index + 1}`,
      studentRegistrationEnabled: false,
      updatedAt: now,
    }))
  );

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
    await tx
      .update(user)
      .set({
        banExpires: null,
        banned: true,
        banReason: "No active Kalakriti Edition membership",
      })
      .where(eq(user.id, external.id));
  });
  return { actorId: actor.id, userId: external.id };
}

async function setupOrphanedCentralGuardian(superAdminEmail: string) {
  const { actorId } = await setup(superAdminEmail);
  const now = new Date();
  await db.insert(user).values({
    email: ORPHAN_EMAIL,
    emailVerified: true,
    id: ORPHAN_USER_ID,
    name: ORPHAN_NAME,
    role: "volunteer",
  });
  await db.insert(kalakritiEditionMembership).values({
    createdAt: now,
    createdBy: actorId,
    editionId: EDITION_IDS[0],
    id: ORPHAN_MEMBERSHIP_ID,
    kind: "guardian",
    snapshotEmail: ORPHAN_EMAIL,
    snapshotName: ORPHAN_NAME,
    state: "active",
    updatedAt: now,
    userId: ORPHAN_USER_ID,
  });
  await db.delete(user).where(eq(user.id, ORPHAN_USER_ID));
  return { membershipId: ORPHAN_MEMBERSHIP_ID };
}

async function createSession(userId: string) {
  const now = new Date();
  await db.insert(session).values({
    createdAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
    id: SESSION_ID,
    token: SESSION_ID,
    updatedAt: now,
    userId,
  });
  return { created: true };
}

async function assignCenter(membershipId: string) {
  const membership = await db.query.kalakritiEditionMembership.findFirst({
    columns: { createdBy: true, editionId: true },
    where: (table, operators) => operators.eq(table.id, membershipId),
  });
  if (!membership) {
    throw new Error("Guardian membership is missing");
  }

  const editionIndex = EDITION_IDS.indexOf(
    membership.editionId as (typeof EDITION_IDS)[number]
  );
  if (editionIndex < 0) {
    throw new Error("Guardian membership belongs to an unexpected Edition");
  }

  await db.insert(kalakritiGuardianCenter).values({
    centerId: CENTER_IDS[editionIndex],
    createdAt: new Date(),
    createdBy: membership.createdBy,
    editionId: membership.editionId,
    id: GUARDIAN_CENTER_ID,
    membershipId,
  });
  return { assigned: true };
}

async function readState(userId: string) {
  const memberships = await db
    .select({
      editionId: kalakritiEditionMembership.editionId,
      id: kalakritiEditionMembership.id,
      state: kalakritiEditionMembership.state,
    })
    .from(kalakritiEditionMembership)
    .where(eq(kalakritiEditionMembership.userId, userId));
  const externalUser = await db.query.user.findFirst({
    columns: { banned: true },
    where: (table, operators) => operators.eq(table.id, userId),
  });
  const sessions = await db
    .select({ id: session.id })
    .from(session)
    .where(eq(session.userId, userId));
  const centerAssignments = memberships.length
    ? await db
        .select({ id: kalakritiGuardianCenter.id })
        .from(kalakritiGuardianCenter)
        .where(
          inArray(
            kalakritiGuardianCenter.membershipId,
            memberships.map((membership) => membership.id)
          )
        )
    : [];
  return {
    activeMemberships: memberships.filter(
      (membership) => membership.state === "active"
    ),
    banned: externalUser?.banned ?? null,
    centerAssignmentCount: centerAssignments.length,
    memberships,
    sessionCount: sessions.length,
  };
}

function readMembershipState(membershipId: string) {
  return db.query.kalakritiEditionMembership.findFirst({
    columns: { state: true, userId: true },
    where: (table, operators) => operators.eq(table.id, membershipId),
  });
}

const [action, argument] = process.argv.slice(2);
let result: unknown;
if (action === "setup" && argument) {
  result = await setup(argument);
} else if (action === "setup-orphan" && argument) {
  result = await setupOrphanedCentralGuardian(argument);
} else if (action === "create-session" && argument) {
  result = await createSession(argument);
} else if (action === "assign-center" && argument) {
  result = await assignCenter(argument);
} else if (action === "state" && argument) {
  result = await readState(argument);
} else if (action === "membership-state" && argument) {
  result = await readMembershipState(argument);
} else if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else {
  throw new Error(`Unsupported Guardian race helper action: ${action ?? ""}`);
}

process.stdout.write(`${JSON.stringify(result)}\n`);
