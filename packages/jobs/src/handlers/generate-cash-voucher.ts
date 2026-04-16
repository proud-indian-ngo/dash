import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import {
  reimbursement,
  reimbursementAttachment,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { env } from "@pi-dash/env/server";
import { VOUCHER_AMOUNT_THRESHOLD } from "@pi-dash/shared/constants";
import { eq, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";
import type { GenerateCashVoucherPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";
import { getR2Client } from "./r2";

/**
 * Atomically insert the new attachment, point the line item FK at it, and
 * delete the old attachment row. If this transaction fails the old voucher
 * stays linked and the new row is rolled back — no orphan attachment rows.
 */
async function commitVoucherAttachment(opts: {
  attachment: {
    filename: string;
    id: string;
    mimeType: string;
    objectKey: string;
    reimbursementId: string;
  };
  lineItemId: string;
  oldAttachmentId: string | null;
}) {
  await db.transaction(async (tx) => {
    await tx.insert(reimbursementAttachment).values({
      id: opts.attachment.id,
      reimbursementId: opts.attachment.reimbursementId,
      type: "file",
      filename: opts.attachment.filename,
      objectKey: opts.attachment.objectKey,
      url: null,
      mimeType: opts.attachment.mimeType,
      createdAt: new Date(),
    });

    await tx
      .update(reimbursementLineItem)
      .set({ voucherAttachmentId: opts.attachment.id })
      .where(eq(reimbursementLineItem.id, opts.lineItemId));

    if (opts.oldAttachmentId) {
      await tx
        .delete(reimbursementAttachment)
        .where(eq(reimbursementAttachment.id, opts.oldAttachmentId));
    }
  });
}

async function generateCashVoucher(data: GenerateCashVoucherPayload) {
  const log = createRequestLogger({
    method: "JOB",
    path: "generate-cash-voucher",
  });
  log.set({
    lineItemId: data.lineItemId,
    reimbursementId: data.reimbursementId,
    approverUserId: data.approverUserId,
  });

  const [lineItem] = await db
    .select()
    .from(reimbursementLineItem)
    .where(eq(reimbursementLineItem.id, data.lineItemId));
  if (!lineItem) {
    log.set({ event: "line_item_not_found" });
    log.emit();
    return;
  }

  const amount = Number(lineItem.amount);
  if (amount > VOUCHER_AMOUNT_THRESHOLD) {
    log.set({ event: "amount_exceeds_threshold", amount });
    log.emit();
    return;
  }

  const [reimb] = await db
    .select()
    .from(reimbursement)
    .where(eq(reimbursement.id, data.reimbursementId));
  if (!reimb || reimb.status !== "approved") {
    log.set({
      event: "reimbursement_not_approved",
      reimbStatus: reimb?.status ?? "not_found",
    });
    log.emit();
    return;
  }

  // Capture old voucher's R2 key before mutations, for cleanup after commit.
  let oldR2Key: string | null = null;
  if (lineItem.voucherAttachmentId) {
    const [oldAtt] = await db
      .select({ objectKey: reimbursementAttachment.objectKey })
      .from(reimbursementAttachment)
      .where(eq(reimbursementAttachment.id, lineItem.voucherAttachmentId));
    oldR2Key = oldAtt?.objectKey ?? null;
  }

  const [submitter] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, reimb.userId));

  const [category] = await db
    .select({ name: expenseCategory.name })
    .from(expenseCategory)
    .where(eq(expenseCategory.id, lineItem.categoryId));

  // Allocate voucher number (nextval is atomic — no duplicates even concurrently)
  const seqRows = await db.execute(
    sql`SELECT nextval('voucher_seq') as seq_val`
  );
  const seqVal = String(seqRows[0]?.seq_val ?? "0");
  const year = new Date().getFullYear();
  const voucherNumber = `CV-${year}-${seqVal.padStart(4, "0")}`;

  log.set({ voucherNumber });

  const { generateCashVoucherPdf } = await import(
    "@pi-dash/pdf/generate-voucher"
  );
  const { amountToWords } = await import("@pi-dash/pdf/amount-to-words");

  const pdfBuffer = await generateCashVoucherPdf({
    voucherNumber,
    date: reimb.expenseDate,
    paidTo: submitter?.name ?? "Unknown",
    description: lineItem.description,
    category: category?.name ?? "Uncategorized",
    amount,
    amountInWords: amountToWords(amount),
    approvedBy: env.VOUCHER_FINANCE_ADMIN_NAME,
    orgName: env.VOUCHER_ORG_NAME,
    orgAddress: env.VOUCHER_ORG_ADDRESS,
    orgPhone: env.VOUCHER_ORG_PHONE,
    orgEmail: env.VOUCHER_ORG_EMAIL,
    orgRegistration: env.VOUCHER_ORG_REGISTRATION,
  });

  // 1. Upload new PDF to R2. If this fails the old voucher is untouched.
  const filename = `cash-voucher-${voucherNumber}.pdf`;
  const objectKey = `${env.R2_KEY_PREFIX}/vouchers/${data.reimbursementId}/${uuidv7()}-${filename}`;
  const s3 = getR2Client();
  await s3.write(objectKey, pdfBuffer, { type: "application/pdf" });

  // 2. Atomic commit: insert new attachment + swap FK + delete old row.
  //    If this fails, old voucher stays linked. The uploaded R2 object
  //    becomes an orphan (harmless — no DB row points to it).
  const attachmentId = uuidv7();
  await commitVoucherAttachment({
    attachment: {
      id: attachmentId,
      reimbursementId: data.reimbursementId,
      filename,
      objectKey,
      mimeType: "application/pdf",
    },
    lineItemId: data.lineItemId,
    oldAttachmentId: lineItem.voucherAttachmentId,
  });

  // 3. Best-effort R2 cleanup of old object.
  if (oldR2Key) {
    s3.delete(oldR2Key).catch((err: unknown) => {
      log.set({
        event: "old_r2_cleanup_failed",
        oldR2Key,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    log.set({ event: "old_voucher_replaced" });
  }

  log.set({ event: "voucher_generated", attachmentId, objectKey });
  log.emit();
}

export const handleGenerateCashVoucher =
  createNotifyHandler<GenerateCashVoucherPayload>(
    "generate-cash-voucher",
    async () => generateCashVoucher
  );
