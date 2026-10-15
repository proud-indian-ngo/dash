import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  reimbursement,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Database steps for the "Charged to" spec, run with Bun as a script because
 * Playwright's Node runner cannot load `@pi-dash/db`. Prints one JSON value.
 *
 * - `legacy-unallocated <title> <email>`: a pending reimbursement without an
 *   event on the Unallocated holding programme, as the backfill leaves legacy
 *   requests. The app refuses Unallocated for new picks, so only the
 *   database can make one.
 */

const [action, title = "", email = ""] = process.argv.slice(2);

async function legacyUnallocated() {
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!owner) {
    throw new Error(`No user ${email}`);
  }
  const [category] = await db.query.expenseCategory.findMany({ limit: 1 });
  if (!category) {
    throw new Error("No expense category");
  }
  const id = uuidv7();
  const now = new Date();
  await db.insert(reimbursement).values({
    chargedProgrammeId: PROGRAMME_IDS.unallocated,
    chargedTo: "programme",
    city: "bangalore",
    createdAt: now,
    expenseDate: now.toISOString().slice(0, 10),
    id,
    status: "pending",
    submittedAt: now,
    title,
    updatedAt: now,
    userId: owner.id,
  });
  await db.insert(reimbursementLineItem).values({
    amountPaise: 12_300,
    categoryId: category.id,
    createdAt: now,
    description: "Legacy item",
    id: uuidv7(),
    sortOrder: 0,
    updatedAt: now,
    reimbursementId: id,
  });
  return { id };
}

let result: unknown;
if (action === "legacy-unallocated") {
  result = await legacyUnallocated();
} else {
  throw new Error(`Unknown action ${action}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
