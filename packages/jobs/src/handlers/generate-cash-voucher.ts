import { db } from "@pi-dash/db";
import { appConfig } from "@pi-dash/db/schema/app-config";
import { user } from "@pi-dash/db/schema/auth";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import {
  reimbursement,
  reimbursementAttachment,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { env } from "@pi-dash/env/server";
import {
  CASH_VOUCHER_LIMIT_CONFIG_KEY,
  parseCashVoucherLimit,
  qualifiesForCashVoucher,
} from "@pi-dash/shared/cash-voucher";
import { eq, sql } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";

import type { GenerateCashVoucherPayload } from "../enqueue";
import { createNotifyHandler } from "./create-handler";
import { getR2Client } from "./r2";

/** What the voucher printed from the line item and its request. */
interface RenderedFrom {
  amountPaise: number;
  categoryId: string;
  description: string | null;
  expenseDate: string;
  payeeName: string | null;
  payeePhone: string | null;
}

/**
 * Atomically insert the new attachment, point the line item FK at it, and
 * delete the attachment row it replaces. The line item is locked and must
 * still hold what was rendered: if an edit changed it meanwhile, nothing is
 * linked and the newer job (queued by that edit) wins. Returns whether the
 * voucher was linked, and the replaced object's key for cleanup.
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
  rendered: RenderedFrom;
}): Promise<{ linked: false } | { linked: true; oldR2Key: string | null }> {
  return await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        amountPaise: reimbursementLineItem.amountPaise,
        categoryId: reimbursementLineItem.categoryId,
        description: reimbursementLineItem.description,
        payeeName: reimbursementLineItem.payeeName,
        payeePhone: reimbursementLineItem.payeePhone,
        voucherAttachmentId: reimbursementLineItem.voucherAttachmentId,
      })
      .from(reimbursementLineItem)
      .where(eq(reimbursementLineItem.id, opts.lineItemId))
      .for("update");
    const [request] = await tx
      .select({ expenseDate: reimbursement.expenseDate })
      .from(reimbursement)
      .where(eq(reimbursement.id, opts.attachment.reimbursementId));
    const { rendered } = opts;
    if (
      !(current && request) ||
      current.amountPaise !== rendered.amountPaise ||
      current.categoryId !== rendered.categoryId ||
      current.description !== rendered.description ||
      current.payeeName !== rendered.payeeName ||
      current.payeePhone !== rendered.payeePhone ||
      request.expenseDate !== rendered.expenseDate
    ) {
      return { linked: false };
    }

    await tx.insert(reimbursementAttachment).values({
      createdAt: new Date(),
      filename: opts.attachment.filename,
      id: opts.attachment.id,
      mimeType: opts.attachment.mimeType,
      objectKey: opts.attachment.objectKey,
      reimbursementId: opts.attachment.reimbursementId,
      type: "file",
      url: null,
    });

    // A new voucher number makes an earlier signed copy stale: unlink it
    // (the file stays among the request's attachments).
    await tx
      .update(reimbursementLineItem)
      .set({
        signedVoucherAttachmentId: null,
        voucherAttachmentId: opts.attachment.id,
      })
      .where(eq(reimbursementLineItem.id, opts.lineItemId));

    let oldR2Key: string | null = null;
    if (current.voucherAttachmentId) {
      const [old] = await tx
        .delete(reimbursementAttachment)
        .where(eq(reimbursementAttachment.id, current.voucherAttachmentId))
        .returning({ objectKey: reimbursementAttachment.objectKey });
      oldR2Key = old?.objectKey ?? null;
    }
    return { linked: true, oldR2Key };
  });
}

async function generateCashVoucher(data: GenerateCashVoucherPayload) {
  const log = createRequestLogger({
    method: "JOB",
    path: "generate-cash-voucher",
  });
  log.set({
    approverUserId: data.approverUserId,
    lineItemId: data.lineItemId,
    reimbursementId: data.reimbursementId,
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

  const { amountPaise } = lineItem;
  const [limitRow] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, CASH_VOUCHER_LIMIT_CONFIG_KEY));
  const limitPaise = parseCashVoucherLimit(limitRow?.value);
  if (!qualifiesForCashVoucher(amountPaise, limitPaise)) {
    log.set({ amountPaise, event: "amount_exceeds_threshold", limitPaise });
    log.emit();
    return;
  }

  const [reimb] = await db
    .select()
    .from(reimbursement)
    .where(eq(reimbursement.id, data.reimbursementId));
  if (reimb?.status !== "approved") {
    log.set({
      event: "reimbursement_not_approved",
      reimbStatus: reimb?.status ?? "not_found",
    });
    log.emit();
    return;
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

  const { generateCashVoucherPdf } =
    await import("@pi-dash/pdf/generate-voucher");
  const { paiseToWords } = await import("@pi-dash/pdf/amount-to-words");

  const pdfBuffer = await generateCashVoucherPdf({
    amountInWords: paiseToWords(amountPaise),
    amountPaise,
    approvedBy: env.VOUCHER_FINANCE_ADMIN_NAME,
    category: category?.name ?? "Uncategorized",
    date: reimb.expenseDate,
    description: lineItem.description,
    orgAddress: env.VOUCHER_ORG_ADDRESS,
    orgEmail: env.VOUCHER_ORG_EMAIL,
    orgName: env.VOUCHER_ORG_NAME,
    orgPhone: env.VOUCHER_ORG_PHONE,
    orgRegistration: env.VOUCHER_ORG_REGISTRATION,
    claimedBy: submitter?.name ?? "Unknown",
    // Vouchers from before the payee fields name the claimant, as they did.
    paidTo: lineItem.payeeName?.trim() || submitter?.name || "Unknown",
    payeePhone: lineItem.payeePhone,
    voucherNumber,
  });

  // 1. Upload new PDF to R2. If this fails the old voucher is untouched.
  const filename = `cash-voucher-${voucherNumber}.pdf`;
  const objectKey = `${env.R2_KEY_PREFIX}/vouchers/${data.reimbursementId}/${uuidv7()}-${filename}`;
  const s3 = getR2Client();
  await s3.write(objectKey, pdfBuffer, { type: "application/pdf" });

  // 2. Atomic commit: insert new attachment + swap FK + delete old row,
  //    only if the item still holds what was rendered. If this fails, the
  //    old voucher stays linked and the uploaded object is an orphan
  //    (harmless — no DB row points to it).
  const attachmentId = uuidv7();
  const committed = await commitVoucherAttachment({
    attachment: {
      filename,
      id: attachmentId,
      mimeType: "application/pdf",
      objectKey,
      reimbursementId: data.reimbursementId,
    },
    lineItemId: data.lineItemId,
    rendered: {
      amountPaise,
      categoryId: lineItem.categoryId,
      description: lineItem.description,
      expenseDate: reimb.expenseDate,
      payeeName: lineItem.payeeName,
      payeePhone: lineItem.payeePhone,
    },
  });

  if (!committed.linked) {
    // The item changed while this rendered; its edit queued a newer job.
    s3.delete(objectKey).catch((err: unknown) => {
      log.set({
        error: err instanceof Error ? err.message : String(err),
        event: "stale_r2_cleanup_failed",
      });
    });
    log.set({ event: "voucher_render_stale" });
    log.emit();
    return;
  }

  // 3. Best-effort R2 cleanup of the replaced voucher.
  const { oldR2Key } = committed;
  if (oldR2Key) {
    s3.delete(oldR2Key).catch((err: unknown) => {
      log.set({
        error: err instanceof Error ? err.message : String(err),
        event: "old_r2_cleanup_failed",
        oldR2Key,
      });
    });
    log.set({ event: "old_voucher_replaced" });
  }

  log.set({ attachmentId, event: "voucher_generated", objectKey });
  log.emit();
}

export const handleGenerateCashVoucher =
  createNotifyHandler<GenerateCashVoucherPayload>(
    "generate-cash-voucher",
    async () => generateCashVoucher
  );
