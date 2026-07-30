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
    columns: { id: true, name: true, teamEventId: true, year: true },
    where: eq(kalakritiEdition.year, YEAR),
    with: { teamEvent: true },
  });
  return edition
    ? {
        editionId: edition.id,
        eventName: edition.teamEvent.name,
        managementDomain: edition.teamEvent.managementDomain,
        name: edition.name,
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
