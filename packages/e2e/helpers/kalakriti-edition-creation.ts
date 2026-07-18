import { db } from "@pi-dash/db";
import { kalakritiEdition } from "@pi-dash/db/schema/kalakriti";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import { eq } from "drizzle-orm";

const YEAR = 2094;

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

const [action] = process.argv.slice(2);
let result: unknown;
if (action === "cleanup") {
  await cleanup();
  result = { cleaned: true };
} else if (action === "state") {
  result = await state();
} else {
  throw new Error(
    `Unsupported Edition creation fixture action: ${action ?? ""}`
  );
}
process.stdout.write(`${JSON.stringify(result)}\n`);
