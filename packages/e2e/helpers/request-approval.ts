import { db } from "@pi-dash/db";
import {
  advancePayment,
  advancePaymentHistory,
} from "@pi-dash/db/schema/advance-payment";
import { user } from "@pi-dash/db/schema/auth";
import {
  reimbursement,
  reimbursementHistory,
} from "@pi-dash/db/schema/reimbursement";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Marks a request approved straight in the database, run with Bun as a
 * script because Playwright's Node runner cannot load `@pi-dash/db`.
 * Approving in the app needs the payment screenshot promoted in R2, which CI
 * does not have, so specs that only need an approved request as their
 * starting point use this. The row has no screenshot, like requests approved
 * before the screenshot was required; the seeded super admin is recorded as
 * the reviewer. Prints one JSON value.
 */
const SUPER_ADMIN_EMAIL =
  process.env.SUPER_ADMIN_EMAIL ?? "test-super-admin@pi-dash.test";

/** The seeded super admin, who reviews requests in the approval specs. */
async function reviewerId(): Promise<string> {
  const [reviewer] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, SUPER_ADMIN_EMAIL));
  if (!reviewer) {
    throw new Error(`Seeded super admin ${SUPER_ADMIN_EMAIL} not found`);
  }
  return reviewer.id;
}

async function approve(type: string, id: string) {
  const reviewer = await reviewerId();
  const now = new Date();
  const request = {
    reviewedAt: now,
    reviewedBy: reviewer,
    status: "approved",
    updatedAt: now,
  } as const;
  const history = {
    action: "approved",
    actorId: reviewer,
    createdAt: now,
    id: uuidv7(),
  } as const;
  if (type === "reimbursement") {
    const [row] = await db
      .update(reimbursement)
      .set(request)
      .where(eq(reimbursement.id, id))
      .returning({ id: reimbursement.id });
    if (!row) {
      throw new Error(`Reimbursement ${id} not found`);
    }
    await db
      .insert(reimbursementHistory)
      .values({ ...history, reimbursementId: id });
  } else if (type === "advance-payment") {
    const [row] = await db
      .update(advancePayment)
      .set(request)
      .where(eq(advancePayment.id, id))
      .returning({ id: advancePayment.id });
    if (!row) {
      throw new Error(`Advance payment ${id} not found`);
    }
    await db
      .insert(advancePaymentHistory)
      .values({ ...history, advancePaymentId: id });
  } else {
    throw new Error(`Unknown request type ${type}`);
  }
  return { id, reviewedBy: reviewer, status: "approved" };
}

const [action, type = "", id = ""] = process.argv.slice(2);
if (action !== "approve") {
  throw new Error("Unknown request approval fixture action");
}
const result = await approve(type, id);
await new Promise<void>((resolve, reject) => {
  process.stdout.write(`${JSON.stringify(result)}\n`, (error) =>
    error ? reject(error) : resolve()
  );
});
await db.$client.end();
process.exit(0);
