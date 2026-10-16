import type { ClaimantDeclaration } from "@pi-dash/pdf/cash-voucher.tsx";
import { isIndianMobile } from "@pi-dash/shared/cash-voucher";

/** What the voucher printed from the line item and its request. */
export interface RenderedFrom {
  amountPaise: number;
  categoryId: string;
  /** The request's claimant, printed as "Claimed by". */
  claimantId: string;
  description: string | null;
  expenseDate: string;
  payeeName: string | null;
  payeePhone: string | null;
  /** The payee's signature printed in the Received by box, if any. */
  payeeSignatureAttachmentId: string | null;
}

/**
 * Whether the line item and its request (expense date and claimant) still
 * hold what the voucher printed, including the payee's signature. The expense date is the stored calendar day (`YYYY-MM-DD`), so
 * re-picking the same day never counts as a change.
 */
export function stillAsRendered(
  current: Omit<RenderedFrom, "claimantId" | "expenseDate"> | undefined,
  request: Pick<RenderedFrom, "claimantId" | "expenseDate"> | undefined,
  rendered: RenderedFrom
): boolean {
  return Boolean(
    current &&
    request &&
    current.amountPaise === rendered.amountPaise &&
    current.categoryId === rendered.categoryId &&
    current.description === rendered.description &&
    current.payeeName === rendered.payeeName &&
    current.payeePhone === rendered.payeePhone &&
    current.payeeSignatureAttachmentId ===
      rendered.payeeSignatureAttachmentId &&
    request.expenseDate === rendered.expenseDate &&
    request.claimantId === rendered.claimantId
  );
}

/**
 * Whether a render was refused only because the payee's signature changed.
 * Collecting a signature queues no voucher, so the job renders again.
 */
export function onlySignatureChanged(
  current: Omit<RenderedFrom, "claimantId" | "expenseDate"> | undefined,
  request: Pick<RenderedFrom, "claimantId" | "expenseDate"> | undefined,
  rendered: RenderedFrom
): boolean {
  return Boolean(
    current &&
    current.payeeSignatureAttachmentId !==
      rendered.payeeSignatureAttachmentId &&
    stillAsRendered(current, request, {
      ...rendered,
      payeeSignatureAttachmentId: current.payeeSignatureAttachmentId,
    })
  );
}

/**
 * Who the voucher prints under "Paid to". A named payee prints with the
 * mobile given for them. With no payee (the item was paid to the claimant,
 * or predates the payee fields) it prints the claimant, with the mobile on
 * their profile when it is an Indian mobile, the only kind a payee mobile
 * may be.
 */
export function voucherPayee(
  item: { payeeName: string | null; payeePhone: string | null },
  claimant: { name: string; phone: string | null } | undefined
): { paidTo: string; payeePhone: string | null } {
  const named = item.payeeName?.trim();
  if (named) {
    return { paidTo: named, payeePhone: item.payeePhone };
  }
  const phone = claimant?.phone;
  return {
    paidTo: claimant?.name || "Unknown",
    payeePhone: phone && isIndianMobile(phone) ? phone : null,
  };
}

/**
 * What a claimant-paid voucher (no named payee) prints in its Received by
 * box. The claimant declared it when they submitted the claim; when someone
 * else raised it for them (`createdBy` isn't the claimant), it says so
 * instead. The time is the submission, else the creation for claims from
 * before `submittedAt`. A named payee gets none: they sign.
 */
export function claimantDeclaration(input: {
  claimantName: string;
  creatorName: string | null | undefined;
  item: { payeeName: string | null };
  request: {
    createdAt: Date;
    createdBy: string | null;
    submittedAt: Date | null;
    userId: string;
  };
}): ClaimantDeclaration | null {
  if (input.item.payeeName?.trim()) {
    return null;
  }
  const { request } = input;
  const declaredAt = (request.submittedAt ?? request.createdAt).getTime();
  if (request.createdBy && request.createdBy !== request.userId) {
    return {
      claimantName: input.claimantName,
      creatorName: input.creatorName || "someone else",
      declaredAt,
      kind: "raised",
    };
  }
  return { claimantName: input.claimantName, declaredAt, kind: "self" };
}
