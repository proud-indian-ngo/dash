import { db } from "@pi-dash/db";
import {
  kalakritiAuditEntry,
  kalakritiEdition,
} from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";
import { KALAKRITI_RELEASE_FIXTURE_IDS } from "./kalakriti-release-fixture";

const YEAR = 2094;
const KALAKRITI_EDITION_ROLLBACK_IDS = {
  failedEditionAuditId: "019f0000-0019-7000-8000-000000009403",
  failedEditionEventId: "019f0000-0019-7000-8000-000000009402",
  failedLinkedEventAuditId: "019f0000-0019-7000-8000-000000009303",
  failedLinkedEventEditionId: "019f0000-0019-7000-8000-000000009301",
} as const;

async function cleanup() {
  const edition = await db.query.kalakritiEdition.findFirst({
    columns: { id: true, teamEventId: true },
    where: eq(kalakritiEdition.year, YEAR),
  });
  if (!edition) {
    return;
  }
  await db.delete(kalakritiEdition).where(eq(kalakritiEdition.id, edition.id));
  await db.delete(teamEvent).where(eq(teamEvent.id, edition.teamEventId));
}

async function state() {
  const edition = await db.query.kalakritiEdition.findFirst({
    columns: {
      ageCutoffDate: true,
      brandingKey: true,
      eventDate: true,
      id: true,
      name: true,
      plannedRegistrationCloseAt: true,
      teamEventId: true,
      year: true,
    },
    where: eq(kalakritiEdition.year, YEAR),
    with: { teamEvent: true },
  });
  return edition
    ? {
        ageCutoffDate: edition.ageCutoffDate,
        brandingKey: edition.brandingKey,
        editionId: edition.id,
        eventDate: edition.eventDate,
        eventName: edition.teamEvent.name,
        eventStartTime: edition.teamEvent.startTime.toISOString(),
        managementDomain: edition.teamEvent.managementDomain,
        name: edition.name,
        plannedRegistrationCloseAt:
          edition.plannedRegistrationCloseAt.toISOString(),
        teamEventId: edition.teamEventId,
        year: edition.year,
      }
    : null;
}

async function rollbackCleanup() {
  const ids = KALAKRITI_EDITION_ROLLBACK_IDS;
  await db
    .delete(kalakritiAuditEntry)
    .where(eq(kalakritiAuditEntry.id, ids.failedLinkedEventAuditId));
  await db
    .delete(kalakritiAuditEntry)
    .where(eq(kalakritiAuditEntry.id, ids.failedEditionAuditId));
  await db
    .delete(kalakritiEdition)
    .where(eq(kalakritiEdition.id, ids.failedLinkedEventEditionId));
  await db.delete(teamEvent).where(eq(teamEvent.id, ids.failedEditionEventId));
}

async function rollbackSetup() {
  await rollbackCleanup();
  const fixtureEvent = await db.query.teamEvent.findFirst({
    columns: { teamId: true },
    where: eq(teamEvent.id, KALAKRITI_RELEASE_FIXTURE_IDS.eventId),
  });
  if (!fixtureEvent) {
    throw new Error("Kalakriti release fixture event is missing");
  }
  return {
    ...KALAKRITI_EDITION_ROLLBACK_IDS,
    existingEditionId: KALAKRITI_RELEASE_FIXTURE_IDS.editionId,
    existingEventId: KALAKRITI_RELEASE_FIXTURE_IDS.eventId,
    teamId: fixtureEvent.teamId,
  };
}

async function rollbackState() {
  const ids = KALAKRITI_EDITION_ROLLBACK_IDS;
  const [failedLinkedEventEdition, failedEditionEvent] = await Promise.all([
    db.query.kalakritiEdition.findFirst({
      columns: { id: true },
      where: eq(kalakritiEdition.id, ids.failedLinkedEventEditionId),
    }),
    db.query.teamEvent.findFirst({
      columns: { id: true },
      where: eq(teamEvent.id, ids.failedEditionEventId),
    }),
  ]);
  return {
    failedEditionEventExists: Boolean(failedEditionEvent),
    failedLinkedEventEditionExists: Boolean(failedLinkedEventEdition),
  };
}

const [action] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "rollback-cleanup") {
  await rollbackCleanup();
  result = { cleaned: true };
} else if (action === "rollback-setup") {
  result = await rollbackSetup();
} else if (action === "rollback-state") {
  result = await rollbackState();
} else if (action === "state") {
  result = await state();
} else {
  throw new Error(
    `Unsupported Edition creation fixture action: ${action ?? ""}`
  );
}
process.stdout.write(`${JSON.stringify(result)}\n`);
