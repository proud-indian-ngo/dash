import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { project } from "@pi-dash/db/schema/finance-dimensions";
import { contribution } from "@pi-dash/db/schema/income";
import { GENERAL_FUND_ID, PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Database steps for the contribution specs, run with Bun as a script
 * because Playwright's Node runner cannot load `@pi-dash/db`. Prints one
 * JSON value.
 *
 * - `corpus-with-project <reference> <email>`: a corpus gift from the E2E
 *   income donor that still holds a project and its programme, as gifts
 *   recorded before the programme rule may. The app refuses that
 *   combination now, so only the database can make one.
 */

const [action, reference = "", email = ""] = process.argv.slice(2);

/** Seeded by helpers/seed-test-user.ts. */
const E2E_ORG_ACCOUNT_ID = "01930000-0000-7000-8000-000000000711";
const INCOME_DONOR_ID = "01930000-0000-7000-8000-000000000721";

async function corpusWithProject() {
  const [creator] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!creator) {
    throw new Error(`No user ${email}`);
  }
  const now = new Date();
  const projectId = uuidv7();
  await db.insert(project).values({
    code: `E2E-${reference}`,
    createdAt: now,
    id: projectId,
    name: `E2E corpus project ${reference}`,
    programmeId: PROGRAMME_IDS.education,
    updatedAt: now,
  });
  const id = uuidv7();
  await db.insert(contribution).values({
    amountPaise: 330_000,
    channel: "neft",
    createdAt: now,
    createdBy: creator.id,
    donationType: "corpus",
    fundId: GENERAL_FUND_ID,
    id,
    orgAccountId: E2E_ORG_ACCOUNT_ID,
    partyId: INCOME_DONOR_ID,
    programmeId: PROGRAMME_IDS.education,
    projectId,
    receivedOn: now.toISOString().slice(0, 10),
    reference,
    reportingMode: "electronic_or_account_payee",
    status: "received",
    updatedAt: now,
  });
  return { id };
}

if (action !== "corpus-with-project") {
  throw new Error("Unknown contribution fixture action");
}
process.stdout.write(`${JSON.stringify(await corpusWithProject())}\n`);
process.exit(0);
