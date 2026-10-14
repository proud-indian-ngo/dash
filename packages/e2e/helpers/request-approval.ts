import { db } from "@pi-dash/db";
import {
  advancePayment,
  advancePaymentHistory,
} from "@pi-dash/db/schema/advance-payment";
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
 * before the screenshot was required. Prints one JSON value.
 */
function approvedFields(userId: string) {
  const now = new Date();
  return {
    history: {
      action: "approved",
      actorId: userId,
      createdAt: now,
      id: uuidv7(),
    },
    request: {
      reviewedAt: now,
      reviewedBy: userId,
      status: "approved",
      updatedAt: now,
    },
  } as const;
}

async function approve(type: string, id: string) {
  if (type === "reimbursement") {
    const [row] = await db
      .select({ userId: reimbursement.userId })
      .from(reimbursement)
      .where(eq(reimbursement.id, id));
    if (!row) {
      throw new Error(`Reimbursement ${id} not found`);
    }
    const fields = approvedFields(row.userId);
    await db
      .update(reimbursement)
      .set(fields.request)
      .where(eq(reimbursement.id, id));
    await db
      .insert(reimbursementHistory)
      .values({ ...fields.history, reimbursementId: id });
  } else if (type === "advance-payment") {
    const [row] = await db
      .select({ userId: advancePayment.userId })
      .from(advancePayment)
      .where(eq(advancePayment.id, id));
    if (!row) {
      throw new Error(`Advance payment ${id} not found`);
    }
    const fields = approvedFields(row.userId);
    await db
      .update(advancePayment)
      .set(fields.request)
      .where(eq(advancePayment.id, id));
    await db
      .insert(advancePaymentHistory)
      .values({ ...fields.history, advancePaymentId: id });
  } else {
    throw new Error(`Unknown request type ${type}`);
  }
  return { id, status: "approved" };
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
