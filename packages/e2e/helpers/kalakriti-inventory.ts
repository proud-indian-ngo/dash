import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAssignment,
  kalakritiCompetition,
  kalakritiCompetitionCategory,
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import {
  kalakritiInventoryItem,
  kalakritiInventoryTransaction,
} from "@pi-dash/db/schema/kalakriti-inventory";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { KALAKRITI_ACTORS } from "../fixtures/kalakriti-actors";

const editionId = "01a0aa0d-adf1-7bf6-a245-e0dcd8c90001";
const eventId = "01a0aa0d-adf1-7bf6-a245-e0dcd8c90002";
const year = 2157;
const memberHumanId = `KALV-${year}-0001`;
const leadHumanId = `KALV-${year}-0002`;
const unassignedHumanId = `KALV-${year}-0003`;

async function cleanup() {
  await db
    .delete(kalakritiInventoryTransaction)
    .where(eq(kalakritiInventoryTransaction.editionId, editionId));
  await db
    .delete(kalakritiInventoryItem)
    .where(eq(kalakritiInventoryItem.editionId, editionId));
  await db
    .delete(kalakritiAssignment)
    .where(eq(kalakritiAssignment.editionId, editionId));
  await db
    .delete(kalakritiCompetition)
    .where(eq(kalakritiCompetition.editionId, editionId));
  await db
    .delete(kalakritiCompetitionCategory)
    .where(eq(kalakritiCompetitionCategory.editionId, editionId));
  await db.delete(kalakritiEdition).where(eq(kalakritiEdition.id, editionId));
  await db.delete(teamEvent).where(eq(teamEvent.id, eventId));
}

async function setup(adminEmail: string, memberEmail: string) {
  await cleanup();
  const [admin, member, lead, denied, team] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.email, adminEmail) }),
    db.query.user.findFirst({ where: eq(user.email, memberEmail) }),
    db.query.user.findFirst({
      where: eq(user.email, KALAKRITI_ACTORS.categoryLead.email),
    }),
    db.query.user.findFirst({
      where: eq(user.email, KALAKRITI_ACTORS.liaison.email),
    }),
    db.query.team.findFirst({ columns: { id: true } }),
  ]);
  if (!admin || !member || !lead || !denied || !team)
    throw new Error("Missing inventory fixture users");
  const now = new Date();
  await db.insert(teamEvent).values({
    id: eventId,
    teamId: team.id,
    name: `Kalakriti ${year}`,
    description: "Isolated inventory E2E",
    city: "bangalore",
    managementDomain: "kalakriti",
    isPublic: false,
    startTime: new Date(`${year}-11-21T04:30:00Z`),
    createdBy: admin.id,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(kalakritiEdition).values({
    id: editionId,
    year,
    teamEventId: eventId,
    name: `Kalakriti ${year}`,
    brandingKey: "inventory-e2e",
    lifecycle: "draft",
    ageCutoffDate: `${year}-06-01`,
    eventDate: `${year}-11-21`,
    plannedRegistrationCloseAt: new Date(`${year}-10-31T18:29:00Z`),
    createdBy: admin.id,
    createdAt: now,
    updatedAt: now,
  });
  const memberId = uuidv7();
  const leadId = uuidv7();
  const deniedId = uuidv7();
  await db.insert(kalakritiEditionMembership).values(
    [
      { id: memberId, person: member },
      { id: leadId, person: lead },
      { id: deniedId, person: denied },
    ].map(({ id, person }) => ({
      id,
      editionId,
      userId: person.id,
      kind: "volunteer" as const,
      snapshotName: person.name,
      snapshotEmail: person.email,
      humanId:
        id === memberId
          ? memberHumanId
          : id === leadId
            ? leadHumanId
            : unassignedHumanId,
      createdBy: admin.id,
      createdAt: now,
      updatedAt: now,
    }))
  );
  await db.insert(kalakritiAssignment).values(
    [
      { membershipId: memberId, responsibility: "logistics_member" as const },
      { membershipId: leadId, responsibility: "logistics_lead" as const },
    ].map((assignment) => ({
      ...assignment,
      id: uuidv7(),
      editionId,
      isPrimary: true,
      createdAt: now,
      createdBy: admin.id,
    }))
  );
  const categoryId = uuidv7();
  const competitionId = uuidv7();
  const unrelatedCompetitionId = uuidv7();
  await db.insert(kalakritiCompetitionCategory).values({
    id: categoryId,
    editionId,
    name: "Inventory arts",
    normalizedName: "inventory arts",
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: admin.id,
  });
  await db.insert(kalakritiCompetition).values(
    [
      { id: competitionId, name: "Drawing", normalizedName: "drawing" },
      {
        id: unrelatedCompetitionId,
        name: "Singing",
        normalizedName: "singing",
      },
    ].map((competition) => ({
      ...competition,
      editionId,
      competitionCategoryId: categoryId,
      participationMode: "individual" as const,
      genderEligibility: "both" as const,
      minimumGroupSize: 1,
      maximumGroupSize: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: admin.id,
    }))
  );
  await db.insert(kalakritiAssignment).values({
    id: uuidv7(),
    editionId,
    membershipId: memberId,
    responsibility: "competition_volunteer",
    competitionId,
    isPrimary: false,
    createdAt: now,
    createdBy: admin.id,
  });
  return {
    editionId,
    year,
    memberId,
    memberName: member.name,
    memberHumanId,
    leadId,
    leadHumanId,
    leadName: lead.name,
    unassignedHumanId,
    unassignedName: denied.name,
    competitionId,
    unrelatedCompetitionId,
  };
}

const [action, adminEmail, memberEmail] = process.argv.slice(2);
let result: unknown;
if (action === "setup")
  result = await setup(adminEmail ?? "", memberEmail ?? "");
else if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "archive") {
  await db
    .update(kalakritiEdition)
    .set({ lifecycle: "archived", updatedAt: new Date() })
    .where(eq(kalakritiEdition.id, editionId));
  result = { archived: true };
} else if (action === "revoke") {
  await db
    .delete(kalakritiAssignment)
    .where(eq(kalakritiAssignment.editionId, editionId));
  result = { revoked: true };
} else if (action === "state") {
  const [items, transactions] = await Promise.all([
    db
      .select()
      .from(kalakritiInventoryItem)
      .where(eq(kalakritiInventoryItem.editionId, editionId)),
    db
      .select()
      .from(kalakritiInventoryTransaction)
      .where(eq(kalakritiInventoryTransaction.editionId, editionId))
      .orderBy(kalakritiInventoryTransaction.createdAt),
  ]);
  result = { items, transactions };
} else throw new Error("Unknown inventory fixture action");
await new Promise<void>((resolve, reject) => {
  process.stdout.write(`${JSON.stringify(result)}\n`, (error) =>
    error ? reject(error) : resolve()
  );
});
await db.$client.end();
process.exit(0);
