/**
 * Which of a reimbursement's files the programme lead may open: the receipts
 * they judge the claim by, never evidence of how the claimant was paid or
 * what a payee signed ("Approval policy"). Decided by structure, not by
 * file name:
 * - kept payment proof keeps its key under `approval-screenshots/`;
 * - generated cash vouchers live under `vouchers/`;
 * - a line item links its voucher, signed voucher and payee signature;
 * - every payee signature and signed voucher ever uploaded is named in the
 *   history metadata of the step that added or unlinked it, so a replaced
 *   or unlinked one stays hidden too.
 */
export function isLeadReadableReimbursementFile(file: {
  history: readonly { metadata: unknown }[];
  id: string;
  lineItems: readonly {
    payeeSignatureAttachmentId: null | string;
    signedVoucherAttachmentId: null | string;
    voucherAttachmentId: null | string;
  }[];
  objectKey: null | string;
}): boolean {
  const key = file.objectKey ?? "";
  if (key.includes("/approval-screenshots/") || key.includes("/vouchers/")) {
    return false;
  }
  const linked = file.lineItems.some(
    (item) =>
      item.payeeSignatureAttachmentId === file.id ||
      item.signedVoucherAttachmentId === file.id ||
      item.voucherAttachmentId === file.id
  );
  return !(
    linked || file.history.some((row) => mentions(row.metadata, file.id))
  );
}

const ATTACHMENT_ID_KEYS = [
  "attachmentId",
  "replacedAttachmentId",
  "unlinkedAttachmentIds",
] as const;

function mentions(metadata: unknown, id: string): boolean {
  if (typeof metadata !== "object" || metadata === null) {
    return false;
  }
  const record = metadata as Record<string, unknown>;
  return ATTACHMENT_ID_KEYS.some((key) => {
    const value = record[key];
    return Array.isArray(value) ? value.includes(id) : value === id;
  });
}
