import { db } from "@pi-dash/db";
import { partyPrivate } from "@pi-dash/db/schema/private/party-private";
import { eq } from "drizzle-orm";

/**
 * Database steps for the receipts spec, run with Bun as a script because
 * Playwright's Node runner cannot load `@pi-dash/db`. Prints one JSON value.
 *
 * - `clear-details-address`: removes the address of "E2E Receipt Details
 *   Donor" (seeded in seed-test-user.ts), so its gift reads Needs details
 *   again before each attempt of the test that adds the address.
 */

/** RECEIPT_DETAILS_DONOR_ID in seed-test-user.ts. */
const RECEIPT_DETAILS_DONOR_ID = "01930000-0000-7000-8000-000000000746";

const [action] = process.argv.slice(2);

if (action !== "clear-details-address") {
  throw new Error(`Unknown action ${action}`);
}
const cleared = await db
  .update(partyPrivate)
  .set({ addressLine1: null, pincode: null, updatedAt: new Date() })
  .where(eq(partyPrivate.partyId, RECEIPT_DETAILS_DONOR_ID))
  .returning({ partyId: partyPrivate.partyId });
process.stdout.write(`${JSON.stringify({ cleared: cleared.length })}\n`);
process.exit(0);
