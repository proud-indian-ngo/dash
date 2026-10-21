import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { programme } from "@pi-dash/db/schema/finance-dimensions";
import {
  reimbursement,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { vendorPayment } from "@pi-dash/db/schema/vendor";
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
 * `setup-vendor-payment <stamp>`: a pending payment by the super admin
 * charged to a programme led by the admin.
 * `vendor-payment-status <id>`: the persisted status of that payment.
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

async function setupVendorPayment(stamp: string) {
  const [adminId, claimantId, vendor] = await Promise.all([
    userIdOf(process.env.ADMIN_EMAIL),
    userIdOf(process.env.SUPER_ADMIN_EMAIL),
    db.query.vendor.findFirst({
      where: (table, ops) =>
        ops.eq(table.id, "e2e00000-0000-0000-0000-000000000003"),
    }),
  ]);
  if (!vendor) {
    throw new Error("No seeded vendor");
  }
  const programmeId = await addProgramme(
    `E2E Vendor reject ${stamp}`,
    `VR${stamp}`,
    adminId
  );
  const id = uuidv7();
  const now = new Date();
  await db.insert(vendorPayment).values({
    chargedProgrammeId: programmeId,
    chargedTo: "programme",
    costCentreId: COST_CENTRE_IDS.bangalore,
    createdAt: now,
    id,
    status: "pending",
    submittedAt: now,
    title: `E2E Vendor reject ${stamp}`,
    updatedAt: now,
    userId: claimantId,
    vendorId: vendor.id,
  });
  return { id };
}

async function vendorPaymentStatus(id: string) {
  const [row] = await db
    .select({ status: vendorPayment.status })
    .from(vendorPayment)
    .where(eq(vendorPayment.id, id));
  if (!row) {
    throw new Error(`No vendor payment ${id}`);
  }
  return row.status;
}

const [action, value = ""] = process.argv.slice(2);
let result: unknown;
if (action === "setup" && value) {
  result = await setup(value);
} else if (action === "setup-vendor-payment" && value) {
  result = await setupVendorPayment(value);
} else if (action === "vendor-payment-status" && value) {
  result = await vendorPaymentStatus(value);
} else {
  throw new Error(`Unknown action ${action}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
