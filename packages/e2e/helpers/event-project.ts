import { db } from "@pi-dash/db";
import { project } from "@pi-dash/db/schema/finance-dimensions";
import { PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { uuidv7 } from "uuidv7";

/**
 * Database step for the event project spec, run with Bun as a script
 * because Playwright's Node runner cannot load `@pi-dash/db`. Prints one
 * JSON value.
 *
 * - `project <name>`: an active project under Education.
 */

const [action, name = ""] = process.argv.slice(2);

if (action !== "project" || !name) {
  throw new Error("Usage: event-project.ts project <name>");
}
const now = new Date();
const id = uuidv7();
await db.insert(project).values({
  code: `E2E-EVT-${id.slice(-8)}`,
  createdAt: now,
  id,
  name,
  programmeId: PROGRAMME_IDS.education,
  updatedAt: now,
});
process.stdout.write(`${JSON.stringify({ id })}\n`);
