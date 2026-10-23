import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  reimbursement,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { COST_CENTRE_IDS } from "@pi-dash/shared/constants";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * A volunteer of their own whose reimbursements are exactly the rows below,
 * so the Reimbursements page's counts and totals are known to the paisa.
 * Setup deletes the volunteer's earlier requests first.
 *
 * - pending: ₹100.50 + ₹200.25 (two line items), and ₹49.25
 * - approved: ₹1,234.56
 * - rejected: ₹10.00
 * - approved, then voided: ₹5,000.00, which counts in no total
 */
const STATS_USER = {
  email: "e2e-reimbursement-stats@pi-dash.test",
  password: "E2E-stats-password-1",
};

async function statsUserId() {
  let existing = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, STATS_USER.email),
  });
  if (!existing) {
    await auth.api.createUser({
      body: { ...STATS_USER, name: "E2E Stats Volunteer" },
    });
    existing = await db.query.user.findFirst({
      columns: { id: true },
      where: eq(user.email, STATS_USER.email),
    });
  }
  if (!existing) {
    throw new Error("Unable to create the stats volunteer");
  }
  await db
    .update(user)
    .set({
      banned: false,
      emailVerified: true,
      isActive: true,
      role: "volunteer",
    })
    .where(eq(user.id, existing.id));
  return existing.id;
}

async function setup() {
  const userId = await statsUserId();
  // Line items cascade with their request.
  await db.delete(reimbursement).where(eq(reimbursement.userId, userId));
  const [category] = await db.query.expenseCategory.findMany({ limit: 1 });
  if (!category) {
    throw new Error("No expense category");
  }
  const now = new Date();
  const request = async (
    title: string,
    status: "approved" | "pending" | "rejected",
    amounts: number[],
    extra: Partial<typeof reimbursement.$inferInsert> = {}
  ) => {
    const id = uuidv7();
    await db.insert(reimbursement).values({
      chargedTo: "organisation",
      costCentreId: COST_CENTRE_IDS.bangalore,
      createdAt: now,
      createdBy: userId,
      expenseDate: now.toISOString().slice(0, 10),
      id,
      status,
      submittedAt: now,
      title,
      updatedAt: now,
      userId,
      ...extra,
    });
    await db.insert(reimbursementLineItem).values(
      amounts.map((amountPaise, sortOrder) => ({
        amountPaise,
        categoryId: category.id,
        createdAt: now,
        id: uuidv7(),
        reimbursementId: id,
        sortOrder,
        updatedAt: now,
      }))
    );
  };
  await request("Stats pending travel", "pending", [10_050, 20_025]);
  await request("Stats pending snacks", "pending", [4925]);
  await request("Stats approved venue", "approved", [123_456], {
    reviewedAt: now,
  });
  await request("Stats rejected taxi", "rejected", [1000], {
    rejectionReason: "No receipt",
    reviewedAt: now,
  });
  await request("Stats voided printing", "approved", [500_000], {
    reviewedAt: now,
    voidedAt: now,
    voidReason: "Paid twice",
  });
  return STATS_USER;
}

const [action] = process.argv.slice(2);
if (action !== "setup") {
  throw new Error(`Unsupported reimbursement stats action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(await setup())}\n`);
process.exit(0);
