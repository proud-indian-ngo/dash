import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  policy,
  policyAcknowledgement,
  policyVersion,
} from "@pi-dash/db/schema/declarations";
import { team } from "@pi-dash/db/schema/team";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { POLICY_SEED_DOCUMENT_ID } from "@pi-dash/db/seed-governance";
import { addDays } from "date-fns";
import { eq, inArray } from "drizzle-orm";

/**
 * The safeguarding gate's fixture: a version of the seeded child-safeguarding
 * policy in force, and an upcoming event of a team that works with children.
 * Cleanup removes both, with every acknowledgement of the version, so the
 * seed's "no version, nothing gated" holds again.
 */

const TEAM_ID = "e2e00000-0000-0000-0000-00000000c501";
const EVENT_ID = "e2e00000-0000-0000-0000-00000000c502";
const VERSION_ID = "e2e00000-0000-0000-0000-00000000c503";

async function safeguardingPolicyId() {
  const found = await db.query.policy.findFirst({
    columns: { id: true },
    where: eq(policy.key, "child_safeguarding"),
  });
  if (!found) {
    throw new Error("The child-safeguarding policy isn't seeded");
  }
  return found.id;
}

async function cleanup() {
  const versions = await db
    .select({ id: policyVersion.id })
    .from(policyVersion)
    .where(eq(policyVersion.policyId, await safeguardingPolicyId()));
  const versionIds = versions.map((v) => v.id);
  if (versionIds.length > 0) {
    await db
      .delete(policyAcknowledgement)
      .where(inArray(policyAcknowledgement.policyVersionId, versionIds));
    await db.delete(policyVersion).where(inArray(policyVersion.id, versionIds));
  }
  // Deleting the team cascades to its event and the event's volunteers.
  await db.delete(team).where(eq(team.id, TEAM_ID));
}

async function setup() {
  await cleanup();
  const admin = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, "test-super-admin@pi-dash.test"),
  });
  if (!admin) {
    throw new Error("The super admin isn't seeded");
  }
  const now = new Date();
  await db.insert(team).values({
    createdAt: now,
    description: "Team for the E2E safeguarding gate",
    id: TEAM_ID,
    name: "E2E Children Team",
    updatedAt: now,
    worksWithChildren: true,
  });
  await db.insert(teamEvent).values({
    createdAt: now,
    createdBy: admin.id,
    id: EVENT_ID,
    isPublic: true,
    name: "E2E Children Event",
    startTime: addDays(now, 7),
    teamId: TEAM_ID,
    updatedAt: now,
  });
  await db.insert(policyVersion).values({
    documentId: POLICY_SEED_DOCUMENT_ID,
    effectiveOn: "2026-04-01",
    id: VERSION_ID,
    policyId: await safeguardingPolicyId(),
    publishedAt: now,
    publishedBy: admin.id,
    summary: "First version",
    version: 1,
  });
  return { eventId: EVENT_ID };
}

const [action] = process.argv.slice(2);
let result: unknown;
if (action === "setup") {
  result = await setup();
} else if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else {
  throw new Error(`Unsupported safeguarding gate action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
