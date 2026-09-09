import {
  createKalakritiExternalUser,
  deleteKalakritiExternalUser,
} from "@pi-dash/auth/kalakriti-external-user";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  kalakritiAssignment,
  kalakritiCenter,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiExternalIdentity,
  kalakritiGuardianCenter,
  kalakritiTransportAssignment,
  kalakritiTransportStatusHistory,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

const ids = {
  editionId: "019f0000-0110-7000-8000-000000000001",
  eventId: "019f0000-0110-7000-8000-000000000002",
  centerA: "019f0000-0110-7000-8000-000000000003",
  centerB: "019f0000-0110-7000-8000-000000000004",
  guardianMembership: "019f0000-0110-7000-8000-000000000005",
  guardianCenter: "019f0000-0110-7000-8000-000000000006",
  coordinatorMembership: "019f0000-0110-7000-8000-000000000007",
  coordinatorAssignment: "019f0000-0110-7000-8000-000000000008",
  restrictedAssignment: "019f0000-0110-7000-8000-000000000009",
  restrictedHistory: "019f0000-0110-7000-8000-00000000000a",
};
const year = 2156;
const guardianEmail = "transport-guardian@pi-dash.test";
const guardianPassword = "TransportGuardian!2156";

async function cleanup() {
  await db
    .delete(kalakritiEdition)
    .where(eq(kalakritiEdition.id, ids.editionId));
  await db.delete(teamEvent).where(eq(teamEvent.id, ids.eventId));
  const guardian = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, guardianEmail),
  });
  if (guardian) await deleteKalakritiExternalUser(guardian.id);
}

async function setup(adminEmail: string, coordinatorEmail: string) {
  await cleanup();
  const [admin, coordinator, team] = await Promise.all([
    db.query.user.findFirst({
      where: eq(user.email, adminEmail),
      columns: { id: true },
    }),
    db.query.user.findFirst({
      where: eq(user.email, coordinatorEmail),
      columns: { id: true, name: true, email: true },
    }),
    db.query.team.findFirst({ columns: { id: true } }),
  ]);
  if (!admin || !coordinator || !team)
    throw new Error("Transport fixture requires admin, coordinator, and team");
  const now = new Date();
  await db.insert(teamEvent).values({
    id: ids.eventId,
    city: "bangalore",
    createdAt: now,
    createdBy: admin.id,
    description: "Isolated Center transport E2E",
    isPublic: false,
    managementDomain: "kalakriti",
    name: `Kalakriti ${year}`,
    startTime: new Date(`${year}-11-21T04:30:00Z`),
    teamId: team.id,
    updatedAt: now,
  });
  await db.insert(kalakritiEdition).values({
    id: ids.editionId,
    ageCutoffDate: `${year}-06-01`,
    brandingKey: "kalakriti-transport-e2e",
    createdAt: now,
    createdBy: admin.id,
    eventDate: `${year}-11-21`,
    lifecycle: "draft",
    name: `Kalakriti ${year}`,
    plannedRegistrationCloseAt: new Date(`${year}-10-31T18:29:00Z`),
    teamEventId: ids.eventId,
    updatedAt: now,
    year,
  });
  await db.insert(kalakritiCenter).values(
    [ids.centerA, ids.centerB].map((id, index) => ({
      id,
      editionId: ids.editionId,
      name: `Transport Center ${index === 0 ? "A" : "B"}`,
      normalizedName: `transport center ${index === 0 ? "a" : "b"}`,
      createdAt: now,
      createdBy: admin.id,
      updatedAt: now,
    }))
  );
  const guardian = await createKalakritiExternalUser({
    email: guardianEmail,
    password: guardianPassword,
    name: "Transport Guardian",
    phone: null,
  });
  await db
    .insert(kalakritiExternalIdentity)
    .values({ userId: guardian.id, createdAt: now, createdBy: admin.id });
  await db.insert(kalakritiEditionMembership).values([
    {
      id: ids.guardianMembership,
      editionId: ids.editionId,
      kind: "guardian",
      userId: guardian.id,
      snapshotName: "Transport Guardian",
      snapshotEmail: guardianEmail,
      createdAt: now,
      createdBy: admin.id,
      updatedAt: now,
    },
    {
      id: ids.coordinatorMembership,
      editionId: ids.editionId,
      kind: "volunteer",
      userId: coordinator.id,
      snapshotName: coordinator.name,
      snapshotEmail: coordinator.email,
      createdAt: now,
      createdBy: admin.id,
      updatedAt: now,
    },
  ]);
  await db.insert(kalakritiGuardianCenter).values({
    id: ids.guardianCenter,
    editionId: ids.editionId,
    centerId: ids.centerA,
    membershipId: ids.guardianMembership,
    createdAt: now,
    createdBy: admin.id,
  });
  await db.insert(kalakritiAssignment).values({
    id: ids.coordinatorAssignment,
    editionId: ids.editionId,
    membershipId: ids.coordinatorMembership,
    centerId: ids.centerA,
    responsibility: "transport_coordinator",
    isPrimary: true,
    createdAt: now,
    createdBy: admin.id,
  });
  await db.insert(kalakritiTransportAssignment).values({
    id: ids.restrictedAssignment,
    editionId: ids.editionId,
    centerId: ids.centerB,
    vehicleLabel: "Restricted Bus",
    driverName: "Restricted Driver",
    capacity: 20,
    status: "planned",
    createdAt: now,
    createdBy: admin.id,
    updatedAt: now,
  });
  await db.insert(kalakritiTransportStatusHistory).values({
    id: ids.restrictedHistory,
    editionId: ids.editionId,
    assignmentId: ids.restrictedAssignment,
    actorUserId: admin.id,
    createdAt: now,
    occurredAt: now,
    fromStatus: null,
    toStatus: "planned",
  });
  return { ...ids, year, guardianEmail, guardianPassword };
}

const [action, adminEmail, coordinatorEmail] = process.argv.slice(2);
let result: unknown;
if (action === "setup")
  result = await setup(adminEmail ?? "", coordinatorEmail ?? "");
else if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "archive") {
  await db
    .update(kalakritiEdition)
    .set({ lifecycle: "archived", updatedAt: new Date() })
    .where(eq(kalakritiEdition.id, ids.editionId));
  result = { archived: true };
} else if (action === "state") {
  const [assignments, history] = await Promise.all([
    db
      .select({
        id: kalakritiTransportAssignment.id,
        centerId: kalakritiTransportAssignment.centerId,
        vehicleLabel: kalakritiTransportAssignment.vehicleLabel,
        driverName: kalakritiTransportAssignment.driverName,
        status: kalakritiTransportAssignment.status,
      })
      .from(kalakritiTransportAssignment)
      .where(eq(kalakritiTransportAssignment.editionId, ids.editionId)),
    db
      .select({
        assignmentId: kalakritiTransportStatusHistory.assignmentId,
        fromStatus: kalakritiTransportStatusHistory.fromStatus,
        toStatus: kalakritiTransportStatusHistory.toStatus,
      })
      .from(kalakritiTransportStatusHistory)
      .where(eq(kalakritiTransportStatusHistory.editionId, ids.editionId))
      .orderBy(kalakritiTransportStatusHistory.createdAt),
  ]);
  result = { assignments, history };
} else throw new Error("Unknown transport fixture action");
await new Promise<void>((resolve, reject) => {
  process.stdout.write(`${JSON.stringify(result)}\n`, (error) =>
    error ? reject(error) : resolve()
  );
});
await db.$client.end();
process.exit(0);
