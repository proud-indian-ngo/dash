import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  reimbursement,
  reimbursementAttachment,
  reimbursementHistory,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { vendorPayment } from "@pi-dash/db/schema/vendor";
import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Marks a request approved straight in the database, run with Bun as a
 * script because Playwright's Node runner cannot load `@pi-dash/db`.
 * Specs that only need an approved request as their starting point use this,
 * skipping the screenshot upload. The row has no screenshot, like requests approved
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

async function approve(id: string) {
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
  return { id, reviewedBy: reviewer, status: "approved" };
}

/**
 * Marks a reimbursement rejected after it was approved with a payment
 * screenshot: the stored key stays, as rejecting keeps the payment evidence.
 * The key only has to look durable; specs read the approve dialog, not R2.
 */
async function rejectWithScreenshot(id: string) {
  const reviewer = await reviewerId();
  const now = new Date();
  const prefix = process.env.R2_KEY_PREFIX ?? "attachments";
  const approvalScreenshotKey = `${prefix}/approval-screenshots/reimbursements/${id}/approval-screenshots/e2e-proof.png`;
  const [row] = await db
    .update(reimbursement)
    .set({
      approvalScreenshotKey,
      rejectionReason: "E2E rejected after payment",
      reviewedAt: now,
      reviewedBy: reviewer,
      status: "rejected",
      updatedAt: now,
    })
    .where(eq(reimbursement.id, id))
    .returning({ id: reimbursement.id });
  if (!row) {
    throw new Error(`Reimbursement ${id} not found`);
  }
  return { approvalScreenshotKey, id, status: "rejected" };
}

/**
 * Links a stand-in voucher attachment to each opted-in line item of an
 * approved reimbursement, as the voucher job would. The key only has to look
 * durable: the specs upload the signed copy, they never open this file.
 */
async function linkVoucher(id: string) {
  const prefix = process.env.R2_KEY_PREFIX ?? "attachments";
  const items = await db
    .select({ id: reimbursementLineItem.id })
    .from(reimbursementLineItem)
    .where(
      and(
        eq(reimbursementLineItem.reimbursementId, id),
        eq(reimbursementLineItem.generateVoucher, true)
      )
    );
  if (items.length === 0) {
    throw new Error(`Reimbursement ${id} has no voucher line item`);
  }
  for (const item of items) {
    const attachmentId = uuidv7();
    await db.insert(reimbursementAttachment).values({
      createdAt: new Date(),
      filename: "cash-voucher-E2E.pdf",
      id: attachmentId,
      mimeType: "application/pdf",
      objectKey: `${prefix}/vouchers/${id}/${attachmentId}-cash-voucher-E2E.pdf`,
      purpose: "voucher",
      reimbursementId: id,
      type: "file",
      url: null,
    });
    await db
      .update(reimbursementLineItem)
      .set({ voucherAttachmentId: attachmentId })
      .where(eq(reimbursementLineItem.id, item.id));
  }
  return { id, linked: items.length };
}

/**
 * Runs the real voucher job for each opted-in line item of an approved
 * reimbursement, as approval would queue it, so a spec can open the PDF.
 * Needs R2, like the job.
 */
async function generateVouchers(id: string) {
  const { handleGenerateCashVoucher } =
    await import("@pi-dash/jobs/handlers/generate-cash-voucher");
  const reviewer = await reviewerId();
  const items = await db
    .select({ id: reimbursementLineItem.id })
    .from(reimbursementLineItem)
    .where(
      and(
        eq(reimbursementLineItem.reimbursementId, id),
        eq(reimbursementLineItem.generateVoucher, true)
      )
    );
  await handleGenerateCashVoucher(
    items.map((item) => ({
      data: {
        approverUserId: reviewer,
        lineItemId: item.id,
        reimbursementId: id,
      },
      id: uuidv7(),
      name: "generate-cash-voucher",
    })) as never
  );
  const linked = await db
    .select({ voucherAttachmentId: reimbursementLineItem.voucherAttachmentId })
    .from(reimbursementLineItem)
    .where(eq(reimbursementLineItem.reimbursementId, id));
  if (!linked.some((item) => item.voucherAttachmentId)) {
    throw new Error(`No voucher was generated for ${id}`);
  }
  return { generated: items.length, id };
}

/**
 * Hands the request to the test volunteer as its claimant (and creator), as
 * if they had raised it: nobody approves or pays their own request, so a
 * spec that creates a request as the approver hands it over first.
 */
async function handOver(type: string, id: string) {
  const email = process.env.VOLUNTEER_EMAIL;
  if (!email) {
    throw new Error("VOLUNTEER_EMAIL is not set");
  }
  const [volunteer] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email));
  if (!volunteer) {
    throw new Error(`Test volunteer ${email} not found`);
  }
  const now = new Date();
  const rows =
    type === "reimbursement"
      ? await db
          .update(reimbursement)
          .set({
            createdBy: volunteer.id,
            updatedAt: now,
            userId: volunteer.id,
          })
          .where(eq(reimbursement.id, id))
          .returning({ id: reimbursement.id })
      : await db
          .update(vendorPayment)
          .set({ updatedAt: now, userId: volunteer.id })
          .where(eq(vendorPayment.id, id))
          .returning({ id: vendorPayment.id });
  if (rows.length === 0) {
    throw new Error(`${type} ${id} not found`);
  }
  return { id, userId: volunteer.id };
}

const [action, type = "", id = ""] = process.argv.slice(2);
let result: unknown;
if (action === "approve" && type === "reimbursement") {
  result = await approve(id);
} else if (
  action === "hand-over" &&
  (type === "reimbursement" || type === "vendor-payment")
) {
  result = await handOver(type, id);
} else if (action === "generate-voucher" && type === "reimbursement") {
  result = await generateVouchers(id);
} else if (action === "link-voucher" && type === "reimbursement") {
  result = await linkVoucher(id);
} else if (action === "reject-with-screenshot" && type === "reimbursement") {
  result = await rejectWithScreenshot(id);
} else {
  throw new Error("Unknown request approval fixture action");
}
await new Promise<void>((resolve, reject) => {
  process.stdout.write(`${JSON.stringify(result)}\n`, (error) =>
    error ? reject(error) : resolve()
  );
});
await db.$client.end();
process.exit(0);
