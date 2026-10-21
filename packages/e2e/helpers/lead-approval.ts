import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { programme } from "@pi-dash/db/schema/finance-dimensions";
import {
  reimbursement,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { COST_CENTRE_IDS } from "@pi-dash/shared/constants";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Database setup for the lead approval spec, run with Bun as a script
 * because Playwright's Node runner cannot load `@pi-dash/db`. Prints one
 * JSON value.
 *
 * `setup <stamp>`: two programmes, one led by the test volunteer and one by
 * the test admin, and a pending claim by the super admin charged to each.
 */

async function userIdOf(email: string | undefined) {
  if (!email) {
    throw new Error("Test user email is not set");
  }
  const [row] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!row) {
    throw new Error(`No user ${email}`);
  }
  return row.id;
}

async function addProgramme(name: string, code: string, leadUserId: string) {
  const id = uuidv7();
  const now = new Date();
  await db.insert(programme).values({
    code,
    createdAt: now,
    id,
    leadUserId,
    name,
    sortOrder: 900,
    updatedAt: now,
  });
  return id;
}

async function addClaim(
  title: string,
  programmeId: string,
  claimantId: string
) {
  const [category] = await db.query.expenseCategory.findMany({ limit: 1 });
  if (!category) {
    throw new Error("No expense category");
  }
  const id = uuidv7();
  const now = new Date();
  await db.insert(reimbursement).values({
    bankAccountName: "Test Super Admin",
    bankAccountNumber: "123456789012",
    chargedProgrammeId: programmeId,
    chargedTo: "programme",
    costCentreId: COST_CENTRE_IDS.bangalore,
    createdAt: now,
    createdBy: claimantId,
    expenseDate: now.toISOString().slice(0, 10),
    id,
    status: "pending",
    submittedAt: now,
    title,
    updatedAt: now,
    userId: claimantId,
  });
  await db.insert(reimbursementLineItem).values({
    amountPaise: 45_000,
    categoryId: category.id,
    createdAt: now,
    description: "Workshop supplies",
    id: uuidv7(),
    reimbursementId: id,
    sortOrder: 0,
    updatedAt: now,
  });
  return id;
}

async function setup(stamp: string) {
  const [volunteerId, adminId, claimantId] = await Promise.all([
    userIdOf(process.env.VOLUNTEER_EMAIL),
    userIdOf(process.env.ADMIN_EMAIL),
    userIdOf(process.env.SUPER_ADMIN_EMAIL),
  ]);
  const suffix = stamp.slice(-6);
  const ledProgramme = await addProgramme(
    `E2E Led ${stamp}`,
    `LA${suffix}`,
    volunteerId
  );
  const otherProgramme = await addProgramme(
    `E2E Other ${stamp}`,
    `LB${suffix}`,
    adminId
  );
  const led = { title: `E2E Lead claim ${stamp}` };
  const other = { title: `E2E Other claim ${stamp}` };
  return {
    led: { ...led, id: await addClaim(led.title, ledProgramme, claimantId) },
    other: {
      ...other,
      id: await addClaim(other.title, otherProgramme, claimantId),
    },
  };
}

const [action, stamp = ""] = process.argv.slice(2);
if (action !== "setup" || !stamp) {
  throw new Error(`Unknown action ${action}`);
}
process.stdout.write(`${JSON.stringify(await setup(stamp))}\n`);
process.exit(0);
